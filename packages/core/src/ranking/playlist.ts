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
 *   1. Play a echo near where it belongs geographically.
 *   2. Hold the overall talk-to-silence ratio the passenger asked for.
 *   3. Vary the categories, so it feels edited rather than generated.
 *   4. Never cover the same subject twice.
 *
 * These conflict, and the resolution is a greedy walk along the timeline with a scoring
 * function that prices each compromise. Greedy is the right call here: the timeline is
 * traversed once, the passenger cannot perceive a globally optimal arrangement, and being
 * able to explain why a given echo played matters more than squeezing out the last few
 * points of theoretical quality.
 */

import type {
  Route,
  ListenerProfile,
  Playlist,
  ScheduledEcho,
  Echo,
  EchoCategory,
  EchoFormat,
} from "../types.js";
import { anchorOffsetS } from "../types.js";
import { dutyCycleFor, presetFor } from "../modes.js";
import { buildRouteGeometry, findEchoesAlongRoute, type CorridorHit } from "../geo/corridor.js";
import { RouteProfile } from "../route/profile.js";
import { checkEligibility, scoreEcho } from "./score.js";

export interface PlaylistOptions {
  /** Corridor half-width in km. Defaults to the mode preset. */
  readonly maxCrossTrackKm?: number;
  /**
   * How far, in seconds, a echo may play from the moment the listener is actually nearest
   * it. Defaults to the mode preset, where the spread is enormous: ten minutes on a flight
   * is comfortably inside the trigger radii, while ninety seconds is already generous on
   * foot.
   */
  readonly maxTimingDriftS?: number;
  /** Shortest silence between two echoes, whatever the duty cycle implies. Mode default. */
  readonly minGapS?: number;
  /** Cap on the reserve set, which the client draws on when filters change in flight. */
  readonly reserveLimit?: number;
  /** Require rendered audio. On for route packages, off while authoring. */
  readonly requireAudio?: boolean;
}

const DEFAULTS = {
  reserveLimit: 120,
} as const;

/** Penalties, in score points, for the compromises the scheduler is allowed to make. */
const PENALTY = {
  /** Applied in full at maximum timing drift, tapering to zero at perfect placement. */
  drift: 0.3,
  /** Same category as the echo just played. */
  sameCategoryImmediate: 0.28,
  /** Same category as two echoes ago. */
  sameCategoryRecent: 0.12,
  /** Same format three times running — all short, or all features. */
  sameFormatRun: 0.08,
  /**
   * Leaving the passenger in silence while waiting for a better echo later.
   *
   * Without this the scheduler degenerates: a candidate placed at its ideal time in the
   * future has *zero* timing drift, so the highest-scoring echo in the whole remaining
   * flight always wins and everything before it is skipped. Pricing dead air makes the
   * choice what it should be — a good echo now, or a better one worth waiting for —
   * and it still lets the scheduler wait when there is genuinely nothing to play.
   */
  deadAir: 0.35,
} as const;

/**
 * Bonus for an echo that gives a second vantage point on something already played.
 *
 * The mirror image of the duplicate-suppression below it, and the more interesting half:
 * hearing the company's account of a strike and then the strikers' is more truthful than
 * hearing whichever happens to be better documented. Sized to outweigh the
 * same-category penalty, since a counterpoint is usually filed under the same category as
 * the account it answers — otherwise variety rules would quietly veto exactly the pairing
 * we want.
 */
const PERSPECTIVE_BONUS = 0.34;

/**
 * Wait beyond this fraction of the mode's timing tolerance and the dead-air penalty
 * applies in full. Tied to the mode rather than fixed, so a walking tour does not treat a
 * ten-minute silence as a minor inconvenience.
 */
const DEAD_AIR_HORIZON_RATIO = 1;

interface Candidate {
  readonly hit: CorridorHit;
  readonly nearestS: number;
  readonly score: number;
}

