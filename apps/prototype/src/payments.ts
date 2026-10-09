/**
 * Real payments, through Stripe, once they are switched on.
 *
 * The server half is `api/` (Vercel functions holding the secret key). This is the device
 * half. It asks `/api/config` whether payments are on, and until all three keys are set in
 * Vercel the answer is no. Then every screen keeps doing what it did before: the purchase is
 * recorded on this device and nothing is charged (`entitlement-store.ts`). So this can
 * ship before the keys exist, and turning payments on is a settings change, not a deploy.
 *
 * Stripe is the record of who paid for what until there are accounts (`docs/03-selling.md`,
 * ADR to follow). The device keeps the Stripe customer id, which is how Restore finds the
 * purchases again. Restoring on a different phone waits for accounts.
 */

import type { Entitlement } from "@echofinders/core";
import { storeEntitlement } from "./entitlement-store";

const CUSTOMER = "echo-finders:customer";

let ready: Promise<boolean> | null = null;

/**
 * Are real payments on? Asked once per page. Anything other than a clear yes is a no: the
 * local preview has no `/api` at all and answers with the app's own HTML.
 */
export function paymentsReady(): Promise<boolean> {
  ready ??= fetch("/api/config", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j: unknown) => (j as { payments?: unknown } | null)?.payments === true)
    .catch(() => false);
  return ready;
}

/** The Stripe customer this device has bought as, if it has. */
export function customerId(): string | null {
  try {
    const id = localStorage.getItem(CUSTOMER);
    return id && /^cus_[A-Za-z0-9]+$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

function rememberCustomer(id: string): void {
  try {
    localStorage.setItem(CUSTOMER, id);
  } catch {
    /* Session-only, like the entitlement itself. */
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Payments are not answering. Try again in a moment.");
  return json;
}

/** Off to Stripe's checkout page. The page leaves, so this only returns if it fails. */
export async function startCheckout(plan: "city" | "allAccess", cityId?: string): Promise<void> {
  const { url } = await call<{ url: string }>("/api/checkout", {
    method: "POST",
    body: JSON.stringify({ plan, cityId, customerId: customerId() ?? undefined }),
  });
  window.location.assign(url);
}

/**
 * Back from Stripe: `?checkout=success&session_id=…`. Reads what was bought from Stripe
 * itself rather than trusting the address bar, keeps it, and tidies the address so a reload
 * does not ask again.
 */
export async function finishCheckout(): Promise<Entitlement | null> {
  const params = new URLSearchParams(window.location.search);
  const outcome = params.get("checkout") ?? params.get("portal");
  if (!outcome) return null;
  const sessionId = params.get("session_id");
  window.history.replaceState(null, "", window.location.pathname + window.location.hash);
  if (params.get("checkout") === "success" && sessionId) {
    const back = await call<{ customerId: string; entitlement: Entitlement }>(
      `/api/entitlement?session_id=${encodeURIComponent(sessionId)}`,
    );
    rememberCustomer(back.customerId);
    return storeEntitlement(back.entitlement);
  }
  // Back from the card page, where renewal may have been changed: read it again.
  if (params.get("portal") === "back") return restoreFromStripe();
  return null;
}

/** Restore: what Stripe says this device's customer owns, or null if it has never bought. */
export async function restoreFromStripe(): Promise<Entitlement | null> {
  const id = customerId();
  if (!id) return null;
  const back = await call<{ entitlement: Entitlement }>(`/api/entitlement?customer=${id}`);
  return storeEntitlement(back.entitlement);
}

/** Stripe's own page for the card on file, receipts, and cancelling. */
export async function openCardPage(): Promise<void> {
  const id = customerId();
  if (!id) throw new Error("No purchase on this device yet.");
  const { url } = await call<{ url: string }>("/api/portal", {
    method: "POST",
    body: JSON.stringify({ customerId: id }),
  });
  window.location.assign(url);
}

/** Cancel All-Access renewal or turn it back on, at Stripe. The year paid for stays. */
export async function setRenewalAtStripe(on: boolean): Promise<Entitlement> {
  const id = customerId();
  if (!id) throw new Error("No purchase on this device yet.");
  const back = await call<{ entitlement: Entitlement }>("/api/renewal", {
    method: "POST",
    body: JSON.stringify({ customerId: id, on }),
  });
  return storeEntitlement(back.entitlement);
}
