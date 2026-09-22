/**
 * The gate every echo passes before it can reach a passenger.
 *
 * This runs in CI against the content library (ADR-0005), so an echo that breaks a rule
 * fails the build rather than reaching an aircraft. The rules encode editorial policy, not
 * programmer taste, and each one exists because getting it wrong has a specific cost:
 * a defamation claim, a frightened child, an airline pulling the product mid-contract.
 */

import type { Source, Echo } from "../types.js";
import { hasAudio } from "../types.js";
import { MODE_PRESETS } from "../modes.js";
import { checkContribution } from "./contributions.js";
import { NOMINAL_DURATION_S, ECHO_CATEGORIES } from "../types.js";

export type Severity = "error" | "warning";

export interface ValidationIssue {
  readonly echoId: string;
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

export function validateEcho(echo: Echo, policy: ContentPolicy = MVP_POLICY): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const error = (field: string, message: string) =>
    issues.push({ echoId: echo.id, severity: "error", field, message });
  const warn = (field: string, message: string) =>
    issues.push({ echoId: echo.id, severity: "warning", field, message });

  // --- Identity and shape ------------------------------------------------------------
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(echo.id)) {
    error("id", "must be lowercase kebab-case so it is stable in file paths and URLs");
  }
  if (echo.title.trim().length === 0) error("title", "is required");
  if (echo.summary.trim().length === 0) error("summary", "is required for the map pin");
  if (echo.summary.length > 140) {
    warn("summary", `is ${echo.summary.length} chars; map pins truncate past ~140`);
  }
  if (!ECHO_CATEGORIES.includes(echo.category)) {
    error("category", `"${echo.category}" is not a known category`);
  }

  // --- Geography ---------------------------------------------------------------------
  if (echo.point.at.lat < -90 || echo.point.at.lat > 90) error("at.lat", "must be between -90 and 90");
  if (echo.point.at.lng < -180 || echo.point.at.lng > 180) {
    error("at.lng", "must be between -180 and 180");
  }
  if (echo.point.at.lat === 0 && echo.point.at.lng === 0) {
    error("at", "is null island (0,0) — coordinates were almost certainly never filled in");
  }
  // The usable range spans four orders of magnitude, because the same library serves a
  // flight and a walking tour. The floor is set by GNSS accuracy on a phone in a street
  // (a 10m radius would never reliably trigger); the ceiling by the point at which a place
  // stops being somewhere you are passing.
  if (echo.point.triggerRadiusKm < 0.02 || echo.point.triggerRadiusKm > 250) {
    error(
      "triggerRadiusKm",
      "must be 0.02–250km; tighter than 20m cannot survive GNSS error, wider than 250km is not somewhere you are passing",
    );
  }
  // An echo nobody can be confirmed standing in is an echo nobody can capture. A phone on
  // a city street is typically sure to within thirty metres, so a radius tighter than that
  // is smaller than the uncertainty around it — the capture would be a coin toss.
  const walkingFixM = MODE_PRESETS.walking.typicalFixAccuracyM;
  if (echo.point.triggerRadiusKm * 1000 < walkingFixM) {
    warn(
      "point.triggerRadiusKm",
      `is ${Math.round(echo.point.triggerRadiusKm * 1000)}m, tighter than a typical ${walkingFixM}m position fix on foot — capture will be unreliable`,
    );
  }

  if (echo.point.place.trim().length === 0) {
    error("place", "is required — the script and the pin both name the place out loud");
  }

  // --- Runtime -----------------------------------------------------------------------
  const nominal = NOMINAL_DURATION_S[echo.format];
  if (echo.durationS <= 0) {
    error("durationS", "must be positive");
  } else if (Math.abs(echo.durationS - nominal) / nominal > DURATION_TOLERANCE) {
    warn(
      "durationS",
      `${echo.durationS}s is far from the ${nominal}s nominal for "${echo.format}" — the scheduler paces around these shapes`,
    );
  }

  // --- Scoring inputs ----------------------------------------------------------------
  if (echo.quality < 0 || echo.quality > 1) error("quality", "must be between 0 and 1");
  if (echo.minAge < 0 || echo.minAge > 21) error("minAge", "must be between 0 and 21");

  // --- Sourcing ----------------------------------------------------------------------
  // Sponsored placements are exempt: an advertisement makes no factual claim we are
  // vouching for, and requiring a National Park Service citation for a restaurant would
  // only teach editors to paste in a meaningless one.
  const isTestimony = (echo.provenance ?? "editorial") === "personal";
  if (echo.sources.length === 0 && !echo.sponsorship && !isTestimony) {
    error("sources", "every claim must be traceable; at least one source is required");
  }
  for (const [i, source] of echo.sources.entries()) {
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
  if (echo.editorial === "approved") {
    if (echo.factCheck === "unchecked" || echo.factCheck === "disputed") {
      error(
        "factCheck",
        `cannot approve an echo whose facts are "${echo.factCheck}"`,
      );
    }
    if (!hasAudio(echo)) {
      warn("renders", "is approved but has no rendered audio, so it cannot be packaged");
    }
  }

  // --- Kids --------------------------------------------------------------------------
  if (echo.category === "kids") {
    if (echo.minAge > 12) {
      error("minAge", "a kids echo with minAge above 12 will never reach a child");
    }
  }

  // --- Certainty ----------------------------------------------------------------------
  // "We distinguish fact from legend and clearly identify uncertainty" only means
  // something if a build can fail over it. A confident narrator makes a ghost story and a
  // census record sound identical, and a confident voice is what stops a listener checking.
  if (echo.certainty !== "documented" && echo.certainty !== "testimony" && !echo.certaintyNote?.trim()) {
    error(
      "certaintyNote",
      `is required when certainty is "${echo.certainty}" — say what is disputed and who disputes it, because "sources differ" is not a disclosure`,
    );
  }
  if (echo.certainty === "contested" && echo.sources.length < 2) {
    error(
      "sources",
      "a contested echo needs at least two sources; you cannot show a disagreement from one side of it",
    );
  }
  if (echo.category === "local-legends" && echo.certainty === "documented") {
    error(
      "certainty",
      'a local legend cannot be "documented" — label it "legend", or file it under history if the record actually supports it',
    );
  }
  if (echo.category === "true-crime" && echo.certainty === "legend") {
    error(
      "certainty",
      "true crime concerns real people and real harm; folklore belongs under local-legends",
    );
  }

  // --- Perspective --------------------------------------------------------------------
  for (const id of echo.perspectiveIds ?? []) {
    if (id === echo.id) error("perspectiveIds", "lists the echo itself");
    if (echo.relatedIds?.includes(id)) {
      // These mean opposite things to the scheduler: related suppresses, perspective
      // pairs. An id in both is a contradiction it cannot resolve.
      error(
        "perspectiveIds",
        `lists "${id}", which is also in relatedIds — one suppresses the other as a duplicate, the other actively pairs them`,
      );
    }
  }

  // --- Casting ------------------------------------------------------------------------
  // A cast that does not match the render is a silent mismatch: the file says one narrator
  // tells this and the audio is somebody else. Nothing downstream would notice.
  if (echo.voice && echo.renders?.length) {
    if (!echo.renders.some((render) => render.voiceId === echo.voice)) {
      error(
        "voice",
        `is cast to "${echo.voice}" but no render uses that voice — the file and the audio disagree`,
      );
    }
  }

  // --- Contributions ------------------------------------------------------------------
  for (const issue of checkContribution(echo)) error(issue.field, issue.message);

  // --- Sponsorship --------------------------------------------------------------------
  if (echo.sponsorship) issues.push(...validateSponsorship(echo));

  // --- The simple retelling -----------------------------------------------------------
  if (echo.simple) {
    const simple = echo.simple;
    if (simple.title.trim().length === 0) error("simple.title", "is required");
    if (simple.script.trim().length === 0) error("simple.script", "is required");
    if (simple.durationS <= 0) {
      error("simple.durationS", "must be positive");
    } else if (simple.durationS >= echo.durationS) {
      // The point of the simple telling is that it is shorter as well as plainer. One
      // that runs as long as the original is almost always a copy-paste mistake.
      error(
        "simple.durationS",
        `is ${simple.durationS}s against the full version's ${echo.durationS}s — the simple telling must be shorter`,
      );
    }
    for (const [i, render] of (simple.renders ?? []).entries()) {
      if (render.transcript) {
        issues.push(
          ...validateTranscript(echo.id, render.transcript, `simple.renders[${i}].transcript`),
        );
      }
    }
  }

  // Every render carries its own timings, and every one of them has to line up with its
  // own audio — a transcript checked against the wrong voice passes and still desynchronises.
  for (const [i, render] of (echo.renders ?? []).entries()) {
    if (render.transcript) {
      issues.push(...validateTranscript(echo.id, render.transcript, `renders[${i}].transcript`));
    }
  }

  // --- True crime: the strictest gate in the system -----------------------------------
  if (echo.category === "true-crime") {
    issues.push(...validateTrueCrime(echo));
  } else if (echo.trueCrimeReview) {
    warn(
      "trueCrimeReview",
      "is present on a non-true-crime echo; if the subject is a crime, categorise it as such so the gates apply",
    );
  }

  return issues;
}

