/**
 * What the App Store sells, as the engine names it. Pure: imports nothing but the engine.
 *
 * The product ids were set when the products were created in App Store Connect (James,
 * 2026-11-11) and must never change: a purchase is recorded against its id for good.
 *
 *   com.echofinders.app.allaccess.yearly   auto-renewable, group "Echo Finders", 1 year
 *   com.echofinders.app.weekpass           non-renewing subscription, one place, 7 days
 *   com.echofinders.app.city.<id>          non-consumable, one per City Pass city, with the
 *                                          city id's hyphens as underscores (cape_fear)
 *
 * A Week Pass is one product for every place, so the place it was bought for travels with
 * the transaction itself, as its `appAccountToken`: a UUID worked out from the city id
 * (`cityToken`). StoreKit signs it into the transaction, so it comes back on this phone
 * after a reinstall, and on any other phone on the same Apple Account, with nothing of
 * ours stored anywhere.
 */
import { CITIES, PLANS, type City } from "@echofinders/core";

export const BUNDLE_ID = "com.echofinders.app";
export const ALL_ACCESS_SKU = `${BUNDLE_ID}.allaccess.yearly`;
export const WEEK_PASS_SKU = `${BUNDLE_ID}.weekpass`;
const CITY_PREFIX = `${BUNDLE_ID}.city.`;

/** The City Pass product for a city: `com.echofinders.app.city.cape_fear`. */
export function citySku(cityId: string): string {
  return CITY_PREFIX + cityId.replace(/-/g, "_");
}

/** The city a City Pass product is for, or null for any other product. */
export function cityOfSku(sku: string): City | null {
  if (!sku.startsWith(CITY_PREFIX)) return null;
  return CITIES.find((c) => citySku(c.id) === sku) ?? null;
}

/** Every product the app asks the App Store for, so the paywall can show its prices. */
export const ALL_SKUS: readonly string[] = [WEEK_PASS_SKU, ...CITIES.map((c) => citySku(c.id)), ALL_ACCESS_SKU];

/** The engine's plan a product is (`PLANS`), or null for a product this app does not sell. */
export type PlanKey = keyof typeof PLANS;

export function planOfSku(sku: string): PlanKey | null {
  if (sku === ALL_ACCESS_SKU) return "allAccess";
  if (sku === WEEK_PASS_SKU) return "week";
  return cityOfSku(sku) ? "city" : null;
}

/** The product to buy for a plan, and for a City Pass the city. */
export function skuFor(plan: PlanKey, cityId?: string): string {
  if (plan === "allAccess") return ALL_ACCESS_SKU;
  if (plan === "week") return WEEK_PASS_SKU;
  if (!cityId) throw new Error("A City Pass needs a city");
  return citySku(cityId);
}

/**
 * 32 bits of FNV-1a over the text, from a given start: small, dependency free and the same
 * on every phone and in every test run, which is all a token needs.
 */
function fnv1a(text: string, seed: number): number {
  let hash = seed >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

const SEEDS = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35] as const;

/**
 * The `appAccountToken` a Week Pass for this city is bought with: a version 4 shaped UUID,
 * the same for a city every time. NEVER CHANGE THIS FUNCTION. A Week Pass already sold
 * finds its city again only by this token matching (`cityOfToken`); change it and those
 * passes lose their place. `test/ios/purchases.test.ts` pins two of them.
 */
export function cityToken(cityId: string): string {
  const hex = SEEDS.map((seed) => fnv1a(`echo-finders:week-pass:${cityId}`, seed).toString(16).padStart(8, "0")).join("");
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** The city a Week Pass token was made for, or null. Case blind: StoreKit may upper case it. */
export function cityOfToken(token: string | null | undefined): City | null {
  if (!token) return null;
  const want = token.toLowerCase();
  return CITIES.find((c) => cityToken(c.id) === want) ?? null;
}
