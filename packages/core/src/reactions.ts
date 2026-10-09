/**
 * How an echo landed: four faces and a quiet "meh".
 *
 * James (2026-10-09): ratings, "in a cool way, not just a thumbs up or down". Five stars
 * says how much somebody liked a thing; a face says what KIND of good it was, which is
 * what the next echo needs to know. Somebody who keeps getting chills wants more ghosts
 * and true crime; somebody who keeps going "whoa" wants the surprising history.
 *
 * Kept on the device until there are accounts (`docs/10-blockers.md` #6). Here it steers
 * that listener's own ranking, through `interests`, and nothing else: it never makes an
 * echo eligible or ineligible, it only orders what already is.
 */

import type { Echo } from "./types.js";
import { kindTag } from "./ranking/score.js";

/** The four that mean "more like this", each a different way of meaning it. */
export const FACES = ["whoa", "chills", "ha", "moved"] as const;
export type Face = (typeof FACES)[number];
/** "Not for me." Small, and never the first thing offered. */
export type Reaction = Face | "meh";

export const REACTION_LABEL: Record<Reaction, { readonly word: string; readonly says: string }> = {
  whoa: { word: "Whoa", says: "I didn't know that" },
  chills: { word: "Chills", says: "Eerie, creepy, a gut-punch" },
  ha: { word: "Ha", says: "Funny, charming" },
  moved: { word: "Moved", says: "Touching, sad, beautiful" },
  meh: { word: "Meh", says: "Not for me" },
};

/**
 * Taste, from reactions: for every tag and kind an echo carries, how much this listener
 * liked what they heard of it, 0 to 1.
 *
 * Smoothed towards neutral (0.5) by two imaginary middling ratings, so one "meh" does not
 * bury a whole category and one "chills" does not flood the map with ghosts. It takes a
 * few reactions in the same direction to move anything, which is what taste is.
 */
export function interestsFrom(
  rated: readonly { readonly echo: Pick<Echo, "category" | "tags">; readonly reaction: Reaction }[],
): Record<string, number> {
  const sum = new Map<string, { liked: number; n: number }>();
  for (const { echo, reaction } of rated) {
    const liked = reaction === "meh" ? 0 : 1;
    for (const key of [...(echo.tags ?? []), kindTag(echo.category)]) {
      const s = sum.get(key) ?? { liked: 0, n: 0 };
      s.liked += liked;
      s.n += 1;
      sum.set(key, s);
    }
  }
  const PRIOR = 2;
  const out: Record<string, number> = {};
  for (const [key, { liked, n }] of sum) out[key] = (liked + 0.5 * PRIOR) / (n + PRIOR);
  return out;
}
