/**
 * Who has paid, and what that buys.
 *
 * The model was decided in conversation and written down in `docs/03-selling.md`: ten
 * echoes free, then $6.99 once and everything is yours forever. No subscription, no packs,
 * no consumables. This file is the engine's half of that, and it is deliberately the only
 * place the rule lives.
 *
 * **THE COUNTER IS ON HEARING, NOT ON FINDING.** That is the one real decision here and it
 * is worth stating plainly, because the doc says "10 echoes" without saying ten of what.
 *
 * Finding stays unlimited forever. You can walk a whole city, sync everything you stand
 * in front of, fill My Echoes and never pay — and every one of those is kept, not held
 * hostage. What the ten counts is how many you have LISTENED to.
 *
 * Three reasons it falls that way rather than on the sync:
 *
 * The hunt is the hook and the story is the product. Capping the hunt caps the thing that
 * makes somebody want to pay at all, and a map that stops responding after ten pins is a
 * map that looks broken rather than a product that looks worth buying.
 *
 * `checkEligibility` is already the place that answers "may this play", and
 * `docs/03-selling.md` is explicit that paid-or-not belongs in the same gate rather than
 * beside it: otherwise the map advertises an echo the player then refuses. Hearing is what
 * that gate governs. Syncing is governed somewhere else entirely.
 *
 * And `heardEchoIds` already exists on the profile, for the "never repeat an echo" rule.
 * The count is a fact the engine was already carrying.
 *
 * What is NOT here: Stripe, accounts, receipts, or anything that touches a network. The
 * engine is pure and stays pure. This says whether a listener is over the line; an adapter
 * outside it says how anybody got across.
 */

import type { ListenerProfile } from "../types.js";

/**
 * How many echoes a listener hears before being asked to pay.
 *
 * Ten, from `docs/03-selling.md`, and the number is doing a specific job: "enough to be a
 * real walk rather than a demo, which is what makes the payment a decision about more
 * rather than a toll gate". A shorter free tier turns the first pleasant afternoon into a
 * sales funnel; a longer one never gets round to asking.
 */
export const FREE_ECHO_LIMIT = 10;

/**
 * What a listener is entitled to.
 *
 * One flag, because there is one product. If this ever grows a second tier it grows a
 * union rather than more booleans — `"free" | "unlocked"` reads at a call site where
 * `!entitlement.unlocked && !entitlement.trial` does not.
 */
export interface Entitlement {
  readonly kind: "free" | "unlocked";
  /**
   * When it was bought, epoch ms. Absent while free.
   *
   * Kept for the receipt and for support ("I paid in March and it is asking again"), not
   * for expiry. There is no expiry: the purchase is permanent by design, and a field that
   * merely looks like it could expire is how a permanent purchase accidentally stops
   * being one.
   */
  readonly purchasedAt?: number;
}

/** Nobody has paid yet. The state every listener starts in. */
export const FREE: Entitlement = { kind: "free" };

/**
 * How many of the free ten are left.
 *
 * Counts distinct echoes heard, which is what `heardEchoIds` holds — so hearing the same
 * echo twice costs nothing, and neither does replaying something from My Echoes. Paying
 * for the same story a second time would be indefensible.
 *
 * Returns `Infinity` once unlocked rather than a big number, so a caller that formats it
 * has to notice and say "unlimited" instead of printing 999.
 */
export function freeEchoesLeft(entitlement: Entitlement, profile: ListenerProfile): number {
  if (entitlement.kind === "unlocked") return Infinity;
  const heard = new Set(profile.heardEchoIds ?? []).size;
  return Math.max(0, FREE_ECHO_LIMIT - heard);
}

/**
 * May this listener hear one more echo they have not heard before?
 *
 * Note the "they have not heard before" — an echo already in `heardEchoIds` is always
 * replayable, free tier or not. It is theirs. The limit is on how many DIFFERENT stories
 * the free tier opens, not on how often somebody may listen to what they already have.
 */
export function mayHearAnother(
  entitlement: Entitlement,
  profile: ListenerProfile,
  echoId: string,
): boolean {
  if (entitlement.kind === "unlocked") return true;
  if ((profile.heardEchoIds ?? []).includes(echoId)) return true;
  return freeEchoesLeft(entitlement, profile) > 0;
}

/**
 * What the price is, as the listener should see it.
 *
 * Here rather than in the UI because it is a fact about the product, and because a price
 * written into a button somewhere is a price that ends up differing from the one Stripe
 * charges. The real charge is defined in Stripe; this is what we promise, and the two
 * being one constant in one file is the smallest way to keep them honest.
 *
 * `docs/03-selling.md` also records the open question behind it: the plan carried both
 * $15.25 and ~$5.85 of contribution per customer and they cannot both be true of a single
 * $6.99 purchase. It says to plan against $5.85 until a real purchase says otherwise, and
 * nothing here assumes the higher figure.
 */
export const PRICE = {
  amountMinor: 699,
  currency: "USD",
  /** What a button says. One payment, and the word "once" is load-bearing. */
  label: "$6.99 once",
} as const;
