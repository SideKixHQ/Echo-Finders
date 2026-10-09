/**
 * POST /api/portal  { customerId }  ->  { url }
 *
 * Stripe's own customer portal: change the card on file, see receipts, cancel All-Access.
 * The card never touches this app; Stripe holds it.
 */
import { configured, failure, isCustomerId, reply, stripe } from "./_stripe.js";

export async function POST(request: Request): Promise<Response> {
  if (!configured()) return reply(503, { error: "Payments are not switched on yet." });
  const body = (await request.json().catch(() => ({}))) as { customerId?: unknown };
  if (!isCustomerId(body.customerId)) return reply(400, { error: "No purchase on this device yet." });
  try {
    const session = await stripe<{ url: string }>("POST", "/billing_portal/sessions", {
      customer: body.customerId,
      return_url: `${new URL(request.url).origin}/?portal=back`,
    });
    return reply(200, { url: session.url });
  } catch (error) {
    return failure(error);
  }
}
