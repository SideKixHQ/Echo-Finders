/**
 * POST /api/renewal  { customerId, on }  ->  { entitlement }
 *
 * Cancel All-Access renewal, or turn it back on: Stripe's `cancel_at_period_end`, so the
 * year already paid for stays open to its last day, which is what Settings promises.
 */
import { configured, failure, isCustomerId, reply, stripe } from "./_stripe.js";
import { lookup } from "./_lookup.js";

export async function POST(request: Request): Promise<Response> {
  if (!configured()) return reply(503, { error: "Payments are not switched on yet." });
  const body = (await request.json().catch(() => ({}))) as { customerId?: unknown; on?: unknown };
  if (!isCustomerId(body.customerId) || typeof body.on !== "boolean") return reply(400, { error: "Bad request." });
  try {
    const subs = await stripe<{ data: { id: string; status: string }[] }>("GET", "/subscriptions", {
      customer: body.customerId,
      status: "active",
      limit: 10,
    });
    for (const sub of subs.data) {
      await stripe("POST", `/subscriptions/${sub.id}`, { cancel_at_period_end: !body.on });
    }
    return reply(200, { entitlement: await lookup(body.customerId) });
  } catch (error) {
    return failure(error);
  }
}
