/**
 * The gate every story passes before it can reach a passenger.
 *
 * This runs in CI against the content library (ADR-0005), so a story that breaks a rule
 * fails the build rather than reaching an aircraft. The rules encode editorial policy, not
 * programmer taste, and each one exists because getting it wrong has a specific cost:
 * a defamation claim, a frightened child, an airline pulling the product mid-contract.
 */

import type { Story } from "../types.js";
import { NOMINAL_DURATION_S, STORY_CATEGORIES } from "../types.js";

export type Severity = "error" | "warning";

export interface ValidationIssue {
  readonly storyId: string;
  readonly severity: Severity;
  readonly field: string;
  readonly message: string;
}

/** The lowest age at which true crime may be offered at all, irrespective of settings. */
export const TRUE_CRIME_MIN_AGE = 16;

/** How far a rendered audio file may stray from its format's nominal length. */
const DURATION_TOLERANCE = 0.6;

export function validateStory(story: Story): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const error = (field: string, message: string) =>
    issues.push({ storyId: story.id, severity: "error", field, message });
  const warn = (field: string, message: string) =>
    issues.push({ storyId: story.id, severity: "warning", field, message });

  // --- Identity and shape ------------------------------------------------------------
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(story.id)) {
    error("id", "must be lowercase kebab-case so it is stable in file paths and URLs");
  }
  if (story.title.trim().length === 0) error("title", "is required");
  if (story.summary.trim().length === 0) error("summary", "is required for the map pin");
  if (story.summary.length > 140) {
    warn("summary", `is ${story.summary.length} chars; map pins truncate past ~140`);
  }
  if (!STORY_CATEGORIES.includes(story.category)) {
    error("category", `"${story.category}" is not a known category`);
  }

  // --- Geography ---------------------------------------------------------------------
  if (story.at.lat < -90 || story.at.lat > 90) error("at.lat", "must be between -90 and 90");
  if (story.at.lng < -180 || story.at.lng > 180) {
    error("at.lng", "must be between -180 and 180");
  }
  if (story.at.lat === 0 && story.at.lng === 0) {
    error("at", "is null island (0,0) — coordinates were almost certainly never filled in");
  }
  if (story.triggerRadiusKm < 5 || story.triggerRadiusKm > 250) {
    error(
      "triggerRadiusKm",
      "must be 5–250km; tighter than 5km cannot survive position error, wider than 250km is not really 'below you'",
    );
  }
  if (story.place.trim().length === 0) {
    error("place", "is required — the script and the pin both name the place out loud");
  }

  // --- Runtime -----------------------------------------------------------------------
  const nominal = NOMINAL_DURATION_S[story.format];
  if (story.durationS <= 0) {
    error("durationS", "must be positive");
  } else if (Math.abs(story.durationS - nominal) / nominal > DURATION_TOLERANCE) {
    warn(
      "durationS",
      `${story.durationS}s is far from the ${nominal}s nominal for "${story.format}" — the scheduler paces around these shapes`,
    );
  }

  // --- Scoring inputs ----------------------------------------------------------------
  if (story.quality < 0 || story.quality > 1) error("quality", "must be between 0 and 1");
  if (story.minAge < 0 || story.minAge > 21) error("minAge", "must be between 0 and 21");

  // --- Sourcing ----------------------------------------------------------------------
  if (story.sources.length === 0) {
    error("sources", "every claim must be traceable; at least one source is required");
  }
  for (const [i, source] of story.sources.entries()) {
    if (!source.retrievedAt || Number.isNaN(Date.parse(source.retrievedAt))) {
      error(`sources[${i}].retrievedAt`, "must be an ISO date — sources move and vanish");
    }
    if (source.publisher.trim().length === 0) {
      error(`sources[${i}].publisher`, "is required to judge credibility");
    }
  }

  // --- Publication readiness ---------------------------------------------------------
  if (story.editorial === "approved") {
    if (story.factCheck === "unchecked" || story.factCheck === "disputed") {
      error(
        "factCheck",
        `cannot approve a story whose facts are "${story.factCheck}"`,
      );
    }
    if (!story.audioKey) {
      warn("audioKey", "is approved but has no rendered audio, so it cannot be packaged");
    }
  }

  // --- Kids --------------------------------------------------------------------------
  if (story.category === "kids") {
    if (story.minAge > 12) {
      error("minAge", "a kids story with minAge above 12 will never reach a child");
    }
  }

  // --- True crime: the strictest gate in the system -----------------------------------
  if (story.category === "true-crime") {
    issues.push(...validateTrueCrime(story));
  } else if (story.trueCrimeReview) {
    warn(
      "trueCrimeReview",
      "is present on a non-true-crime story; if the subject is a crime, categorise it as such so the gates apply",
    );
  }

  return issues;
}