export function buildPlaylist(
  plan: Route,
  echoes: readonly Echo[],
  listener: ListenerProfile,
  options: PlaylistOptions = {},
): Playlist {
  const preset = presetFor(plan.mode);
  const maxTimingDriftS = options.maxTimingDriftS ?? preset.maxTimingDriftS;
  const minGapS = options.minGapS ?? preset.minGapS;

  const geometry = buildRouteGeometry(plan);
  const profile = RouteProfile.forRoute(plan, geometry);
  const departureMs = Date.parse(plan.departureAt);
  if (Number.isNaN(departureMs)) {
    throw new Error(`Flight plan ${plan.id} has an unparseable departureAt`);
  }

  const window = profile.listeningWindow();
  const deadAirHorizonS = maxTimingDriftS * DEAD_AIR_HORIZON_RATIO;
  const dutyCycle = dutyCycleFor(plan.mode, listener.density);

  // --- Stage 1: which echoes does this flight pass, and may they play? ---------------
  const candidates: Candidate[] = [];
  for (const hit of findEchoesAlongRoute(plan, echoes, {
    maxCrossTrackKm: options.maxCrossTrackKm,
  })) {
    const nearestS = profile.timeAtDistance(hit.alongTrackKm);
    const playAtMs = departureMs + nearestS * 1000;

    const eligibility = checkEligibility(hit.echo, {
      profile: listener,
      playAtMs,
      requireAudio: options.requireAudio,
    });
    if (!eligibility.eligible) continue;

    const score = scoreEcho(hit, { profile: listener, playAtMs, mode: plan.mode }).total;
    candidates.push({ hit, nearestS, score });
  }

  // --- Stage 2: walk the timeline ----------------------------------------------------
  const items: ScheduledEcho[] = [];
  const used = new Set<string>();
  /** Subjects already covered, so a related echo never follows its sibling. */
  const coveredSubjects = new Set<string>();
  const recentCategories: EchoCategory[] = [];
  let recentFormatRun = 0;
  let lastFormat: EchoFormat | null = null;

  let cursor = window.startS;

  while (cursor < window.endS) {
    let best: { candidate: Candidate; startS: number; adjusted: number } | null = null;

    for (const candidate of candidates) {
      const { echo } = candidate.hit;
      if (used.has(echo.id) || coveredSubjects.has(echo.id)) continue;

      const duration = echo.durationS;

      // Land the echo's anchor — its "you are here" moment — when the listener is
      // actually nearest it.
      //
      // For a short echo the anchor is its midpoint, so the narration is still running as
      // they look at the thing described. For a long one it cannot be: a ten-minute
      // feature at cruise spans 1,400km, and centring it would mean beginning five minutes
      // before the place comes into view and ending five minutes after it is gone. Long
      // echoes are anchored just after their opening instead, and are allowed to run on
      // into whatever comes next — which is how a documentary works anyway.
      const anchor = anchorOffsetS(duration);
      const ideal = candidate.nearestS - anchor;
      const startS = Math.max(cursor, ideal);

      if (startS + duration > window.endS) continue;

      const drift = Math.abs(startS + anchor - candidate.nearestS);
      if (drift > maxTimingDriftS) continue;

      const silence = Math.max(0, startS - cursor);

      // Annotated, not inferred: this value decides `best`, from which `cursor` and the
      // variety counters are reassigned — and those feed back into this very expression.
      // Without an explicit type TypeScript cannot break the cycle.
      // Has something already played that this echo answers?
      const offersPerspective = (echo.perspectiveIds ?? []).some((id) => used.has(id));

      const adjusted: number =
        candidate.score +
        (offersPerspective ? PERSPECTIVE_BONUS : 0) -
        PENALTY.drift * (drift / maxTimingDriftS) -
        PENALTY.deadAir * Math.min(1, silence / deadAirHorizonS) -
        categoryPenalty(echo.category, recentCategories) -
        formatPenalty(echo.format, lastFormat, recentFormatRun);

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
    const { echo } = candidate.hit;
    const endS = startS + echo.durationS;

    items.push({
      echo,
      startS,
      endS,
      nearestS: candidate.nearestS,
      crossTrackKm: candidate.hit.crossTrackKm,
      score: candidate.score,
    });

    used.add(echo.id);
    for (const relatedId of echo.relatedIds ?? []) coveredSubjects.add(relatedId);

    recentCategories.unshift(echo.category);
    if (recentCategories.length > 2) recentCategories.pop();

    recentFormatRun = echo.format === lastFormat ? recentFormatRun + 1 : 0;
    lastFormat = echo.format;

    // Silence sized to hold the requested talk-to-silence ratio. A passenger on "light"
    // gets long stretches of window-staring; "immersive" barely pauses for breath.
    const gap = Math.max(minGapS, echo.durationS * (1 / dutyCycle - 1));
    cursor = endS + gap;
  }

  // --- Stage 3: the reserve ----------------------------------------------------------
  // Everything eligible that did not make the cut, best first. ADR-0003: the package ships
  // with far more than one flight can play, so a passenger who skips, or switches on true
  // crime at the halfway point, has material waiting without a network call.
  const reserve = candidates
    .filter((c) => !used.has(c.hit.echo.id))
    .sort((a, b) => b.score - a.score)
    .slice(0, options.reserveLimit ?? DEFAULTS.reserveLimit)
    .map((c) => c.hit.echo);

  return {
    routeId: plan.id,
    items,
    reserve,
    totalAudioS: items.reduce((sum, item) => sum + item.echo.durationS, 0),
    routeDurationS: plan.durationS,
    mode: plan.mode,
  };
}

function categoryPenalty(
  category: EchoCategory,
  recent: readonly EchoCategory[],
): number {
  if (recent[0] === category) return PENALTY.sameCategoryImmediate;
  if (recent[1] === category) return PENALTY.sameCategoryRecent;
  return 0;
}

function formatPenalty(format: EchoFormat, lastFormat: EchoFormat | null, run: number): number {
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
    const { echo } = candidate.hit;
    if (used.has(echo.id) || covered.has(echo.id)) continue;

    const anchor = anchorOffsetS(echo.durationS);
    const ideal = candidate.nearestS - anchor;
    // The latest start that still lands within the drift budget; if that is already past,
    // this candidate is behind us for good.
    const latestStart = candidate.nearestS + maxTimingDriftS - anchor;
    if (latestStart < cursor) continue;

    const start = Math.max(cursor, ideal);
    // Same window check as the scheduling loop: a echo that cannot finish before the
    // descent is not a reason to move the cursor.
    if (start + echo.durationS > windowEndS) continue;

    if (earliest === null || start < earliest) earliest = start;
  }

  return earliest;
}
