/**
 * Which places this listener has paid for, so "Your passes" can offer to save them.
 *
 * The rule is the engine's (`covers`, `hasEverything`, `CITIES`); only the source of the
 * entitlement is missing. The web app keeps it in localStorage (`entitlement-store.ts`),
 * which the phone cannot read, and the native app has no purchase yet.
 *
 * TODO(step 5, in-app purchase): replace `currentEntitlement` with the real one, from the
 * App Store receipt or the account. Nothing else here, or above it, changes.
 */
import { CITIES, hasEverything, weekPassUntil, type City, type Entitlement } from "@echofinders/core";

/**
 * Until step 5, the native preview treats every listener as holding a pass for every city,
 * so the save flow can be tried on a phone. Preview builds only: the App Store build is
 * still the WebView shell (ADR-0012), which never reaches this file.
 */
const PREVIEW_ENTITLEMENT: Entitlement = { kind: "passes", cities: CITIES.map((c) => c.id) };

export function currentEntitlement(): Entitlement {
  return PREVIEW_ENTITLEMENT;
}

/** The cities whose echoes this entitlement opens now: every one with All-Access. */
export function paidCities(entitlement: Entitlement = currentEntitlement(), nowMs: number = Date.now()): City[] {
  if (hasEverything(entitlement, nowMs)) return [...CITIES];
  return CITIES.filter(
    (c) => entitlement.cities?.includes(c.id) || weekPassUntil(entitlement, c.id, nowMs) > nowMs,
  );
}
