/**
 * Every echo this device has started listening to, across every journey.
 *
 * The free allowance counts these. It used to count the collection's `heardAt`, which
 * nothing ever set, so the allowance never ran out and the paywall never appeared. It is
 * kept here rather than in the collection for two more reasons: the collection is per
 * journey, so switching journeys would have started the count again; and an echo heard
 * from a flight's "coming up" list is never captured at all, so it would never have
 * counted.
 *
 * Device-local, like the purchase it is weighed against (`entitlement-store.ts`), and for
 * the same reason: there is no account yet. Clearing the browser resets it, which gives
 * somebody another free ten; that is the right way round for a bug to fail.
 */

const KEY = "echo-finders:heard";

export function readHeard(): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** Add one, and return the list as it now stands. Hearing twice counts once. */
export function addHeard(current: readonly string[], echoId: string): readonly string[] {
  if (current.includes(echoId)) return current;
  const next = [...current, echoId];
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Counted for this session only. */
  }
  return next;
}
