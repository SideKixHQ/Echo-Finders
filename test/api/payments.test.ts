/**
 * The payment functions in `api/`, against a Stripe that is only a recorded fetch.
 *
 * Nothing here talks to Stripe. What is checked is what we send it (the price, the city, the
 * mode, where it sends the listener back to) and what we make of its answers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { entitlementFrom } from "../../api/_entitlement.js";
import { POST as checkout } from "../../api/checkout.js";
import { GET as config } from "../../api/config.js";
import { GET as entitlement } from "../../api/entitlement.js";
import { POST as portal } from "../../api/portal.js";
import { POST as renewal } from "../../api/renewal.js";

const DAY = 86_400;
const ENV = { STRIPE_SECRET_KEY: "sk_test_x", STRIPE_PRICE_CITY_PASS: "price_city", STRIPE_PRICE_ALL_ACCESS: "price_all" };

/** Every request we made, and a queue of answers to give. */
let sent: { method: string; url: string; body: URLSearchParams }[] = [];
let answers: unknown[] = [];
beforeEach(() => {
  sent = [];
  answers = [];
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const u = new URL(url);
    sent.push({ method: init.method ?? "GET", url: u.pathname, body: new URLSearchParams(String(init.body ?? u.search.slice(1))) });
    return new Response(JSON.stringify(answers.shift() ?? {}), { status: 200 });
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const post = (path: string, body: unknown) =>
  new Request(`https://echo-finders.vercel.app${path}`, { method: "POST", body: JSON.stringify(body) });

describe("what a customer owns, from Stripe's records", () => {
  it("is free with nothing paid", () => {
    expect(entitlementFrom([], [])).toEqual({ kind: "free" });
  });

  it("collects every paid City Pass, and ignores an unpaid one", () => {
    const e = entitlementFrom(
      [
        { payment_status: "paid", created: 100, metadata: { plan: "city-pass", city: "nyc" } },
        { payment_status: "unpaid", created: 200, metadata: { plan: "city-pass", city: "miami" } },
      ],
      [],
    );
    expect(e).toEqual({ kind: "passes", purchasedAt: 100_000, cities: ["nyc"] });
  });

  it("opens All-Access to the end of the period paid for, and says when it will not renew", () => {
    const end = 400 * DAY;
    const e = entitlementFrom([], [{ status: "active", created: 5, current_period_end: end, cancel_at_period_end: true }]);
    expect(e).toEqual({ kind: "passes", purchasedAt: 5000, allAccessUntil: end * 1000, renews: false });
  });

  it("does not count a cancelled subscription", () => {
    expect(entitlementFrom([], [{ status: "canceled", created: 5, current_period_end: 9, cancel_at_period_end: false }])).toEqual({ kind: "free" });
  });
});

describe("switched off until the keys exist", () => {
  it("says so, and refuses to open a checkout", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect(await (await config()).json()).toEqual({ payments: false });
    expect((await checkout(post("/api/checkout", { plan: "allAccess" }))).status).toBe(503);
    expect(sent).toEqual([]);
  });

  it("says payments are on once all three are set", async () => {
    expect(await (await config()).json()).toEqual({ payments: true });
  });
});

describe("checkout", () => {
  it("opens a one-off City Pass payment that remembers its city", async () => {
    answers.push({ url: "https://checkout.stripe.com/c/1" });
    const res = await checkout(post("/api/checkout", { plan: "city", cityId: "new-york" }));
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.com/c/1" });
    const { url, body } = sent[0]!;
    expect(url).toBe("/v1/checkout/sessions");
    expect(body.get("mode")).toBe("payment");
    expect(body.get("line_items[0][price]")).toBe("price_city");
    expect(body.get("metadata[city]")).toBe("new-york");
    expect(body.get("customer_creation")).toBe("always");
    expect(body.get("success_url")).toBe("https://echo-finders.vercel.app/?checkout=success&session_id={CHECKOUT_SESSION_ID}");
  });

  it("opens All-Access as a yearly subscription, for the customer already known", async () => {
    answers.push({ url: "https://checkout.stripe.com/c/2" });
    await checkout(post("/api/checkout", { plan: "allAccess", customerId: "cus_123" }));
    const { body } = sent[0]!;
    expect(body.get("mode")).toBe("subscription");
    expect(body.get("line_items[0][price]")).toBe("price_all");
    expect(body.get("customer")).toBe("cus_123");
  });

  it("always asks for a billing address, and adds sales tax only when switched on", async () => {
    answers.push({ url: "u" }, { url: "u" });
    await checkout(post("/api/checkout", { plan: "city", cityId: "new-york" }));
    expect(sent[0]!.body.get("billing_address_collection")).toBe("required");
    expect(sent[0]!.body.get("automatic_tax[enabled]")).toBeNull();
    vi.stubEnv("STRIPE_AUTOMATIC_TAX", "on");
    await checkout(post("/api/checkout", { plan: "allAccess", customerId: "cus_123" }));
    expect(sent[1]!.body.get("automatic_tax[enabled]")).toBe("true");
    expect(sent[1]!.body.get("customer_update[address]")).toBe("auto");
  });

  it("refuses a city with no pass, and a plan that does not exist", async () => {
    expect((await checkout(post("/api/checkout", { plan: "city", cityId: "atlantis" }))).status).toBe(400);
    expect((await checkout(post("/api/checkout", { plan: "lifetime" }))).status).toBe(400);
    expect(sent).toEqual([]);
  });
});

describe("coming back from Stripe", () => {
  it("turns a completed checkout into what the customer now owns", async () => {
    answers.push(
      { status: "complete", customer: "cus_9" },
      { data: [{ payment_status: "paid", created: 10, metadata: { plan: "city-pass", city: "nyc" } }] },
      { data: [] },
    );
    const res = await entitlement(new Request("https://x.test/api/entitlement?session_id=cs_test_abc"));
    expect(await res.json()).toEqual({ customerId: "cus_9", entitlement: { kind: "passes", purchasedAt: 10_000, cities: ["nyc"] } });
  });

  it("gives nothing for a checkout that did not complete", async () => {
    answers.push({ status: "open", customer: null });
    const res = await entitlement(new Request("https://x.test/api/entitlement?session_id=cs_test_abc"));
    expect(res.status).toBe(402);
  });

  it("will not look up anything that is not a customer id", async () => {
    const res = await entitlement(new Request("https://x.test/api/entitlement?customer=../../balance"));
    expect(res.status).toBe(400);
    expect(sent).toEqual([]);
  });
});

describe("managing it afterwards", () => {
  it("sends the card and receipts to Stripe's own page", async () => {
    answers.push({ url: "https://billing.stripe.com/p/1" });
    const res = await portal(post("/api/portal", { customerId: "cus_9" }));
    expect(await res.json()).toEqual({ url: "https://billing.stripe.com/p/1" });
    expect(sent[0]!.body.get("return_url")).toBe("https://echo-finders.vercel.app/?portal=back");
  });

  it("cancels renewal at the end of the year paid for, never sooner", async () => {
    answers.push({ data: [{ id: "sub_1", status: "active" }] }, {}, { data: [] }, { data: [] });
    await renewal(post("/api/renewal", { customerId: "cus_9", on: false }));
    const update = sent.find((s) => s.url === "/v1/subscriptions/sub_1")!;
    expect(update.method).toBe("POST");
    expect(update.body.get("cancel_at_period_end")).toBe("true");
  });
});
