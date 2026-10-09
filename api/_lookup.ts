/** What a Stripe customer owns, read from Stripe itself. Shared by `entitlement` and `renewal`. */
import type { Entitlement } from "@echofinders/core";
import { stripe } from "./_stripe.js";
import { entitlementFrom, type PaidSession, type Subscription } from "./_entitlement.js";

export async function lookup(customerId: string): Promise<Entitlement> {
  const [sessions, subscriptions] = await Promise.all([
    stripe<{ data: PaidSession[] }>("GET", "/checkout/sessions", { customer: customerId, limit: 100 }),
    stripe<{ data: Subscription[] }>("GET", "/subscriptions", { customer: customerId, status: "all", limit: 100 }),
  ]);
  return entitlementFrom(sessions.data, subscriptions.data);
}
