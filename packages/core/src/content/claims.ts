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

/**
 * Prefixes whose full stop never ends a sentence.
 *
 * Only prefixes belong here, and that is the whole point. An earlier version of this list
 * held every abbreviation it could think of, case-insensitively, and joined any part
 * ending in one to the part after it. That glued real sentences together:
 *
 *   "When he finally came in, the answer was no. By the traditional account, Samuel Adams
 *    stood and said, this meeting can do nothing more to save the country."
 *
 * Two sentences in `boston-waiting-for-mister-rotch`, made one, because `no.` matched `No`
 * with the `i` flag. `etc.`, `Co.`, `Inc.`, `Ltd.`, `Jr.` and `vs.` were wrong for the
 * same reason in the other direction: they can all legitimately end a sentence, so joining
 * on them guesses, and guesses wrong whenever a new sentence follows.
 *
 * What is left can only ever be followed by the thing it qualifies: a title by a name, a
 * saint by a saint's name, `No.` by a number, `vs.` and `v.` by the other party.
 * Matching is case-sensitive, so "St." is the
 * saint and "no." is the word.
 */
const ABBREVIATION =
  /\b(?:Mr|Mrs|Ms|Messrs|Dr|Prof|Rev|Fr|Hon|Col|Gen|Capt|Lt|Sgt|St|Ste|Mt|Ft|No|Nos|ca|approx|vs|v)\.$/;

/**
 * Sentences, split on terminal punctuation followed by a capital or an opening quote,
 * except where the full stop belongs to an abbreviation (see `ABBREVIATION`).
 */
export function sentencesOf(text: string): string[] {
  const parts = text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?…])\s+(?=["“‘(]?[A-Z0-9])/);

  const out: string[] = [];
  let held = "";
  for (const part of parts) {
    held = held ? `${held} ${part}` : part;
    if (ABBREVIATION.test(held)) continue;
    out.push(held.trim());
    held = "";
  }
  if (held.trim().length > 0) out.push(held.trim());
  return out.filter((s) => s.length > 0);
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
