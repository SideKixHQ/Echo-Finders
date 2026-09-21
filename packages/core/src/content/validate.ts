/**
 * The gate every story passes before it can reach a passenger.
 *
 * This runs in CI against the content library (ADR-0005), so a story that breaks a rule
 * fails the build rather than reaching an aircraft. The rules encode editorial policy, not
 * programmer taste, and each one exists because getting it wrong has a specific cost:
 * a defamation claim, a frightened child, an airline pulling the product mid-contract.
 */

import type { Source, Story } from "../types.js";
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

/** The lowest age at which a sponsored placement may be served. */
export const ADVERTISING_MIN_AGE = 13;

/** How far a rendered audio file may stray from its format's nominal length. */
const DURATION_TOLERANCE = 0.6;

// ---------------------------------------------------------------------------
// Rights policy
// ---------------------------------------------------------------------------

type Rights = Source["rights"];

/**
 * Which source licences the library will accept.
 *
 * Worth being precise about what this is protecting against, because the intuition is
 * usually wrong: **facts are not copyrightable**. Reading that a lighthouse was built in
 * 1847 and writing our own sentence about it infringes nothing, whatever the source. What
 * copyright protects is the *expression* — the phrasing, structure and selection.
 *
 * So this policy is not really a legal necessity. It is a provenance standard: for the
 * MVP every claim should trace to a source anyone can open and check, with no licence
 * conversation attached. That makes the library trivially defensible in an airline's
 * procurement review, which is a commercial advantage rather than a legal one.
 */
export interface ContentPolicy {
  readonly allowedRights: readonly Rights[];
}

/**
 * The MVP standard: public domain and CC-BY only.
 *
 * Government works carry most of the weight here and are richer than they sound — the
 * National Park Service, the Library of Congress, USGS, NOAA, the Smithsonian and court
 * records are all public domain, and between them they cover the overwhelming majority of
 * what the library needs.
 *
 * Two deliberate exclusions:
 *
 * - **CC-BY-SA** is excluded despite being "free". Share-alike obligations can propagate
 *   into derivative works, and a viral licence term sitting inside a product licensed to
 *   an airline is precisely the surprise we do not want surfacing in their legal review.
 * - **`licensed`** is excluded because a per-source negotiation is the thing the MVP is
 *   trying to avoid entirely.
 */
export const MVP_POLICY: ContentPolicy = {
  allowedRights: ["public-domain", "cc-by"],
};

/**
 * Once there is a rights desk, licensed material and facts drawn from paywalled reporting
 * both become available. Most true-crime corroboration will eventually live here.
 */
export const FULL_POLICY: ContentPolicy = {
  allowedRights: ["public-domain", "cc-by", "cc-by-sa", "licensed", "fair-use-facts"],
};

