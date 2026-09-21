/**
 * Deciding which stories deserve a passenger's attention.
 *
 * Split deliberately into two stages. `checkEligibility` is a set of hard gates that
 * answer "may this story play at all" — safety, age, consent, editorial state. `scoreStory`
 * then answers the softer question of how good a choice it is. Nothing in scoring can ever
 * rescue a story that failed a gate, which is the property we want when the gates are
 * protecting a seven-year-old from a murder.
 */

import type {
  ListenerProfile,
  Story,
  StoryCategory,
} from "../types.js";
import { OPT_IN_CATEGORIES } from "../types.js";
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
  /** Epoch ms at which the story would play, for the day/night and hour rules. */
  readonly playAtMs: number;
  /** Require rendered audio. Off while authoring, on when building a route package. */
  readonly requireAudio?: boolean;
}

/**
 * The hard gates. Returns every failed gate rather than short-circuiting, because the
 * content tooling needs to tell an editor everything wrong with a story at once.
 */
export function checkEligibility(story: Story, context: EligibilityContext): EligibilityResult {
  const { profile, playAtMs } = context;
  const reasons: IneligibleReason[] = [];

  if (story.editorial !== "approved") reasons.push("not-approved");

  // A single uncorroborated source is publishable for a fun fact but the pipeline must
  // never serve something flagged as disputed or never checked at all.
  if (story.factCheck === "disputed" || story.factCheck === "unchecked") {
    reasons.push("facts-unverified");
  }

  if (profile.age < story.minAge) reasons.push("below-min-age");

  if (!profile.categories.includes(story.category)) {
    // Distinguish "they turned it off" from "they were never asked", so the UI can offer
    // to switch on a category the passenger may not know exists.
    reasons.push(
      OPT_IN_CATEGORIES.includes(story.category) ? "opt-in-required" : "category-off",
    );
  }

  // Belt and braces alongside content validation: a true-crime story without a signed
  // human review cannot play even if it somehow reached a route package.
  if (story.category === "true-crime" && !story.trueCrimeReview) {
    reasons.push("missing-true-crime-review");
  }

  if (profile.heardStoryIds?.includes(story.id)) reasons.push("already-heard");

  if (context.requireAudio && !story.audioKey) reasons.push("no-audio");

  if (story.hours && !withinHours(story, playAtMs)) reasons.push("outside-hours");

  return { eligible: reasons.length === 0, reasons };
}

function withinHours(story: Story, playAtMs: number): boolean {
  if (!story.hours) return true;
  const hour = localSolarHour(story.at, playAtMs);
  const { fromHour, toHour } = story.hours;
  // Windows may wrap midnight, e.g. 21:00–05:00 for a city-lights story.
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
}

/** Score a corridor hit in 0–1. Assumes eligibility has already been established. */
export function scoreStory(hit: CorridorHit, context: ScoreContext): ScoreBreakdown {
  const { story } = hit;

  const quality = clamp01(story.quality);
  const proximity = proximityScore(hit);
  const interest = interestScore(story, context.profile);
  const visibility = visibilityScore(story, context.playAtMs);

  const total =
    quality * SCORE_WEIGHTS.quality +
    proximity * SCORE_WEIGHTS.proximity +
    interest * SCORE_WEIGHTS.interest +
    visibility * SCORE_WEIGHTS.visibility;

  return { quality, proximity, interest, visibility, total: clamp01(total) };
}

/**
 * Closeness to the track, normalised against the story's own trigger radius.
 *
 * Deliberately not linear: within about a third of the radius the difference is
 * imperceptible to a passenger at 35,000 feet, so that band scores near-full and the
 * penalty only bites towards the edge of the corridor.
 */
function proximityScore(hit: CorridorHit): number {
  const radius = Math.max(hit.story.triggerRadiusKm, 1);
  const ratio = clamp01(hit.crossTrackKm / radius);
  return clamp01(1 - ratio ** 2);
}

function interestScore(story: Story, profile: ListenerProfile): number {
  const interests = profile.interests;
  if (!interests || !story.tags || story.tags.length === 0) return 0.5;

  let matched = 0;
  let count = 0;
  for (const tag of story.tags) {
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

function visibilityScore(story: Story, playAtMs: number): number {
  switch (story.visibility) {
    case "landmark-visible":
      // Seeing the subject is the whole magic trick, but only in daylight.
      return isDaylight(story.at, playAtMs) ? 1 : 0.55;
    case "daylight-dependent":
      return isDaylight(story.at, playAtMs) ? 0.9 : 0.1;
    case "position-only":
      return 0.6;
  }
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Categories present in a set of stories, for variety accounting in the scheduler. */
export function categoriesOf(stories: readonly Story[]): Set<StoryCategory> {
  return new Set(stories.map((s) => s.category));
}
