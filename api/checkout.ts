/**
 * POST /api/checkout  { plan: "city" | "allAccess", cityId?, customerId? }  ->  { url }
 *
 * Opens a Stripe Checkout page. A City Pass is a one-off payment that remembers its city;
 * All-Access is a yearly subscription. Stripe's page takes the card, so no card details
 * ever touch this app. Afterwards Stripe sends the listener back with a session id, which
 * `/api/entitlement` turns into what they now own.
 */
import { CITIES } from "@echofinders/core";
import { configured, failure, isCustomerId, reply, stripe } from "./_stripe.js";

/**
 * The same on both plans. A billing address is always asked for: it is what sales tax is
 * worked out from, and what the US-only Radar rule checks against the card (DEPLOY.md).
 * Automatic sales tax is a switch, `STRIPE_AUTOMATIC_TAX=on`, because Stripe refuses it
 * until the business address and the states collected in are set up in the dashboard,
 * which only James can do.
 */
function taxAndAddress(customer: string | undefined): Record<string, string> {
  const tax = process.env.STRIPE_AUTOMATIC_TAX === "on";
  return {
    billing_address_collection: "required",
    ...(tax ? { "automatic_tax[enabled]": "true" } : {}),
    // A returning customer's address is saved back to them, which automatic tax needs.
    ...(tax && customer ? { "customer_update[address]": "auto" } : {}),
  };
}

export async function POST(request: Request): Promise<Response> {
  if (!configured()) return reply(503, { error: "Payments are not switched on yet." });
  const body = (await request.json().catch(() => ({}))) as { plan?: unknown; cityId?: unknown; customerId?: unknown };
  const origin = new URL(request.url).origin;
  const customer = isCustomerId(body.customerId) ? body.customerId : undefined;

  try {
    if (body.plan === "city") {
      const city = CITIES.find((c) => c.id === body.cityId);
      if (!city) return reply(400, { error: "That is not a city with a City Pass." });
      const session = await stripe<{ url: string }>("POST", "/checkout/sessions", {
        mode: "payment",
        "line_items[0][price]": process.env.STRIPE_PRICE_CITY_PASS,
        "line_items[0][quantity]": 1,
        "metadata[plan]": "city-pass",
        "metadata[city]": city.id,
        "payment_intent_data[metadata][plan]": "city-pass",
        "payment_intent_data[metadata][city]": city.id,
        ...(customer ? { customer } : { customer_creation: "always" }),
        ...taxAndAddress(customer),
        success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?checkout=cancelled`,
      });
      return reply(200, { url: session.url });
    }
    if (body.plan === "allAccess") {
      const session = await stripe<{ url: string }>("POST", "/checkout/sessions", {
        mode: "subscription",
        "line_items[0][price]": process.env.STRIPE_PRICE_ALL_ACCESS,
        "line_items[0][quantity]": 1,
        "metadata[plan]": "all-access",
        "subscription_data[metadata][plan]": "all-access",
        ...(customer ? { customer } : {}),
        ...taxAndAddress(customer),
        success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?checkout=cancelled`,
      });
      return reply(200, { url: session.url });
    }
    return reply(400, { error: "Unknown plan." });
  } catch (error) {
    return failure(error);
  }
}
