/**
 * Stripe, by plain HTTPS. No SDK: five calls do not justify a dependency, and the API is
 * stable form-encoded REST with a pinned version.
 *
 * Nothing here runs until three environment variables exist in Vercel (DEPLOY.md, Payments):
 * the secret key and the two price ids. Until then `/api/config` says payments are off and
 * the app keeps recording purchases on the device, exactly as before.
 */

const API = "https://api.stripe.com/v1";
/**
 * Pinned, so a Stripe-side upgrade cannot move a field under us. This version still carries
 * `current_period_end` on the subscription itself, which is what All-Access reads.
 */
export const STRIPE_VERSION = "2024-06-20";

export interface StripeEnv {
  readonly STRIPE_SECRET_KEY?: string | undefined;
  readonly STRIPE_PRICE_CITY_PASS?: string | undefined;
  readonly STRIPE_PRICE_ALL_ACCESS?: string | undefined;
}

/** Are payments switched on? All three values, or none of it. */
export function configured(env: StripeEnv = process.env): boolean {
  return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_CITY_PASS && env.STRIPE_PRICE_ALL_ACCESS);
}

type Params = Record<string, string | number | boolean | undefined>;

/** Stripe's form encoding. Nested fields are passed already bracketed: `line_items[0][price]`. */
export function form(params: Params): string {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined) out.append(key, String(value));
  return out.toString();
}

export class StripeError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function stripe<T>(method: "GET" | "POST", path: string, params: Params = {}): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new StripeError("Payments are not configured", 503);
  const body = form(params);
  const url = method === "GET" && body ? `${API}${path}?${body}` : `${API}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Stripe-Version": STRIPE_VERSION,
      ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    ...(method === "POST" ? { body } : {}),
  });
  const json = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new StripeError(json.error?.message ?? `Stripe ${res.status}`, res.status);
  return json;
}

/** A JSON reply. Every endpoint answers in JSON, errors included, never a bare 500 page. */
export function reply(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** Turn anything thrown into an honest JSON error. Stripe's own message is safe to show. */
export function failure(error: unknown): Response {
  if (error instanceof StripeError) return reply(error.status >= 500 ? 502 : error.status, { error: error.message });
  return reply(500, { error: "Something went wrong talking to payments." });
}

/** A Stripe customer id, and nothing else, so a request body cannot smuggle a path. */
export const isCustomerId = (v: unknown): v is string => typeof v === "string" && /^cus_[A-Za-z0-9]+$/.test(v);
