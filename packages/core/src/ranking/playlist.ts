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
 *   1. Play an echo near where it belongs geographically.
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
   * How far, in seconds, an echo may play from the moment the listener is actually nearest
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
   * The same narrator twice running.
   *
   * Deliberately gentle. With two voices in the cast, roughly half of every candidate set
   * shares the last one, so a firm penalty would start reordering the walk to serve the
   * voices — and geography has to win that argument. This is enough to break a tie between
   * two otherwise similar echoes, and not enough to play something in the wrong place.
   */
  sameVoiceRun: 0.1,
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
 * The wait at which the dead-air penalty reaches full strength, as a multiple of the mode's
 * timing tolerance — and, past that, keeps growing, because the penalty is deliberately
 * **uncapped**.
 *
 * The uncapping is the part that matters. Capped, the penalty stopped discriminating as
 * soon as it saturated: on a walking tour, where echoes are minutes apart and the tolerance
 * is ninety seconds, every candidate sat beyond the horizon and waiting four minutes scored
 * exactly the same as waiting twenty. The variety rules then decided between them, and a
 * real Lower Manhattan walk came out with a twenty-two minute silence in the middle of it.
 * Letting it grow without limit is the honest model: waiting twice as long genuinely is
 * twice as bad, and there is no point past which further silence stops mattering.
 *
 * The ratio itself stays at one, which is worth recording because raising it looked like
 * part of the same fix and was not. This number is the *slope* of the penalty, and
 * flattening it is exactly as harmful as capping it — at four, a transatlantic flight lost
 * a fifth of its echoes and its median gap went from forty-eight seconds to three minutes,
 * while the walk it was meant to help was unaffected. Uncapping alone fixed the walk; the
 * flight then scheduled more than it ever had.
 */
const DEAD_AIR_HORIZON_RATIO = 1;

/**
 * How quickly the variety rules stop mattering as the wait grows.
 *
 * Variety is a tiebreaker between echoes playable *now*. It is not a reason to stand in
 * silence: "same category, available immediately" should beat "different category, five
 * minutes away", and the old weighting had that backwards — a 0.28 category penalty was
 * enough to skip an echo entirely rather than merely reorder two.
 *
 * Eight, which is gentle. Uncapping the dead-air penalty already prevents the skipping on
 * its own — waiting five minutes now costs far more than any variety rule can save — so
 * this only has to stop variety mattering at the extremes. Fading it out aggressively
 * instead switched variety off entirely on a walking route, and three echoes in the same
 * voice ran back to back.
 */
const VARIETY_FADE_RATIO = 8;

/**
 * Turn a mode's timing tolerance into the distance tolerance it was always standing in for.
 *
 * Every drift number in the preset table was reasoned about as a distance and then written
 * down as a time: ninety seconds on foot "is roughly a hundred metres", ten minutes in the
 * air "is a fifth of the way across a state". Doing the conversion explicitly, and then
 * asking the route profile how far the listener actually moved, costs nothing and fixes the
 * case the time version gets badly wrong — standing still.
 *
 * A walker who has stopped at Bowling Green for three minutes has not walked past anything,
 * so a second echo about Bowling Green should still be allowed to play. Measured in seconds
 * it is three minutes stale and rejected; measured in metres it is exactly where it belongs.
 * That is the difference between a dense, interesting corner carrying two stories and
 * carrying one.
 */
function driftToleranceKm(maxTimingDriftS: number, speedKph: number): number {
  return (maxTimingDriftS * speedKph) / 3600;
}

/**
 * Bonus for an echo whose chance to play is nearly gone.
 *
 * Greedy scheduling weighs "this one now" against "that one shortly", and on its own it
 * never notices that choosing the second forfeits the first. On the real walk that cost
 * the Wall Street echo entirely: the scheduler declined to play it at zero drift in order
 * to wait eighty-three seconds for Trinity Church, and by the time Trinity finished the
 * listener was past the wall and it could never play again.
 *
 * Preferring the echo that is about to expire is how an editor thinks — take the one you
 * are about to lose, the other will keep — and it is cheap, because an echo with a wide
 * open window loses nothing by yielding. Sized below the dead-air penalty so it breaks
 * ties and near-ties without ever being a reason to sit in silence.
 */
const URGENCY_BONUS = 0.25;

