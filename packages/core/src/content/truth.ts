/**
 * Is this echo a true story or a legend, and has anyone checked it?
 *
 * James (2026-10-09): "Ghost stories are not factual, folklore not factual, local myths are
 * not factual. History, People, Arts, True Crime should all be factual and verified. Let's
 * find a way to update the rule and mark appropriately so the user knows just by looking."
 *
 * `certainty` already said this, and nothing a listener could see showed it: a ghost story
 * and a court record looked identical on the card, in the player and in My Echoes, and the
 * only signal was what the narrator said. So the library splits into two families, the
 * validator holds each to its own rule, and every screen draws the same mark from here.
 */

import type { Echo, EchoCategory } from "../types.js";

/** Kinds that make factual claims: documented or disputed, and verified before approval. */
export const FACT_CATEGORIES: readonly EchoCategory[] = [
  "history",
  "true-crime",
  "people",
  "built",
  "land",
  "food-drink",
  "arts",
];

/**
 * Kinds that are told as stories, not as fact: ghosts, folklore, local myths. Children's
 * echoes are either, and are labelled as what they are.
 */
export const FOLKLORE_CATEGORIES: readonly EchoCategory[] = ["legend"];

/**
 * The mark a listener sees.
 *
 * - `true-story`: documented, and a person has checked it against its sources.
 * - `unverified`: told as fact, not yet checked. Said out loud rather than hidden, so the
 *   library can be heard while the checking happens (James: "show not yet verified").
 * - `disputed`: historians disagree, and the script says so.
 * - `legend`: folklore, true as a story and not as fact.
 * - `memory`: someone's own account of what happened to them.
 */
export type Truth = "true-story" | "unverified" | "disputed" | "legend" | "memory";

/** Approved by a person, with its facts checked. The only route to "true story". */
export function isVerified(echo: Pick<Echo, "editorial" | "factCheck">): boolean {
  return (
    echo.editorial === "approved" &&
    (echo.factCheck === "corroborated" || echo.factCheck === "single-source")
  );
}

/**
 * Which mark, given whether the echo has been verified.
 *
 * `verified` is passed rather than read, because a demo build can mark everything approved
 * so it plays; the caller knows what was really checked.
 */
export function truthOf(echo: Pick<Echo, "certainty">, verified: boolean): Truth {
  switch (echo.certainty) {
    case "legend":
      return "legend";
    case "testimony":
      return "memory";
    case "contested":
      return "disputed";
    case "documented":
      return verified ? "true-story" : "unverified";
  }
}

/** The words for each mark, shortest first where a screen has less room. */
export const TRUTH_LABEL: Record<Truth, { readonly full: string; readonly short: string }> = {
  "true-story": { full: "True story · verified", short: "True story" },
  unverified: { full: "True story · not yet verified", short: "Not yet verified" },
  disputed: { full: "Disputed · historians differ", short: "Disputed" },
  legend: { full: "Legend · not fact", short: "Legend" },
  memory: { full: "A memory · their account", short: "A memory" },
};
