/**
 * Claims: every checkable sentence in a script, beside the passage that backs it.
 *
 * Human review is 95% of what the library costs (docs/02-costs.md), and most of a
 * reviewer's twenty minutes goes on hunting: opening each source and finding the line that
 * supports "1855", "eight million", "the first". A claim does that hunting once, in the
 * content file — the sentence from the script, which source backs it, and the passage
 * quoted verbatim — so review becomes reading a quote beside a sentence and saying yes or
 * no. The costs doc puts that at about seven minutes instead of twenty.
 *
 * What counts as checkable is deliberately mechanical: a sentence with a number, a date, a
 * month, a counting word, a superlative ("first", "tallest", "only") or a name. Those are the claims
 * that are either right or wrong, and the ones a listener repeats. It will miss a plain
 * factual sentence with none of those, which is why a reviewer still reads the whole
 * script; it will never let an approved echo ship a number nobody quoted.
 *
 * The quotes are a reviewer's aid, not proof. Whoever writes them can be wrong, and a model
 * drafting them can invent one — so a person still opens the source and checks the quote is
 * really there before approving. What this removes is the search, not the judgement.
 */

import type { Claim, Echo } from "../types.js";

const COUNTING =
  "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|" +
  "sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|" +
  "hundred|hundreds|thousand|thousands|million|millions|billion|dozen|dozens|half|quarter";
const ORDINAL =
  "first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|earliest|oldest|" +
  "newest|tallest|largest|biggest|smallest|longest|only";
const MONTH =
  "january|february|march|april|may|june|july|august|september|october|november|december";

const CHECKABLE = new RegExp(`\\d|\\b(${COUNTING}|${ORDINAL}|${MONTH})\\b`, "i");

/** Sentences, split on terminal punctuation followed by a capital or an opening quote. */
export function sentencesOf(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?…])\s+(?=["“‘(]?[A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * A name after the first word: "Nikola Tesla came through here" names someone, and
 * whether he did is a fact. The first word is skipped because every sentence capitalises
 * it, and "I" because it is not a name.
 */
const NAMED = /\s(?!I\b)[A-Z][a-z]+/;

/** A sentence that makes a claim that is either right or wrong. */
export function isCheckable(sentence: string): boolean {
  return CHECKABLE.test(sentence) || NAMED.test(sentence);
}

/** Case, punctuation and spacing folded away, so a claim matches its sentence as written. */
const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/[“”‘’"'`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export interface ClaimCheck {
  /** Every checkable sentence in the script, with the claim that covers it if any. */
  readonly checkable: readonly { readonly sentence: string; readonly claim?: Claim }[];
  /** Claims whose `says` is not in the script any more, usually after an edit. */
  readonly orphaned: readonly Claim[];
  /** Claims pointing at a source the echo does not list (1-based). */
  readonly badSource: readonly Claim[];
  /** Claims with no quoted passage. */
  readonly unquoted: readonly Claim[];
}

export function checkClaims(echo: Pick<Echo, "script" | "claims" | "sources">): ClaimCheck {
  const claims = echo.claims ?? [];
  const sentences = sentencesOf(echo.script ?? "");
  const folded = sentences.map(fold);
  const script = fold(echo.script ?? "");

  const covers = (claim: Claim, sentence: string) => {
    const says = fold(claim.says);
    return says.length > 0 && (sentence.includes(says) || says.includes(sentence));
  };

  const checkable = sentences.flatMap((sentence, i) => {
    if (!isCheckable(sentence)) return [];
    const claim = claims.find((c) => covers(c, folded[i]!));
    return [claim ? { sentence, claim } : { sentence }];
  });

  return {
    checkable,
    orphaned: claims.filter((c) => !script.includes(fold(c.says))),
    badSource: claims.filter(
      (c) => !Number.isInteger(c.source) || c.source < 1 || c.source > echo.sources.length,
    ),
    unquoted: claims.filter((c) => c.quote.trim().length === 0),
  };
}
