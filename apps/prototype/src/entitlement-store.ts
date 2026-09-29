/**
 * Where a purchase lives, until there is somewhere real to put it.
 *
 * `docs/03-selling.md` is blunt about the hard half of selling: a purchase needs something
 * to attach to, and there is nothing. No account, no server, no identity. The collection
 * already lives in IndexedDB on one device, and a payment against that is a payment
 * somebody loses when they clear their browser or pick up their phone instead of their
 * laptop.
 *
 * This does not solve that, and it must not pretend to. It is the local half of a chain
 * whose other three links do not exist yet:
 *
 *   1. an identity          email and a magic link      NOT BUILT
 *   2. an entitlement store one row: who, what, when    NOT BUILT (Supabase, deferred)
 *   3. a gate the engine sees                           BUILT, in `entitlement.ts`
 *   4. Stripe Checkout and a webhook                    NOT BUILT
 *
 * What it does give is the shape. `unlock()` is the function a Stripe webhook's success
 * redirect will call, `read()` is what a session start will hydrate from a server, and
 * every screen above already treats both as the truth. When links 1, 2 and 4 land, this
 * file gets a network call and nothing above it changes.
 *
 * Until then it is honest about what it is: a device-local flag, cleared by clearing the
 * browser, and the paywall says so out loud rather than implying a receipt exists.
 */

import { FREE, type Entitlement } from "@echofinders/core";

const KEY = "echo-finders:entitlement";

/**
 * What this device has paid for.
 *
 * Anything unparseable is treated as free rather than thrown. A corrupt value should cost
 * somebody a re-purchase prompt they can complain about, never a white screen — and a
 * listener locked out of an app that will not start cannot even reach support.
 */
export function readEntitlement(): Entitlement {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return FREE;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as { kind?: unknown }).kind === "unlocked"
    ) {
      const at = (parsed as { purchasedAt?: unknown }).purchasedAt;
      return { kind: "unlocked", ...(typeof at === "number" ? { purchasedAt: at } : {}) };
    }
    return FREE;
  } catch {
    return FREE;
  }
}

/**
 * Record a purchase.
 *
 * The signature is the one a real flow wants: a Stripe webhook confirms, the app calls
 * this, every screen re-reads. What is missing underneath is the confirmation, not the
 * shape — so when Checkout lands, this grows an `await` and its callers do not change.
 *
 * Writing can fail (a private window, storage disabled, a full quota) and it fails
 * quietly. Somebody who has just paid and whose browser refuses to remember it still gets
 * the rest of this session unlocked, because the caller holds the value in state too.
 * They will be asked again next time, which is bad, and they will not be robbed of the
 * thing they just bought right now, which is worse.
 */
export function unlock(at: number = Date.now()): Entitlement {
  const next: Entitlement = { kind: "unlocked", purchasedAt: at };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Session-only. See above. */
  }
  return next;
}

/**
 * Put it back to free.
 *
 * For development and for a support path that does not exist yet. Not reachable from the
 * interface: nothing in a shipping app should be one tap from deleting something somebody
 * paid for.
 */
export function resetEntitlement(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* Nothing to clear. */
  }
}
