/**
 * Rules for echoes people leave themselves.
 *
 * The permissive parts and the strict parts both follow from one distinction: a
 * contribution is **testimony**, not history. It is an account of the contributor's own
 * experience, which is why it needs no sources — and why it must never be mistaken for the
 * record, must always carry a name, and must never stray into claims about other people.
 */

import type { Echo, Provenance } from "../types.js";
import { TRUST_REACH_KM } from "../types.js";

/**
 * How far a contributed echo actually carries.
 *
 * The authored radius is a ceiling, not a promise. A new contributor's echo reaches fifty
 * metres whatever they typed, which is most of the moderation system in one number: spam
 * has no payoff when nobody hears it, an honest mistake reaches almost nobody, and reach
 * becomes something earned rather than something an approval queue has to grant.
 */
export function effectiveRadiusKm(echo: Echo): number {
  const authored = echo.point.triggerRadiusKm;
  if ((echo.provenance ?? "editorial") !== "personal") return authored;

  const trust = echo.contribution?.trust ?? "new";
  return Math.min(authored, TRUST_REACH_KM[trust]);
}

/** Categories a contribution may never be filed under, whatever the contributor intends. */
export const CONTRIBUTION_FORBIDDEN_CATEGORIES = ["true-crime"] as const;

/**
 * Patterns that turn a memory into something else.
 *
 * Deliberately crude and deliberately erring towards refusal. A contact detail in a
 * place-anchored audio message is either advertising or an attempt to move someone into a
 * private channel, and neither belongs in a story about a street corner. The cost of a
 * false positive is asking somebody to rephrase; the cost of a false negative is the app
 * becoming a delivery mechanism.
 */
const CONTACT_PATTERNS: readonly { pattern: RegExp; what: string }[] = [
  { pattern: /https?:\/\/|www\.[a-z]/i, what: "a web address" },
  { pattern: /[\w.+-]+@[\w-]+\.[a-z]{2,}/i, what: "an email address" },
  { pattern: /(?:\+?\d[\s().-]?){9,}\d/, what: "a phone number" },
  { pattern: /\B@[A-Za-z0-9_]{3,}/, what: "a social handle" },
];

export interface ContributionIssue {
  readonly field: string;
  readonly message: string;
}

/**
 * Check a contributed echo.
 *
 * Returns problems rather than a verdict, so a submission screen can tell somebody exactly
 * what to change instead of rejecting them with a shrug.
 */
export function checkContribution(echo: Echo): ContributionIssue[] {
  const issues: ContributionIssue[] = [];
  const provenance: Provenance = echo.provenance ?? "editorial";
  if (provenance !== "personal") return issues;

  const contribution = echo.contribution;
  if (!contribution) {
    issues.push({
      field: "contribution",
      message: "a personal echo must record who left it — testimony without a voice is just an anonymous claim",
    });
    return issues;
  }

  if (contribution.attribution.trim().length === 0) {
    issues.push({
      field: "contribution.attribution",
      message: "is required — a listener has to know whose account they are hearing",
    });
  }
  if (!contribution.contributorId.trim()) {
    issues.push({
      field: "contribution.contributorId",
      message: "is required, so a contribution stays accountable even when shown by first name only",
    });
  }

  // Testimony is not on the historical-record scale, and grading it against one would be a
  // category error in both directions: it can neither be "documented" nor be faulted for
  // failing to be.
  if (echo.certainty !== "testimony") {
    issues.push({
      field: "certainty",
      message: 'a personal echo must be "testimony" — it is an account of an experience, not a claim about the record',
    });
  }

  if ((CONTRIBUTION_FORBIDDEN_CATEGORIES as readonly string[]).includes(echo.category)) {
    issues.push({
      field: "category",
      message:
        "true crime concerns real people and real harm; it needs sources, review and legal sign-off, which a contribution cannot carry",
    });
  }

  const text = `${echo.title} ${echo.summary} ${echo.script ?? ""}`;
  for (const { pattern, what } of CONTACT_PATTERNS) {
    if (pattern.test(text)) {
      issues.push({
        field: "script",
        message: `contains what looks like ${what}. A memory about a place should not carry contact details.`,
      });
    }
  }

  return issues;
}

/**
 * Places where only the editorial library and vetted partners may leave anything.
 *
 * A place-anchored message is a thing left *at* somewhere, which makes the wrong location
 * a way to reach a specific person or to intrude on grief. Private homes are the obvious
 * case; memorials, burial grounds, schools and disaster sites are the ones that cause real
 * harm while looking like ordinary history.
 */
export interface ProtectedArea {
  readonly reason: "residence" | "memorial" | "burial-ground" | "school" | "disaster-site";
  readonly at: { readonly lat: number; readonly lng: number };
  readonly radiusKm: number;
}