export function validateStory(story: Story, policy: ContentPolicy = MVP_POLICY): ValidationIssue[] {
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
  // The usable range spans four orders of magnitude, because the same library serves a
  // flight and a walking tour. The floor is set by GNSS accuracy on a phone in a street
  // (a 10m radius would never reliably trigger); the ceiling by the point at which a place
  // stops being somewhere you are passing.
  if (story.triggerRadiusKm < 0.02 || story.triggerRadiusKm > 250) {
    error(
      "triggerRadiusKm",
      "must be 0.02–250km; tighter than 20m cannot survive GNSS error, wider than 250km is not somewhere you are passing",
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
  // Sponsored placements are exempt: an advertisement makes no factual claim we are
  // vouching for, and requiring a National Park Service citation for a restaurant would
  // only teach editors to paste in a meaningless one.
  if (story.sources.length === 0 && !story.sponsorship) {
    error("sources", "every claim must be traceable; at least one source is required");
  }
  for (const [i, source] of story.sources.entries()) {
    if (!source.retrievedAt || Number.isNaN(Date.parse(source.retrievedAt))) {
      error(`sources[${i}].retrievedAt`, "must be an ISO date — sources move and vanish");
    }
    if (source.publisher.trim().length === 0) {
      error(`sources[${i}].publisher`, "is required to judge credibility");
    }
    if (!policy.allowedRights.includes(source.rights)) {
      error(
        `sources[${i}].rights`,
        `"${source.rights}" is outside the current policy (${policy.allowedRights.join(", ")}). ` +
          rightsAdvice(source.rights),
      );
    }
    // CC-BY is free to use but not free of obligation: the credit has to appear somewhere
    // the passenger can reach, which for an audio product means the transcript or an
    // on-screen credits panel, not a line nobody renders.
    if (source.rights === "cc-by" && !source.url) {
      warn(
        `sources[${i}].url`,
        "CC-BY requires attribution, so the source needs a URL we can credit",
      );
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

  // --- Sponsorship --------------------------------------------------------------------
  if (story.sponsorship) issues.push(...validateSponsorship(story));

  // --- The simple retelling -----------------------------------------------------------
  if (story.simple) {
    const simple = story.simple;
    if (simple.title.trim().length === 0) error("simple.title", "is required");
    if (simple.script.trim().length === 0) error("simple.script", "is required");
    if (simple.durationS <= 0) {
      error("simple.durationS", "must be positive");
    } else if (simple.durationS >= story.durationS) {
      // The point of the simple telling is that it is shorter as well as plainer. One
      // that runs as long as the original is almost always a copy-paste mistake.
      error(
        "simple.durationS",
        `is ${simple.durationS}s against the full version's ${story.durationS}s — the simple telling must be shorter`,
      );
    }
    if (simple.transcript) issues.push(...validateTranscript(story.id, simple.transcript, "simple.transcript"));
  }

  if (story.transcript) issues.push(...validateTranscript(story.id, story.transcript, "transcript"));

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
  // At least one source must be the primary record itself — a court filing, a coroner's
  // report, a government archive — rather than someone else's account of it. Secondary
  // sources repeat each other's errors, and a chain of retellings is how a story ends up
  // asserting a conviction that never happened.
  if (!story.sources.some((source) => source.rights === "public-domain")) {
    error(
      "sources",
      "true crime needs at least one public record (court, coroner, government archive) as a primary source",
    );
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

/**
 * Rules for paid placements.
 *
 * Two of these are not negotiable regardless of what an advertiser is willing to pay:
 * every placement discloses that it is one, and none of them reach children.
 */
function validateSponsorship(story: Story): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const error = (field: string, message: string) =>
    issues.push({ storyId: story.id, severity: "error", field, message });

  const sponsorship = story.sponsorship;
  if (!sponsorship) return issues;

  if (sponsorship.disclosure.trim().length === 0) {
    error("sponsorship.disclosure", "is required — undisclosed advertising is not an option");
  }
  if (sponsorship.advertiser.trim().length === 0) {
    error("sponsorship.advertiser", "is required");
  }
  if (sponsorship.advertiserId.trim().length === 0) {
    error(
      "sponsorship.advertiserId",
      "is required so an airline can block an advertiser without editing content",
    );
  }

  for (const field of ["runsFrom", "runsUntil"] as const) {
    const value = sponsorship[field];
    if (value !== undefined && Number.isNaN(Date.parse(value))) {
      error(`sponsorship.${field}`, "must be an ISO date");
    }
  }
  if (
    sponsorship.runsFrom &&
    sponsorship.runsUntil &&
    Date.parse(sponsorship.runsFrom) > Date.parse(sponsorship.runsUntil)
  ) {
    error("sponsorship.runsUntil", "is before runsFrom");
  }

  // Advertising to children is a line we do not cross, and it is the one an airline's
  // legal team will ask about first.
  if (story.category === "kids") {
    error("category", "a sponsored placement cannot be filed as kids content");
  }
  if (story.minAge < ADVERTISING_MIN_AGE) {
    error(
      "minAge",
      `sponsored placements are gated at ${ADVERTISING_MIN_AGE}+; children must never be advertised to`,
    );
  }

  return issues;
}

/** Transcript lines must run forwards and stay inside the audio. */
function validateTranscript(
  storyId: string,
  transcript: { lines: readonly { text: string; atS: number; durationS: number }[]; totalS: number },
  field: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const error = (f: string, message: string) =>
    issues.push({ storyId, severity: "error", field: f, message });

  if (transcript.lines.length === 0) {
    error(field, "has no lines");
    return issues;
  }

  let previousEnd = -1;
  for (const [i, line] of transcript.lines.entries()) {
    if (line.text.trim().length === 0) error(`${field}.lines[${i}].text`, "is empty");
    if (line.atS < previousEnd - 0.05) {
      // Line seeking and read-along highlighting both assume monotonic timings; an
      // overlap silently sends the wrong line highlighted for the rest of the story.
      error(`${field}.lines[${i}].atS`, "overlaps the previous line");
    }
    previousEnd = line.atS + line.durationS;
  }

  if (previousEnd > transcript.totalS + 0.5) {
    error(`${field}.totalS`, `is ${transcript.totalS}s but the lines run to ${previousEnd.toFixed(1)}s`);
  }

  return issues;
}

/** Advice attached to a rejected licence, so an editor knows what to do next. */
function rightsAdvice(rights: Rights): string {
  switch (rights) {
    case "cc-by-sa":
      return "Share-alike can propagate into derivative works; find a public-domain equivalent instead.";
    case "licensed":
      return "Licensed material needs a rights agreement, which the MVP is deliberately avoiding.";
    case "fair-use-facts":
      return "Facts themselves are fine to use, but cite the underlying public record rather than the article that reported it.";
    default:
      return "Prefer a government or public-domain source.";
  }
}

/** Validate a whole library, including cross-story checks. */
export function validateLibrary(
  stories: readonly Story[],
  policy: ContentPolicy = MVP_POLICY,
): LibraryReport {
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
    issues.push(...validateStory(story, policy));
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
