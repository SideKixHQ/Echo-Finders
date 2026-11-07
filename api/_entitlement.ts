/**
 * What a Stripe customer has bought, as the app's own Entitlement.
 *
 * Pure, so it is tested without Stripe. Until there are accounts and an entitlement store
 * (docs/03-selling.md), Stripe itself is the record of who paid for what: every City Pass and
 * Week Pass is a paid Checkout Session carrying its city, and All-Access is a subscription.
 * A Week Pass runs seven days from the moment it was paid for (`created`).
 */

import { WEEK_PASS_TERM_MS, type Entitlement, type WeekPass } from "@echofinders/core";

/** The few fields of a Checkout Session this reads. */
export interface PaidSession {
  readonly payment_status: string;
  readonly created: number;
  readonly metadata?: Record<string, string> | null;
  /**
   * Expanded to its latest charge by `lookup`. A refund is recorded on the charge, not the
   * session: a fully refunded purchase still has `payment_status: "paid"`.
   */
  readonly payment_intent?: string | { readonly latest_charge?: string | { readonly refunded?: boolean } | null } | null;
}

/** Paid, and not since refunded in full. A partial refund keeps the pass. */
function stillPaid(s: PaidSession): boolean {
  if (s.payment_status !== "paid") return false;
  const intent = s.payment_intent;
  const charge = intent && typeof intent === "object" ? intent.latest_charge : null;
  return !(charge && typeof charge === "object" && charge.refunded === true);
}

/** The few fields of a Subscription this reads. */
export interface Subscription {
  readonly status: string;
  readonly created: number;
  readonly current_period_end: number;
  readonly cancel_at_period_end: boolean;
  readonly metadata?: Record<string, string> | null;
}

/** Subscription states that still open the year paid for. */
const LIVE = new Set(["active", "trialing", "past_due"]);

export function entitlementFrom(
  sessions: readonly PaidSession[],
  subscriptions: readonly Subscription[],
): Entitlement {
  const passes = sessions.filter((s) => stillPaid(s) && s.metadata?.plan === "city-pass" && s.metadata.city);
  const cities = [...new Set(passes.map((s) => s.metadata!.city!))].sort();
  const weeks = sessions.filter((s) => stillPaid(s) && s.metadata?.plan === "week-pass" && s.metadata.city);
  // The latest week per city; one bought before the previous ended runs on from it.
  const weekPasses: WeekPass[] = [];
  for (const city of [...new Set(weeks.map((s) => s.metadata!.city!))].sort()) {
    let until = 0;
    for (const s of weeks.filter((w) => w.metadata!.city === city).sort((a, b) => a.created - b.created)) {
      until = Math.max(s.created * 1000, until) + WEEK_PASS_TERM_MS;
    }
    weekPasses.push({ city, until });
  }
  const live = subscriptions
    .filter((s) => LIVE.has(s.status) && s.metadata?.plan !== "other")
    .sort((a, b) => b.current_period_end - a.current_period_end)[0];

  const firsts = [...passes.map((s) => s.created), ...weeks.map((s) => s.created), ...subscriptions.map((s) => s.created)];
  if (!cities.length && !weekPasses.length && !live) return { kind: "free" };
  return {
    kind: "passes",
    purchasedAt: Math.min(...firsts) * 1000,
    ...(cities.length ? { cities } : {}),
    ...(weekPasses.length ? { weekPasses } : {}),
    ...(live ? { allAccessUntil: live.current_period_end * 1000 } : {}),
    ...(live && live.cancel_at_period_end ? { renews: false } : {}),
  };
}
