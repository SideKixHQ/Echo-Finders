/**
 * POST /api/checkout  { plan: "week" | "city" | "allAccess", cityId?, customerId? }  ->  { url }
 *
 * Opens a Stripe Checkout page. A City Pass is a one-off payment that remembers its city;
 * All-Access is a yearly subscription. Stripe's page takes the card, so no card details
 * ever touch this app. Afterwards Stripe sends the listener back with a session id, which
 * `/api/entitlement` turns into what they now own.
 */
import { CITIES, PLANS, cityPassPriceMinor, type City } from "@echofinders/core";
import { configured, failure, isCustomerId, reply, stripe } from "./_stripe.js";
import { lookup } from "./_lookup.js";

/**
 * A one-off price written into the session rather than a price id from the dashboard.
 *
 * Used for the Week Pass and for a City Pass bought by someone whose Week Pass is still
 * running, who pays the difference (`cityPassPriceMinor`). Both amounts come from `PLANS`,
 * so the number on the screen and the number charged are the same constant, and nothing
 * new has to be set up in Stripe for either.
 */
function inlinePrice(amountMinor: number, name: string): Record<string, string | number> {
  return {
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": amountMinor,
    "line_items[0][price_data][product_data][name]": name,
    "line_items[0][quantity]": 1,
  };
}

/** The label on every Echo Finders payment in the shared Stripe account. */
const APP = "echo-finders";

/**
 * Added after "SIDEKIX* " on a card statement. A subscription cannot take a suffix per
 * checkout, so All-Access gets the same words from its product's statement descriptor,
 * set in the Stripe dashboard (DEPLOY.md).
 */
const STATEMENT_SUFFIX = "ECHO FINDERS";

function oneOff(plan: "city-pass" | "week-pass", city: City, customer: string | undefined, origin: string) {
  return {
    mode: "payment",
    "metadata[plan]": plan,
    "metadata[city]": city.id,
    "payment_intent_data[metadata][plan]": plan,
    "payment_intent_data[metadata][city]": city.id,
    // Which app took the money. The Stripe account is shared with SideKix (2026-11-08), so
    // anything that has to find Echo Finders' own payments or subscriptions, such as the
    // All-Access renewal reminder, finds them by this label.
    "payment_intent_data[metadata][app]": APP,
    "metadata[app]": APP,
    // What the buyer's bank statement says. On its own the shared account prints "SIDEKIX",
    // which nobody who bought an Echo Finders pass would recognise, and an unrecognised
    // charge becomes a dispute. Stripe joins the suffix to the account's short descriptor,
    // "SIDEKIX* ECHO FINDERS", inside the 22 characters a card statement allows.
    "payment_intent_data[statement_descriptor_suffix]": STATEMENT_SUFFIX,
    ...(customer ? { customer } : { customer_creation: "always" }),
    ...taxAndAddress(customer),
    success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/?checkout=cancelled`,
  };
}

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
    if (body.plan === "week") {
      const city = CITIES.find((c) => c.id === body.cityId);
      if (!city) return reply(400, { error: "That is not a city with a Week Pass." });
      const session = await stripe<{ url: string }>("POST", "/checkout/sessions", {
        ...(process.env.STRIPE_PRICE_WEEK_PASS
          ? { "line_items[0][price]": process.env.STRIPE_PRICE_WEEK_PASS, "line_items[0][quantity]": 1 }
          : inlinePrice(PLANS.week.amountMinor, `${city.name} ${PLANS.week.name}`)),
        ...oneOff("week-pass", city, customer, origin),
      });
      return reply(200, { url: session.url });
    }
    if (body.plan === "city") {
      const city = CITIES.find((c) => c.id === body.cityId);
      if (!city) return reply(400, { error: "That is not a city with a City Pass." });
      // A Week Pass still running counts towards it. Checked against Stripe, not the phone's
      // word for it: the discount is only given to a customer Stripe says paid for the week.
      const owed = customer ? cityPassPriceMinor(await lookup(customer), city.id, Date.now()) : PLANS.city.amountMinor;
      const upgrade = owed < PLANS.city.amountMinor;
      const price =
        upgrade && process.env.STRIPE_PRICE_CITY_UPGRADE && owed === PLANS.city.amountMinor - PLANS.week.amountMinor
          ? { "line_items[0][price]": process.env.STRIPE_PRICE_CITY_UPGRADE, "line_items[0][quantity]": 1 }
          : upgrade
            ? inlinePrice(owed, `${city.name} ${PLANS.city.name} (your Week Pass counted)`)
            : { "line_items[0][price]": process.env.STRIPE_PRICE_CITY_PASS, "line_items[0][quantity]": 1 };
      const session = await stripe<{ url: string }>("POST", "/checkout/sessions", {
        ...price,
        ...oneOff("city-pass", city, customer, origin),
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
        "subscription_data[metadata][app]": APP,
        "metadata[app]": APP,
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
