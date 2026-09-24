/**
 * Was that one worth stopping for?
 *
 * Two answers, not five stars, and the reason is editorial rather than aesthetic.
 *
 * Human review is 95% of what the library costs (`02-costs.md`), so knowing which echoes
 * land is the highest-leverage signal in the whole product: it decides where that review
 * goes and what gets written more of. That is worth collecting.
 *
 * A public star average is a different thing wearing the same clothes, and it would damage
 * the library. Averages become popularity contests, and this library is deliberately not a
 * popularity contest: the Charging Bull will out-score the African Burial Ground every
 * time, and the echoes that matter most are frequently the ones people are least
 * comfortable with. Worse, a visible score on contested history or on true crime invites
 * organised brigading, which is a content-safety problem rather than a product one.
 *
 * So: private, binary, and never shown back as a number. The listener answers a question
 * about their own experience; editorial sees the aggregate; no one sees a rank.
 *
 * Kept in `localStorage` rather than IndexedDB because it is a handful of bytes per echo
 * and wants to be readable synchronously on first paint, and because losing it costs a
 * signal rather than somebody's collection. Every access is wrapped: private browsing
 * throws on the accessor itself, not merely on write.
 */

export type Rating = "up" | "down";

const KEY = "echo-finders:ratings";

export type Ratings = Readonly<Record<string, Rating>>;

export function loadRatings(): Ratings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    // Anything that is not one of the two answers is dropped rather than trusted: this is
    // storage a person can edit, and a stray value would end up in an aggregate.
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        ([, v]) => v === "up" || v === "down",
      ),
    ) as Ratings;
  } catch {
    return {};
  }
}

/**
 * Record an answer, or take it back.
 *
 * Pressing the same one again clears it, because a rating given by accident with a thumb
 * should be as easy to undo as it was to give, and "I would rather not say" is a real
 * answer that a two-button control must leave room for.
 */
export function setRating(current: Ratings, echoId: string, rating: Rating): Ratings {
  const next: Record<string, Rating> = { ...current };
  if (next[echoId] === rating) delete next[echoId];
  else next[echoId] = rating;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* No storage. The answer still applies for this session. */
  }
  return next;
}
