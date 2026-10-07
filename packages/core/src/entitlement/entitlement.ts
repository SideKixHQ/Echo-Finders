/**
 * Who has paid, and what that buys.
 *
 * The model is written down in `docs/03-selling.md`: ten echoes free, then a City Pass
 * (one city, bought once, for good) or All-Access (everywhere, by the year). This file is
 * the engine's half of that, and it is deliberately the only place the rule lives.
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

import { distanceKm } from "../geo/great-circle.js";
import type { LatLng, ListenerProfile } from "../types.js";

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
 * A city a City Pass covers: a centre and a radius, nothing cleverer.
 *
 * An echo belongs to the first city whose circle it falls inside. One outside every circle
 * (a parkway, a flight path) belongs to no city and only All-Access opens it, which is the
 * honest answer: nobody bought "the Blue Ridge Parkway" by buying New York.
 *
 * A circle rather than a boundary because the boundary is a product decision, not a
 * survey: 40km from City Hall takes in the five boroughs and Jersey City, which is where
 * a visitor to New York would expect their pass to work.
 */
export interface City {
  readonly id: string;
  readonly name: string;
  readonly centre: LatLng;
  readonly radiusKm: number;
}

/** The cities a pass can be bought for. New cities are one line here. */
export const CITIES: readonly City[] = [
  { id: "new-york", name: "New York", centre: { lat: 40.7128, lng: -74.006 }, radiusKm: 40 },
];

/** The city this point is in, or null on the road and in the air. */
export function cityAt(at: LatLng, cities: readonly City[] = CITIES): City | null {
  return cities.find((c) => distanceKm(c.centre, at) <= c.radiusKm) ?? null;
}

/**
 * What a listener is entitled to.
 *
 * - `free`: the free ten, nothing bought.
 * - `passes`: City Passes (permanent, one per city) and/or All-Access (paid through a date).
 * - `unlocked`: the retired $6.99 lifetime unlock. Nobody can buy it any more, but anybody
 *   who did keeps everything, for good. That promise was made on the screen they paid on.
 */
export interface Entitlement {
  readonly kind: "free" | "passes" | "unlocked";
  /**
   * When the first thing was bought, epoch ms. Absent while free.
   *
   * Kept for the receipt and for support ("I paid in March and it is asking again").
   */
  readonly purchasedAt?: number;
  /** City ids with a City Pass. Permanent: a City Pass never expires. */
  readonly cities?: readonly string[];
  /** All-Access is paid through this time, epoch ms. Renewal moves it on a year. */
  readonly allAccessUntil?: number;
}

/** Nobody has paid yet. The state every listener starts in. */
export const FREE: Entitlement = { kind: "free" };

/** Does what they bought open everything, at this moment? */
export function hasEverything(entitlement: Entitlement, nowMs: number): boolean {
  if (entitlement.kind === "unlocked") return true;
  return (entitlement.allAccessUntil ?? 0) > nowMs;
}

/**
 * Does what they bought open an echo at this point?
 *
 * Everything, or a City Pass for the city it is in. Without a point only "everything"
 * answers yes, so a caller that forgets to say where never gives a story away.
 */
export function covers(entitlement: Entitlement, at: LatLng | undefined, nowMs: number): boolean {
  if (hasEverything(entitlement, nowMs)) return true;
  if (!at || !entitlement.cities?.length) return false;
  const city = cityAt(at);
  return city !== null && entitlement.cities.includes(city.id);
}

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
export function freeEchoesLeft(
  entitlement: Entitlement,
  profile: ListenerProfile,
  nowMs: number = 0,
): number {
  if (hasEverything(entitlement, nowMs)) return Infinity;
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
  /** Where the echo is, so a City Pass can answer. Omitted, only everything-passes do. */
  at?: LatLng,
  nowMs: number = 0,
): boolean {
  if (covers(entitlement, at, nowMs)) return true;
  if ((profile.heardEchoIds ?? []).includes(echoId)) return true;
  return freeEchoesLeft(entitlement, profile, nowMs) > 0;
}

/**
 * What we sell, as the listener should see it.
 *
 * Here rather than in the UI because it is a fact about the product, and because a price
 * written into a button somewhere is a price that ends up differing from the one Stripe
 * charges. The real charge is defined in Stripe; this is what we promise.
 *
 * Two offers, from `docs/11-pricing-research.md` and the margin sums in `docs/03-selling.md`:
 * a City Pass for the visitor on a two-day trip, bought once with nothing to cancel, and
 * All-Access for the traveller who will cross several cities, a road trip and a flight in
 * a year. The $6.99 lifetime unlock is retired: it priced under every comparable product
 * and earned nothing from the second city onwards.
 */
export const PLANS = {
  city: {
    id: "city-pass",
    name: "City Pass",
    amountMinor: 999,
    currency: "USD",
    price: "$9.99",
    /** The word "once" is load-bearing: no renewal, nothing to cancel. */
    per: "once",
  },
  allAccess: {
    id: "all-access",
    name: "All-Access",
    amountMinor: 3499,
    currency: "USD",
    price: "$34.99",
    per: "a year",
  },
} as const;

/** How long one payment for All-Access lasts. */
export const ALL_ACCESS_TERM_MS = 365 * 24 * 60 * 60 * 1000;
