/**
 * Turning a corridor full of candidates into an actual flight's worth of listening.
 *
 * The naive version of this — play everything you pass, in order — produces something
 * nobody would sit through: eleven consecutive minutes of narration crossing the New York
 * metro, then ninety minutes of silence over the Atlantic, four history items in a row,
 * and the same river mentioned three times.
 *
 * So the scheduler is doing four jobs at once:
 *
 *   1. Play a story near where it belongs geographically.
 *   2. Hold the overall talk-to-silence ratio the passenger asked for.
 *   3. Vary the categories, so it feels edited rather than generated.
 *   4. Never cover the same subject twice.
 *
 * These conflict, and the resolution is a greedy walk along the timeline with a scoring
 * function that prices each compromise. Greedy is the right call here: the timeline is
 * traversed once, the passenger cannot perceive a globally optimal arrangement, and being
 * able to explain why a given story played matters more than squeezing out the last few
 * points of theoretical quality.
 */

import type {
  FlightPlan,
  ListenerProfile,
  Playlist,
  ScheduledStory,
  Story,
  StoryCategory,
  StoryFormat,
} from "../types.js";
import { DENSITY_DUTY_CYCLE } from "../types.js";
import { buildRouteGeometry, findStoriesAlongRoute, type CorridorHit } from "../geo/corridor.js";
import { FlightProfile } from "../route/profile.js";
import { checkEligibility, scoreStory } from "./score.js";

export interface PlaylistOptions {
  /** Corridor half-width in km. */
  readonly maxCrossTrackKm?: number;
  /**
   * How far, in seconds, a story may play from the moment the aircraft is actually
   * nearest it. Ten minutes is roughly 130km at cruise — comfortably inside the trigger
   * radii, so nothing plays about a place that is already well behind the wing.
   */
  readonly maxTimingDriftS?: number;
  /** Shortest silence between two stories, whatever the duty cycle implies. */
  readonly minGapS?: number;
  /** Cap on the reserve set, which the client draws on when filters change in flight. */
  readonly reserveLimit?: number;
  /** Require rendered audio. On for route packages, off while authoring. */
  readonly requireAudio?: boolean;
}

const DEFAULTS = {
  maxTimingDriftS: 600,
  minGapS: 45,
  reserveLimit: 120,
} as const;

/** Penalties, in score points, for the compromises the scheduler is allowed to make. */
const PENALTY = {
  /** Applied in full at maximum timing drift, tapering to zero at perfect placement. */
  drift: 0.3,
  /** Same category as the story just played. */
  sameCategoryImmediate: 0.28,
  /** Same category as two stories ago. */
  sameCategoryRecent: 0.12,
  /** Same format three times running — all short, or all features. */
  sameFormatRun: 0.08,
  /**
   * Leaving the passenger in silence while waiting for a better story later.
   *
   * Without this the scheduler degenerates: a candidate placed at its ideal time in the
   * future has *zero* timing drift, so the highest-scoring story in the whole remaining
   * flight always wins and everything before it is skipped. Pricing dead air makes the
   * choice what it should be — a good story now, or a better one worth waiting for —
   * and it still lets the scheduler wait when there is genuinely nothing to play.
   */
  deadAir: 0.35,
} as const;

/** Wait beyond this, in seconds, and the dead-air penalty is applied in full. */
const DEAD_AIR_HORIZON_S = 600;

interface Candidate {
  readonly hit: CorridorHit;
  readonly nearestS: number;
  readonly score: number;
}

