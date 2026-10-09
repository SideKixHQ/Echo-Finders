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
 *   4. Stripe Checkout                                  BUILT, off until the keys are in
 *                                                       Vercel (`payments.ts`, `api/`).
 *                                                       Stripe is the record meanwhile.
 *
 * What it does give is the shape. `buyCityPass()` and `buyAllAccess()` are what a Stripe
 * webhook's success redirect will call, `readEntitlement()` is what a session start will
 * hydrate from a server, and every screen above already treats them as the truth. When
 * links 1, 2 and 4 land, this file gets a network call and nothing above it changes.
 *
 * Until then it is honest about what it is: a device-local flag, cleared by clearing the
 * browser, and the paywall says so out loud rather than implying a receipt exists.
 */

import { ALL_ACCESS_TERM_MS, FREE, withRenewal, type Entitlement } from "@echofinders/core";

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
    const parsed = JSON.parse(raw) as Record<string, unknown> | null;
    if (typeof parsed !== "object" || parsed === null) return FREE;
    const at = typeof parsed.purchasedAt === "number" ? { purchasedAt: parsed.purchasedAt } : {};
    // The retired $6.99 unlock. Whoever bought it keeps everything.
    if (parsed.kind === "unlocked") return { kind: "unlocked", ...at };
    if (parsed.kind === "passes") {
      const cities = Array.isArray(parsed.cities)
        ? parsed.cities.filter((c): c is string => typeof c === "string")
        : [];
      const until = typeof parsed.allAccessUntil === "number" ? parsed.allAccessUntil : undefined;
      return {
        kind: "passes",
        ...at,
        ...(cities.length ? { cities } : {}),
        ...(until !== undefined ? { allAccessUntil: until } : {}),
        // Only an explicit false: anything unreadable keeps renewing, as it was bought to.
        ...(until !== undefined && parsed.renews === false ? { renews: false } : {}),
      };
    }
    return FREE;
  } catch {
    return FREE;
  }
}

/**
 * Writing can fail (a private window, storage disabled, a full quota) and it fails
 * quietly. Somebody who has just paid and whose browser refuses to remember it still gets
 * the rest of this session, because the caller holds the value in state too. They will be
 * asked again next time, which is bad, and they will not be robbed of the thing they just
 * bought right now, which is worse.
 */
function save(next: Entitlement): Entitlement {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Session-only. See above. */
  }
  return next;
}

/**
 * Keep what Stripe says this device owns (`payments.ts`). The server's answer replaces the
 * device record whole: it is the record now, and merging could resurrect a cancelled year.
 */
export function storeEntitlement(next: Entitlement): Entitlement {
  return save(next);
}

/** What is already held, as passes, so buying a second thing never drops the first. */
function asPasses(current: Entitlement, at: number): Entitlement {
  if (current.kind === "passes") return current;
  return { kind: "passes", purchasedAt: at };
}

/**
 * Record a City Pass.
 *
 * The signature is the one a real flow wants: a Stripe webhook confirms, the app calls
 * this, every screen re-reads. What is missing underneath is the confirmation, not the
 * shape — so when Checkout lands, this grows an `await` and its callers do not change.
 */
export function buyCityPass(
  current: Entitlement,
  cityId: string,
  at: number = Date.now(),
): Entitlement {
  if (current.kind === "unlocked") return current;
  const base = asPasses(current, at);
  const cities = [...new Set([...(base.cities ?? []), cityId])];
  return save({ ...base, cities });
}

/**
 * Record a year of All-Access, added on to any time still left. Buying it is choosing it
 * again, so a renewal cancelled earlier is back on.
 */
export function buyAllAccess(current: Entitlement, at: number = Date.now()): Entitlement {
  if (current.kind === "unlocked") return current;
  const base = asPasses(current, at);
  const from = Math.max(at, base.allAccessUntil ?? 0);
  return save(withRenewal({ ...base, allAccessUntil: from + ALL_ACCESS_TERM_MS }, true));
}

/**
 * Cancel All-Access renewal, or turn it back on. The year already paid for stays open to
 * its last day either way.
 *
 * When Stripe lands this becomes the subscription's `cancel_at_period_end`, which is the
 * same promise: no refund dance, no access taken early, just no next charge.
 */
export function setAllAccessRenewal(current: Entitlement, on: boolean): Entitlement {
  const next = withRenewal(current, on);
  return next === current ? current : save(next);
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
