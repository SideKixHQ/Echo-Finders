/**
 * Restore on another phone (`api/restore.ts`), against a Stripe that is only a recorded fetch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as restore, normaliseReceipt } from "../../api/restore.js";

const ENV = { STRIPE_SECRET_KEY: "sk_test_x", STRIPE_PRICE_CITY_PASS: "price_city", STRIPE_PRICE_ALL_ACCESS: "price_all" };

/** Stripe's answers by path, and every path asked for. */
let answers: Record<string, unknown> = {};
let asked: string[] = [];
beforeEach(() => {
  asked = [];
  answers = {};
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
  vi.stubGlobal("fetch", async (url: string) => {
    const u = new URL(url);
    const key = `${u.pathname}?${u.searchParams.get("email") ?? u.searchParams.get("customer") ?? ""}`;
    asked.push(key);
    return new Response(JSON.stringify(answers[key] ?? answers[u.pathname] ?? { data: [] }), { status: 200 });
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const post = (body: unknown) =>
  new Request("https://echo-finders.vercel.app/api/restore", { method: "POST", body: JSON.stringify(body) });

describe("restore with a receipt", () => {
  it("reads receipt numbers however they are typed", () => {
    expect(normaliseReceipt(" 1234-5678 ")).toBe("12345678");
    expect(normaliseReceipt("1234 5678")).toBe("12345678");
  });

  it("gives back what the customer owns when the email and receipt number match", async () => {
    answers["/v1/customers?ann@example.com"] = { data: [{ id: "cus_ann" }] };
    answers["/v1/charges?cus_ann"] = { data: [{ receipt_number: "1234-5678", paid: true }] };
    answers["/v1/checkout/sessions?cus_ann"] = {
      data: [{ payment_status: "paid", created: 1000, metadata: { plan: "city-pass", city: "cape-fear" } }],
    };
    const res = await restore(post({ email: "Ann@Example.com", receipt: "1234 5678" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { customerId: string; entitlement: { cities?: string[] } };
    expect(body.customerId).toBe("cus_ann");
    expect(body.entitlement.cities).toEqual(["cape-fear"]);
  });

  it("says the same thing for a wrong receipt number as for an unknown email", async () => {
    answers["/v1/customers?ann@example.com"] = { data: [{ id: "cus_ann" }] };
    answers["/v1/charges?cus_ann"] = { data: [{ receipt_number: "1234-5678", paid: true }] };
    const wrong = await restore(post({ email: "ann@example.com", receipt: "9999-0000" }));
    const unknown = await restore(post({ email: "bob@example.com", receipt: "1234-5678" }));
    expect(wrong.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(await wrong.json()).toEqual(await unknown.json());
  });

  it("does not count an unpaid charge", async () => {
    answers["/v1/customers?ann@example.com"] = { data: [{ id: "cus_ann" }] };
    answers["/v1/charges?cus_ann"] = { data: [{ receipt_number: "1234-5678", paid: false }] };
    expect((await restore(post({ email: "ann@example.com", receipt: "1234-5678" }))).status).toBe(404);
  });

  it("refuses an empty or malformed request without asking Stripe", async () => {
    expect((await restore(post({ email: "not-an-email", receipt: "1234-5678" }))).status).toBe(400);
    expect((await restore(post({ email: "ann@example.com", receipt: "" }))).status).toBe(400);
    expect(asked).toEqual([]);
  });

  it("is off until payments are switched on", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect((await restore(post({ email: "ann@example.com", receipt: "1234-5678" }))).status).toBe(503);
  });
});