export function buildPlaylist(
  plan: FlightPlan,
  stories: readonly Story[],
  listener: ListenerProfile,
  options: PlaylistOptions = {},
): Playlist {
  const maxTimingDriftS = options.maxTimingDriftS ?? DEFAULTS.maxTimingDriftS;
  const minGapS = options.minGapS ?? DEFAULTS.minGapS;

  const geometry = buildRouteGeometry(plan);
  const profile = FlightProfile.forPlan(plan, geometry);
  const departureMs = Date.parse(plan.departureAt);
  if (Number.isNaN(departureMs)) {
    throw new Error(`Flight plan ${plan.id} has an unparseable departureAt`);
  }

  const window = profile.listeningWindow();
  const dutyCycle = DENSITY_DUTY_CYCLE[listener.density ?? "balanced"];

  // --- Stage 1: which stories does this flight pass, and may they play? ---------------
  const candidates: Candidate[] = [];
  for (const hit of findStoriesAlongRoute(plan, stories, {
    maxCrossTrackKm: options.maxCrossTrackKm,
  })) {
    const nearestS = profile.timeAtDistance(hit.alongTrackKm);
    const playAtMs = departureMs + nearestS * 1000;

    const eligibility = checkEligibility(hit.story, {
      profile: listener,
      playAtMs,
      requireAudio: options.requireAudio,
    });
    if (!eligibility.eligible) continue;

    const score = scoreStory(hit, { profile: listener, playAtMs }).total;
    candidates.push({ hit, nearestS, score });
  }

  // --- Stage 2: walk the timeline ----------------------------------------------------
  const items: ScheduledStory[] = [];
  const used = new Set<string>();
  /** Subjects already covered, so a related story never follows its sibling. */
  const coveredSubjects = new Set<string>();
  const recentCategories: StoryCategory[] = [];
  let recentFormatRun = 0;
  let lastFormat: StoryFormat | null = null;

  let cursor = window.startS;

  while (cursor < window.endS) {
    let best: { candidate: Candidate; startS: number; adjusted: number } | null = null;

    for (const candidate of candidates) {
      const { story } = candidate.hit;
      if (used.has(story.id) || coveredSubjects.has(story.id)) continue;

      const duration = story.durationS;

      // Aim to have the story's midpoint land when the aircraft is nearest it, so the
      // narration is still running as the passenger looks down at the thing described.
      const ideal = candidate.nearestS - duration / 2;
      const startS = Math.max(cursor, ideal);

      if (startS + duration > window.endS) continue;

      const drift = Math.abs(startS + duration / 2 - candidate.nearestS);
      if (drift > maxTimingDriftS) continue;

      const silence = Math.max(0, startS - cursor);

      // Annotated, not inferred: this value decides `best`, from which `cursor` and the
      // variety counters are reassigned — and those feed back into this very expression.
      // Without an explicit type TypeScript cannot break the cycle.
      const adjusted: number =
        candidate.score -
        PENALTY.drift * (drift / maxTimingDriftS) -
        PENALTY.deadAir * Math.min(1, silence / DEAD_AIR_HORIZON_S) -
        categoryPenalty(story.category, recentCategories) -
        formatPenalty(story.format, lastFormat, recentFormatRun);

      if (!best || adjusted > best.adjusted) {
        best = { candidate, startS, adjusted };
      }
    }

    if (!best) {
      // Nothing can play at the cursor. Jump to the earliest point at which some
      // unplayed candidate becomes viable, rather than crawling forward in small steps
      // through an empty stretch of ocean.
      const next = nextViableTime(
        candidates,
        used,
        coveredSubjects,
        cursor,
        window.endS,
        maxTimingDriftS,
      );
      // Strict progress or stop. `nextViableTime` applies the same constraints as the
      // loop above, so a value that fails to advance the cursor would mean the two had
      // disagreed — and would spin forever rather than fail.
      if (next === null || next <= cursor) break;
      cursor = next;
      continue;
    }

    const { candidate, startS } = best;
    const { story } = candidate.hit;
    const endS = startS + story.durationS;

    items.push({
      story,
      startS,
      endS,
      nearestS: candidate.nearestS,
      crossTrackKm: candidate.hit.crossTrackKm,
      score: candidate.score,
    });

    used.add(story.id);
    for (const relatedId of story.relatedIds ?? []) coveredSubjects.add(relatedId);

    recentCategories.unshift(story.category);
    if (recentCategories.length > 2) recentCategories.pop();

    recentFormatRun = story.format === lastFormat ? recentFormatRun + 1 : 0;
    lastFormat = story.format;

    // Silence sized to hold the requested talk-to-silence ratio. A passenger on "light"
    // gets long stretches of window-staring; "immersive" barely pauses for breath.
    const gap = Math.max(minGapS, story.durationS * (1 / dutyCycle - 1));
    cursor = endS + gap;
  }

  // --- Stage 3: the reserve ----------------------------------------------------------
  // Everything eligible that did not make the cut, best first. ADR-0003: the package ships
  // with far more than one flight can play, so a passenger who skips, or switches on true
  // crime at the halfway point, has material waiting without a network call.
  const reserve = candidates
    .filter((c) => !used.has(c.hit.story.id))
    .sort((a, b) => b.score - a.score)
    .slice(0, options.reserveLimit ?? DEFAULTS.reserveLimit)
    .map((c) => c.hit.story);

  return {
    flightId: plan.id,
    items,
    reserve,
    totalAudioS: items.reduce((sum, item) => sum + item.story.durationS, 0),
    flightDurationS: plan.durationS,
  };
}

function categoryPenalty(
  category: StoryCategory,
  recent: readonly StoryCategory[],
): number {
  if (recent[0] === category) return PENALTY.sameCategoryImmediate;
  if (recent[1] === category) return PENALTY.sameCategoryRecent;
  return 0;
}

function formatPenalty(format: StoryFormat, lastFormat: StoryFormat | null, run: number): number {
  return format === lastFormat && run >= 1 ? PENALTY.sameFormatRun : 0;
}

/**
 * Earliest time at which any unplayed candidate could legally start.
 *
 * This must apply exactly the constraints the scheduling loop applies. If it were more
 * permissive it would hand back a time the loop then rejects, and the walk would never
 * advance.
 */
function nextViableTime(
  candidates: readonly Candidate[],
  used: ReadonlySet<string>,
  covered: ReadonlySet<string>,
  cursor: number,
  windowEndS: number,
  maxTimingDriftS: number,
): number | null {
  let earliest: number | null = null;

  for (const candidate of candidates) {
    const { story } = candidate.hit;
    if (used.has(story.id) || covered.has(story.id)) continue;

    const ideal = candidate.nearestS - story.durationS / 2;
    // The latest start that still lands within the drift budget; if that is already past,
    // this candidate is behind us for good.
    const latestStart = candidate.nearestS + maxTimingDriftS - story.durationS / 2;
    if (latestStart < cursor) continue;

    const start = Math.max(cursor, ideal);
    // Same window check as the scheduling loop: a story that cannot finish before the
    // descent is not a reason to move the cursor.
    if (start + story.durationS > windowEndS) continue;

    if (earliest === null || start < earliest) earliest = start;
  }

  return earliest;
}