interface Candidate {
  readonly hit: CorridorHit;
  readonly nearestS: number;
  readonly score: number;
  /**
   * The latest start at which this echo still lands within the drift budget — the moment
   * the listener is a tolerance-width beyond the place it describes. Past this it is
   * behind them for good.
   */
  readonly expiresS: number;
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
  const maxDriftKm = driftToleranceKm(maxTimingDriftS, preset.speedKph);

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
    const expiresS =
      profile.timeAtDistance(hit.alongTrackKm + maxDriftKm) - anchorOffsetS(hit.echo.durationS);
    candidates.push({ hit, nearestS, score, expiresS });
  }

  // --- Stage 2: walk the timeline ----------------------------------------------------
  const scarcity = categoryScarcity(candidates);
  const items: ScheduledEcho[] = [];
  const used = new Set<string>();
  /** Subjects already covered, so a related echo never follows its sibling. */
  const coveredSubjects = new Set<string>();
  const recentCategories: EchoCategory[] = [];
  let recentFormatRun = 0;
  let lastFormat: EchoFormat | null = null;
  let lastVoice: string | null = null;

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

      // How far the listener has moved from the echo's place by the time its anchor lands.
      // Not how long: on a route with stops the two part company, and distance is the one
      // that decides whether the thing being described is still in front of them.
      const driftKm = Math.abs(
        profile.distanceAtTime(startS + anchor) - candidate.hit.alongTrackKm,
      );
      if (driftKm > maxDriftKm) continue;

      const silence = Math.max(0, startS - cursor);

      // Variety is a tiebreaker among what is playable now, so its weight falls away as the
      // wait grows. Without this, avoiding two of a category costs more than several minutes
      // of silence, and the scheduler skips echoes rather than reordering them.
      const varietyWeight = Math.max(0, 1 - silence / (maxTimingDriftS * VARIETY_FADE_RATIO));

      // Has something already played that this echo answers?
      const offersPerspective = (echo.perspectiveIds ?? []).some((id) => used.has(id));

      // How nearly out of time this echo is, from 0 (window wide open) to 1 (last chance).
      const urgency = Math.min(
        1,
        Math.max(0, 1 - (candidate.expiresS - startS) / deadAirHorizonS),
      );

      // Annotated, not inferred: this value decides `best`, from which `cursor` and the
      // variety counters are reassigned — and those feed back into this very expression.
      // Without an explicit type TypeScript cannot break the cycle.
      const adjusted: number =
        candidate.score +
        (offersPerspective ? PERSPECTIVE_BONUS : 0) +
        URGENCY_BONUS * urgency -
        PENALTY.drift * (driftKm / maxDriftKm) -
        PENALTY.deadAir * (silence / deadAirHorizonS) -
        varietyWeight *
          (categoryPenalty(echo.category, recentCategories, scarcity) +
            formatPenalty(echo.format, lastFormat, recentFormatRun) +
            (lastVoice !== null && echo.voice === lastVoice ? PENALTY.sameVoiceRun : 0));

      if (!best || adjusted > best.adjusted) {
        best = { candidate, startS, adjusted };
      }
    }

    if (!best) {
      // Nothing can play at the cursor. Jump to the earliest point at which some
      // unplayed candidate becomes viable, rather than crawling forward in small steps
      // through an empty stretch of ocean.
      const next = nextViableTime(candidates, used, coveredSubjects, cursor, window.endS);
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
    lastVoice = echo.voice ?? null;

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
  scarcity: ReadonlyMap<EchoCategory, number>,
): number {
  const weight = scarcity.get(category) ?? 1;
  if (recent[0] === category) return PENALTY.sameCategoryImmediate * weight;
  if (recent[1] === category) return PENALTY.sameCategoryRecent * weight;
  return 0;
}

/**
 * How much repeating each category actually costs on *this* route, from 0 to 1.
 *
 * Variety is a choice, and a choice needs alternatives. A transatlantic corridor offers
 * six categories in rough balance, so playing two history echoes in a row is a decision
 * worth pricing. A themed walking tour is the opposite case: eleven of the twelve echoes
 * on the Lower Manhattan walk are history, because the walk is *about* history, and
 * insisting on a change of subject asks for something the corridor cannot supply.
 *
 * Charging the flat penalty anyway is not merely wasteful, it actively damages the tour.
 * Measured on the real route it bought a kids echo eight minutes early at the price of
 * eight minutes of silence, and pushed the Fraunces Tavern echo out of its own dwell and
 * off the walk entirely — a worse outcome on every axis, in the name of a variety nobody
 * could have noticed.
 *
 * So the penalty is scaled by the share of the corridor that is *not* this category. At
 * 11-of-12 the weight is 0.08 and repetition is effectively free; at an even spread it is
 * close to full strength and nothing about the old behaviour changes.
 */
function categoryScarcity(candidates: readonly Candidate[]): ReadonlyMap<EchoCategory, number> {
  const counts = new Map<EchoCategory, number>();
  for (const candidate of candidates) {
    const { category } = candidate.hit.echo;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  const weights = new Map<EchoCategory, number>();
  const total = candidates.length;
  if (total === 0) return weights;
  for (const [category, count] of counts) {
    weights.set(category, 1 - count / total);
  }
  return weights;
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
): number | null {
  let earliest: number | null = null;

  for (const candidate of candidates) {
    const { echo } = candidate.hit;
    if (used.has(echo.id) || covered.has(echo.id)) continue;

    const anchor = anchorOffsetS(echo.durationS);
    const ideal = candidate.nearestS - anchor;
    if (candidate.expiresS < cursor) continue;

    const start = Math.max(cursor, ideal);
    // Same window check as the scheduling loop: an echo that cannot finish before the
    // descent is not a reason to move the cursor.
    if (start + echo.durationS > windowEndS) continue;

    if (earliest === null || start < earliest) earliest = start;
  }

  return earliest;
}