/**
 * Additional obligations for true crime. Every rule here traces to a real failure mode:
 * a wrongly-stated conviction is defamation, an unreviewed draft is an unattributable
 * publication, and a child hearing a murder echo is the single fastest way to lose an
 * airline contract.
 */
function validateTrueCrime(echo: Echo): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const error = (field: string, message: string) =>
    issues.push({ echoId: echo.id, severity: "error", field, message });

  const review = echo.trueCrimeReview;
  if (!review) {
    error("trueCrimeReview", "is mandatory for true crime — no exceptions, no defaults");
    return issues;
  }

  if (echo.sources.length < 2) {
    error("sources", "true crime requires at least two independent credible sources");
  }
  // At least one source must be the primary record itself — a court filing, a coroner's
  // report, a government archive — rather than someone else's account of it. Secondary
  // sources repeat each other's errors, and a chain of retellings is how an echo ends up
  // asserting a conviction that never happened.
  if (!echo.sources.some((source) => source.rights === "public-domain")) {
    error(
      "sources",
      "true crime needs at least one public record (court, coroner, government archive) as a primary source",
    );
  }
  if (echo.factCheck !== "corroborated") {
    error("factCheck", 'true crime must be "corroborated" before it can be published');
  }
  if (echo.minAge < TRUE_CRIME_MIN_AGE) {
    error("minAge", `true crime must be gated at ${TRUE_CRIME_MIN_AGE}+`);
  }
  if (review.reviewedBy.trim().length === 0) {
    error("trueCrimeReview.reviewedBy", "must name the human who approved this");
  }
  if (!review.reviewedAt || Number.isNaN(Date.parse(review.reviewedAt))) {
    error("trueCrimeReview.reviewedAt", "must be an ISO date");
  }
  if (review.contentWarning.trim().length === 0) {
    error("trueCrimeReview.contentWarning", "must be read before the echo begins");
  }

  // An echo about someone alive and not convicted is the highest-risk thing we publish.
  // It needs more than the baseline two sources.
  if (
    review.involvesLivingPeople &&
    review.convictionStatus !== "convicted" &&
    echo.sources.length < 3
  ) {
    error(
      "sources",
      "an echo naming a living person who was not convicted requires at least three sources",
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
function validateSponsorship(echo: Echo): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const error = (field: string, message: string) =>
    issues.push({ echoId: echo.id, severity: "error", field, message });

  const sponsorship = echo.sponsorship;
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
  if (echo.category === "kids") {
    error("category", "a sponsored placement cannot be filed as kids content");
  }
  if (echo.minAge < ADVERTISING_MIN_AGE) {
    error(
      "minAge",
      `sponsored placements are gated at ${ADVERTISING_MIN_AGE}+; children must never be advertised to`,
    );
  }

  return issues;
}

/** Transcript lines must run forwards and stay inside the audio. */
function validateTranscript(
  echoId: string,
  transcript: { lines: readonly { text: string; atS: number; durationS: number }[]; totalS: number },
  field: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const error = (f: string, message: string) =>
    issues.push({ echoId, severity: "error", field: f, message });

  if (transcript.lines.length === 0) {
    error(field, "has no lines");
    return issues;
  }

  let previousEnd = -1;
  for (const [i, line] of transcript.lines.entries()) {
    if (line.text.trim().length === 0) error(`${field}.lines[${i}].text`, "is empty");
    if (line.atS < previousEnd - 0.05) {
      // Line seeking and read-along highlighting both assume monotonic timings; an
      // overlap silently sends the wrong line highlighted for the rest of the echo.
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

/** Validate a whole library, including cross-echo checks. */
export function validateLibrary(
  echoes: readonly Echo[],
  policy: ContentPolicy = MVP_POLICY,
): LibraryReport {
  const issues: ValidationIssue[] = [];

  const seen = new Map<string, Echo>();
  for (const echo of echoes) {
    if (seen.has(echo.id)) {
      issues.push({
        echoId: echo.id,
        severity: "error",
        field: "id",
        message: "is duplicated in the library",
      });
    }
    seen.set(echo.id, echo);
    issues.push(...validateEcho(echo, policy));
  }

  // Cross-references must resolve. A dangling relatedId silently disables duplicate
  // suppression and a listener hears the same river twice; a dangling perspectiveId
  // silently disables the pairing, which is worse — the counterpoint just never plays,
  // and the account that survives is the one-sided one.
  for (const echo of echoes) {
    for (const [field, ids] of [
      ["relatedIds", echo.relatedIds],
      ["perspectiveIds", echo.perspectiveIds],
    ] as const) {
      for (const id of ids ?? []) {
        if (!seen.has(id)) {
          issues.push({
            echoId: echo.id,
            severity: "error",
            field,
            message: `references unknown echo "${id}"`,
          });
        }
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
