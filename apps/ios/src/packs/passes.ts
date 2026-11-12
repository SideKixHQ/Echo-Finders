/**
 * Which places this listener has paid for, so "Your passes" can offer to save them.
 *
 * The rule is the engine's (`hasEverything`, `weekPassUntil`, `CITIES`); the entitlement
 * is the real one, from the App Store, the website and a Skeleton key, merged in
 * `purchases/PurchasesProvider.tsx` (`usePurchases().entitlement`).
 */
import { CITIES, hasEverything, weekPassUntil, type City, type Entitlement } from "@echofinders/core";

/** The cities whose echoes this entitlement opens now: every one with All-Access. */
export function paidCities(entitlement: Entitlement, nowMs: number = Date.now()): City[] {
  if (hasEverything(entitlement, nowMs)) return [...CITIES];
  return CITIES.filter(
    (c) => entitlement.cities?.includes(c.id) || weekPassUntil(entitlement, c.id, nowMs) > nowMs,
  );
}
