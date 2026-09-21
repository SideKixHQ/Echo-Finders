/**
 * Deciding which echoes deserve a passenger's attention.
 *
 * Split deliberately into two stages. `checkEligibility` is a set of hard gates that
 * answer "may this echo play at all" — safety, age, consent, editorial state. `scoreEcho`
 * then answers the softer question of how good a choice it is. Nothing in scoring can ever
 * rescue an echo that failed a gate, which is the property we want when the gates are
 * protecting a seven-year-old from a murder.
 */

import type {
  ListenerProfile,
  Echo,
  EchoCategory,
  TravelMode,
} from "../types.js";
import { isOnFoot, OPT_IN_CATEGORIES } from "../types.js";
import { isDaylight, localSolarHour } from "../geo/solar.js";
import type { CorridorHit } from "../geo/corridor.js";

export type IneligibleReason =
  | "not-approved"
  | "facts-unverified"
  | "below-min-age"
  | "category-off"
  | "opt-in-required"
  | "missing-true-crime-review"
  | "already-heard"
  | "no-audio"
  | "outside-hours";

export interface EligibilityResult {
  readonly eligible: boolean;
  readonly reasons: readonly IneligibleReason[];
}

export interface EligibilityContext {
  readonly profile: ListenerProfile;
  /** Epoch ms at which the echo would play, for the day/night and hour rules. */
  readonly playAtMs: number;
  /** Require rendered audio. Off while authoring, on when building a route package. */
  readonly requireAudio?: boolean;
}

/**
 * The hard gates. Returns every failed gate rather than short-circuiting, because the
 * content tooling needs to tell an editor everything wrong with an echo at once.
 */
export function checkEligibility(echo: Echo, context: EligibilityContext): EligibilityResult {
  const { profile, playAtMs } = context;
  const reasons: IneligibleReason[] = [];

  if (echo.editorial !== "approved") reasons.push("not-approved");

  // A single uncorroborated source is publishable for a fun fact but the pipeline must
  // never serve something flagged as disputed or never checked at all.
  if (echo.factCheck === "disputed" || echo.factCheck === "unchecked") {
    reasons.push("facts-unverified");
  }

  if (profile.age < echo.minAge) reasons.push("below-min-age");

  if (!profile.categories.includes(echo.category)) {
    // Distinguish "they turned it off" from "they were never asked", so the UI can offer
    // to switch on a category the passenger may not know exists.
    reasons.push(
      OPT_IN_CATEGORIES.includes(echo.category) ? "opt-in-required" : "category-off",
    );
  }

  // Belt and braces alongside content validation: a true-crime echo without a signed
  // human review cannot play even if it somehow reached a route package.
  if (echo.category === "true-crime" && !echo.trueCrimeReview) {
    reasons.push("missing-true-crime-review");
  }

  if (profile.heardEchoIds?.includes(echo.id)) reasons.push("already-heard");

  if (context.requireAudio && !echo.audioKey) reasons.push("no-audio");

  if (echo.hours && !withinHours(echo, playAtMs)) reasons.push("outside-hours");

  return { eligible: reasons.length === 0, reasons };
}

function withinHours(echo: Echo, playAtMs: number): boolean {
  if (!echo.hours) return true;
  const hour = localSolarHour(echo.point.at, playAtMs);
  const { fromHour, toHour } = echo.hours;
  // Windows may wrap midnight, e.g. 21:00–05:00 for a city-lights echo.
  return fromHour <= toHour
    ? hour >= fromHour && hour <= toHour
    : hour >= fromHour || hour <= toHour;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export interface ScoreBreakdown {
  readonly quality: number;
  readonly proximity: number;
  readonly interest: number;
  readonly visibility: number;
  readonly total: number;
}

/**
 * Weights are intentionally exported and modest in number. This is the part of the system
 * most likely to need tuning against real listening data, and it should be possible to
 * reason about a change without reading the code.
 */
export const SCORE_WEIGHTS = {
  quality: 0.4,
  proximity: 0.25,
  interest: 0.2,
  visibility: 0.15,
} as const;

export interface ScoreContext {
  readonly profile: ListenerProfile;
  readonly playAtMs: number;
  /**
   * How the listener is moving. This changes the *meaning* of an echo's visibility class,
   * not merely its weight: a blue plaque is the best possible echo on foot and a
   * pointless one from 35,000 feet.
   */
  readonly mode: TravelMode;
}

/** Score a corridor hit in 0–1. Assumes eligibility has already been established. */
export function scoreEcho(hit: CorridorHit, context: ScoreContext): ScoreBreakdown {
  const { echo } = hit;

  const quality = clamp01(echo.quality);
  const proximity = proximityScore(hit);
  const interest = interestScore(echo, context.profile);
  const visibility = visibilityScore(echo, context.playAtMs, context.mode);

  const total =
    quality * SCORE_WEIGHTS.quality +
    proximity * SCORE_WEIGHTS.proximity +
    interest * SCORE_WEIGHTS.interest +
    visibility * SCORE_WEIGHTS.visibility;

  return { quality, proximity, interest, visibility, total: clamp01(total) };
}

/**
 * Closeness to the track, normalised against the echo's own trigger radius.
 *
 * Deliberately not linear: within about a third of the radius the difference is
 * imperceptible to a passenger at 35,000 feet, so that band scores near-full and the
 * penalty only bites towards the edge of the corridor.
 */
function proximityScore(hit: CorridorHit): number {
  const radius = Math.max(hit.echo.point.triggerRadiusKm, 1);
  const ratio = clamp01(hit.crossTrackKm / radius);
  return clamp01(1 - ratio ** 2);
}

function interestScore(echo: Echo, profile: ListenerProfile): number {
  const interests = profile.interests;
  if (!interests || !echo.tags || echo.tags.length === 0) return 0.5;

  let matched = 0;
  let count = 0;
  for (const tag of echo.tags) {
    const affinity = interests[tag];
    if (affinity !== undefined) {
      matched += clamp01(affinity);
      count += 1;
    }
  }

  // No overlap is neutral, not bad: an unmatched tag means we have no signal, and
  // punishing that would collapse the library down to whatever the passenger tapped
  // during a ten-second onboarding.
  return count === 0 ? 0.5 : clamp01(matched / count);
}

function visibilityScore(echo: Echo, playAtMs: number, mode: TravelMode): number {
  const daylight = isDaylight(echo.point.at, playAtMs);

  switch (echo.visibility) {
    case "landmark-visible":
      // Seeing the subject is the whole magic trick, but only in daylight.
      return daylight ? 1 : 0.55;

    case "at-hand":
      // The sharpest mode interaction in the system. Standing in front of the house where
      // something happened is the most powerful thing this product does; being seven miles
      // above it is the least. Suppressing rather than merely demoting it matters, because
      // a dense city centre holds hundreds of at-hand echoes and a flight crossing it
      // would otherwise fill with plaques nobody can see.
      if (isOnFoot(mode)) return daylight ? 1 : 0.85;
      if (mode === "driving") return daylight ? 0.45 : 0.3;
      if (mode === "rail") return daylight ? 0.3 : 0.2;
      return 0.05;

    case "daylight-dependent":
      return daylight ? 0.9 : 0.1;

    case "position-only":
      return 0.6;
  }
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Categories present in a set of echoes, for variety accounting in the scheduler. */
export function categoriesOf(echoes: readonly Echo[]): Set<EchoCategory> {
  return new Set(echoes.map((s) => s.category));
}
