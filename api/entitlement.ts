/**
 * GET /api/entitlement?session_id=cs_...   (straight back from Checkout)
 * GET /api/entitlement?customer=cus_...    (restore, on a device that has bought before)
 *   ->  { customerId, entitlement }
 *
 * Reads what the customer has paid for from Stripe itself. The customer id is kept on the
 * device after the first purchase; until accounts exist it is the key, and restoring on a
 * different device waits for them (docs/03-selling.md).
 */
import { failure, isCustomerId, reply, stripe, configured } from "./_stripe.js";
import { lookup } from "./_lookup.js";

export async function GET(request: Request): Promise<Response> {
  if (!configured()) return reply(503, { error: "Payments are not switched on yet." });
  const url = new URL(request.url);
  try {
    let customerId = url.searchParams.get("customer");
    const sessionId = url.searchParams.get("session_id");
    if (sessionId) {
      if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return reply(400, { error: "Bad session." });
      const session = await stripe<{ customer: string | null; status: string }>("GET", `/checkout/sessions/${sessionId}`);
      if (session.status !== "complete" || !session.customer) return reply(402, { error: "That checkout did not complete." });
      customerId = session.customer;
    }
    if (!isCustomerId(customerId)) return reply(400, { error: "Nothing to look up." });
    return reply(200, { customerId, entitlement: await lookup(customerId) });
  } catch (error) {
    return failure(error);
  }
}