/**
 * Additional obligations for true crime. Every rule here traces to a real failure mode:
 * a wrongly-stated conviction is defamation, an unreviewed draft is an unattributable
 * publication, and a child hearing a murder story is the single fastest way to lose an
 * airline contract.
 */
function validateTrueCrime(story: Story): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const error = (field: string, message: string) =>
    issues.push({ storyId: story.id, severity: "error", field, message });

  const review = story.trueCrimeReview;
  if (!review) {
    error("trueCrimeReview", "is mandatory for true crime — no exceptions, no defaults");
    return issues;
  }

  if (story.sources.length < 2) {
    error("sources", "true crime requires at least two independent credible sources");
  }
  if (story.factCheck !== "corroborated") {
    error("factCheck", 'true crime must be "corroborated" before it can be published');
  }
  if (story.minAge < TRUE_CRIME_MIN_AGE) {
    error("minAge", `true crime must be gated at ${TRUE_CRIME_MIN_AGE}+`);
  }
  if (review.reviewedBy.trim().length === 0) {
    error("trueCrimeReview.reviewedBy", "must name the human who approved this");
  }
  if (!review.reviewedAt || Number.isNaN(Date.parse(review.reviewedAt))) {
    error("trueCrimeReview.reviewedAt", "must be an ISO date");
  }
  if (review.contentWarning.trim().length === 0) {
    error("trueCrimeReview.contentWarning", "must be read before the story begins");
  }

  // A story about someone alive and not convicted is the highest-risk thing we publish.
  // It needs more than the baseline two sources.
  if (
    review.involvesLivingPeople &&
    review.convictionStatus !== "convicted" &&
    story.sources.length < 3
  ) {
    error(
      "sources",
      "a story naming a living person who was not convicted requires at least three sources",
    );
  }

  return issues;
}

export interface LibraryReport {
  readonly issues: readonly ValidationIssue[];
  readonly errorCount: number;
  readonly warningCount: number;
  readonly ok: boolean;
}

/** Validate a whole library, including cross-story checks. */
export function validateLibrary(stories: readonly Story[]): LibraryReport {
  const issues: ValidationIssue[] = [];

  const seen = new Map<string, Story>();
  for (const story of stories) {
    if (seen.has(story.id)) {
      issues.push({
        storyId: story.id,
        severity: "error",
        field: "id",
        message: "is duplicated in the library",
      });
    }
    seen.set(story.id, story);
    issues.push(...validateStory(story));
  }

  // Related IDs must resolve, or the scheduler's duplicate-subject suppression silently
  // stops working and a passenger hears the same river twice.
  for (const story of stories) {
    for (const relatedId of story.relatedIds ?? []) {
      if (!seen.has(relatedId)) {
        issues.push({
          storyId: story.id,
          severity: "error",
          field: "relatedIds",
          message: `references unknown story "${relatedId}"`,
        });
      }
    }
  }

  const errorCount = issues.filter((i) => i.severity === "error").length;
  return {
    issues,
    errorCount,
    warningCount: issues.length - errorCount,
    ok: errorCount === 0,
  };
}
