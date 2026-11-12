/**
 * What this listener may hear, put together from everywhere a pass can come from, as the
 * engine's own `Entitlement`. Pure: imports nothing but the engine and `products.ts`.
 *
 * Three sources, and none of them makes a rule of its own:
 *
 *   App Store   StoreKit 2 transactions, verified on the phone (the library drops any
 *               that fail Apple's signature check), mapped by `entitlementFromStore`.
 *   Website     a pass bought with Stripe, found by `/api/restore` (email and receipt
 *               number) and kept on the phone with its Stripe customer id, so it can be
 *               read again (`/api/entitlement?customer=`). Already an `Entitlement`.
 *   A key       owner, tester or App Store reviewer (`/api/owner`): everything open, as the
 *               web's owner mode is. Expressed as the engine's `unlocked`.
 *
 * `mergeEntitlements` folds them into one, and from there the engine decides what is
 * locked (`mayHearAnother`, `covers`), exactly as the web app does.
 */
import {
  ALL_ACCESS_TERM_MS,
  CITIES,
  FREE,
  FREE_ECHO_LIMIT,
  WEEK_PASS_TERM_MS,
  type Entitlement,
  type Membership,
  type WeekPass,
} from "@echofinders/core";
import { ALL_ACCESS_SKU, WEEK_PASS_SKU, cityOfSku, cityOfToken } from "./products";

/** One App Store transaction, in the few fields this reads. Times are epoch ms. */
export interface StoreTransaction {
  readonly productId: string;
  readonly transactionId: string;
  readonly purchasedAt: number;
  /** All-Access: the end of the year paid for. */
  readonly expiresAt?: number | null;
  /** Refunded, or taken back by Apple: it opens nothing. */
  readonly revokedAt?: number | null;
  /** A Week Pass: the token for its city (`cityToken`). */
  readonly appAccountToken?: string | null;
  /** All-Access: whether it renews at `expiresAt`. */
  readonly willAutoRenew?: boolean | null;
  /** Ask to Buy and the like: not paid yet. */
  readonly pending?: boolean;
}

/**
 * The fields of an expo-iap `PurchaseIOS` this reads, structurally, so this file needs
 * nothing from the native library and runs in the root test suite.
 */
export interface StorePurchaseLike {
  readonly productId: string;
  readonly id: string;
  readonly transactionId?: string | null;
  readonly transactionDate: number;
  readonly purchaseState?: string | null;
  readonly expirationDateIOS?: number | null;
  readonly revocationDateIOS?: number | null;
  readonly appAccountToken?: string | null;
  readonly isAutoRenewing?: boolean | null;
  readonly renewalInfoIOS?: { readonly willAutoRenew?: boolean | null } | null;
}

export function fromStorePurchase(p: StorePurchaseLike): StoreTransaction {
  return {
    productId: p.productId,
    transactionId: p.transactionId || p.id,
    purchasedAt: p.transactionDate,
    expiresAt: p.expirationDateIOS ?? null,
    revokedAt: p.revocationDateIOS ?? null,
    appAccountToken: p.appAccountToken ?? null,
    willAutoRenew: p.renewalInfoIOS?.willAutoRenew ?? p.isAutoRenewing ?? null,
    pending: p.purchaseState === "pending",
  };
}

/**
 * The App Store's half. Week Passes run seven days from purchase, the latest per city
 * running on from the one before, exactly as `api/_entitlement.ts` reads Stripe: the same
 * pass bought in either place lasts the same time.
 *
 * `weekCities` is the phone's own note of which city each Week Pass was bought for,
 * by transaction id, for the rare transaction that comes back without its token.
 */
export function entitlementFromStore(
  transactions: readonly StoreTransaction[],
  weekCities: Readonly<Record<string, string>> = {},
): Entitlement {
  const seen = new Set<string>();
  const live = transactions.filter((t) => {
    if (t.pending || t.revokedAt || seen.has(t.transactionId)) return false;
    seen.add(t.transactionId);
    return true;
  });

  const cities = [...new Set(live.map((t) => cityOfSku(t.productId)?.id).filter((id): id is string => !!id))].sort();

  const weeks = live
    .filter((t) => t.productId === WEEK_PASS_SKU)
    .map((t) => ({ t, city: cityOfToken(t.appAccountToken)?.id ?? knownCity(weekCities[t.transactionId]) }))
    .filter((w): w is { t: StoreTransaction; city: string } => w.city !== null);
  const weekPasses: WeekPass[] = [];
  for (const city of [...new Set(weeks.map((w) => w.city))].sort()) {
    let until = 0;
    for (const { t } of weeks.filter((w) => w.city === city).sort((a, b) => a.t.purchasedAt - b.t.purchasedAt)) {
      until = Math.max(t.purchasedAt, until) + WEEK_PASS_TERM_MS;
    }
    weekPasses.push({ city, until });
  }

  const years = live
    .filter((t) => t.productId === ALL_ACCESS_SKU)
    .map((t) => ({ t, until: t.expiresAt ?? t.purchasedAt + ALL_ACCESS_TERM_MS }))
    .sort((a, b) => b.until - a.until);
  const latest = years[0];

  const counted = live.filter((t) => cityOfSku(t.productId) || t.productId === ALL_ACCESS_SKU || weeks.some((w) => w.t === t));
  if (counted.length === 0) return FREE;
  return {
    kind: "passes",
    purchasedAt: Math.min(...counted.map((t) => t.purchasedAt)),
    ...(cities.length ? { cities } : {}),
    ...(weekPasses.length ? { weekPasses } : {}),
    ...(latest ? { allAccessUntil: latest.until } : {}),
    ...(latest && latest.t.willAutoRenew === false ? { renews: false } : {}),
  };
}

function knownCity(id: string | undefined): string | null {
  return id && CITIES.some((c) => c.id === id) ? id : null;
}

/**
 * Everything a listener holds, from every source, as one entitlement: every City Pass,
 * the latest Week Pass per city, the All-Access year that runs longest (with its renewal),
 * and the retired lifetime unlock (or a key) over all of it.
 */
export function mergeEntitlements(...sources: readonly Entitlement[]): Entitlement {
  const paid = sources.filter((e) => e.kind !== "free");
  if (paid.length === 0) return FREE;
  const firsts = paid.map((e) => e.purchasedAt).filter((n): n is number => typeof n === "number");
  const at = firsts.length ? { purchasedAt: Math.min(...firsts) } : {};
  if (paid.some((e) => e.kind === "unlocked")) return { kind: "unlocked", ...at };

  const cities = [...new Set(paid.flatMap((e) => e.cities ?? []))].sort();
  const weekUntil = new Map<string, number>();
  for (const w of paid.flatMap((e) => e.weekPasses ?? [])) {
    weekUntil.set(w.city, Math.max(w.until, weekUntil.get(w.city) ?? 0));
  }
  const weekPasses = [...weekUntil].sort(([a], [b]) => a.localeCompare(b)).map(([city, until]) => ({ city, until }));
  const year = paid
    .filter((e) => e.allAccessUntil !== undefined)
    .sort((a, b) => (b.allAccessUntil ?? 0) - (a.allAccessUntil ?? 0))[0];
  return {
    kind: "passes",
    ...at,
    ...(cities.length ? { cities } : {}),
    ...(weekPasses.length ? { weekPasses } : {}),
    ...(year ? { allAccessUntil: year.allAccessUntil! } : {}),
    ...(year && year.renews === false ? { renews: false } : {}),
  };
}

/** A key turned in Settings › Skeleton key: who this phone is, if anybody special. */
export type AccessRole = "owner" | "tester";

/** Owner, tester and reviewer phones hear everything, as on the web (`owner.ts`). */
export function withAccess(entitlement: Entitlement, role: AccessRole | null): Entitlement {
  return role ? mergeEntitlements(entitlement, { kind: "unlocked" }) : entitlement;
}

/**
 * An entitlement read back from the server or from the phone's own file. Anything that
 * does not read is free, never an error: a corrupt file should cost a restore, not a crash.
 * The same reading as the web app's `readEntitlement`.
 */
export function parseEntitlement(raw: unknown): Entitlement {
  if (typeof raw !== "object" || raw === null) return FREE;
  const parsed = raw as Record<string, unknown>;
  const at = typeof parsed.purchasedAt === "number" ? { purchasedAt: parsed.purchasedAt } : {};
  if (parsed.kind === "unlocked") return { kind: "unlocked", ...at };
  if (parsed.kind !== "passes") return FREE;
  const cities = Array.isArray(parsed.cities) ? parsed.cities.filter((c): c is string => typeof c === "string") : [];
  const until = typeof parsed.allAccessUntil === "number" ? parsed.allAccessUntil : undefined;
  const weekPasses = Array.isArray(parsed.weekPasses)
    ? parsed.weekPasses.filter(
        (w): w is WeekPass =>
          typeof w === "object" && w !== null && typeof (w as WeekPass).city === "string" && typeof (w as WeekPass).until === "number",
      )
    : [];
  return {
    kind: "passes",
    ...at,
    ...(cities.length ? { cities } : {}),
    ...(weekPasses.length ? { weekPasses } : {}),
    ...(until !== undefined ? { allAccessUntil: until } : {}),
    ...(until !== undefined && parsed.renews === false ? { renews: false } : {}),
  };
}

/** What `/api/restore` and `/api/entitlement` answer with, read defensively. */
export function parseWebPass(raw: unknown): { customerId: string; entitlement: Entitlement } | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { customerId, entitlement } = raw as { customerId?: unknown; entitlement?: unknown };
  if (typeof customerId !== "string" || !/^cus_[A-Za-z0-9]+$/.test(customerId)) return null;
  return { customerId, entitlement: parseEntitlement(entitlement) };
}

/** Heard echo ids from the phone's file: strings only, each once. */
export function parseHeard(raw: unknown): string[] {
  return Array.isArray(raw) ? [...new Set(raw.filter((id): id is string => typeof id === "string"))] : [];
}

/** City names joined for a sentence: "Boston and Savannah". */
export function cityNames(ids: readonly string[]): string {
  return ids.map((id) => CITIES.find((c) => c.id === id)?.name ?? id).join(" and ");
}

/**
 * What somebody holds, the way Settings and a restore say it. The web app's words
 * (`Membership.tsx`), without the Week Pass credit, which is the website's alone.
 */
export function membershipName(membership: Membership, role: AccessRole | null = null): string {
  if (role === "owner") return "Owner mode";
  if (role === "tester") return "Tester mode";
  switch (membership.plan) {
    case "free":
      return "Free";
    case "lifetime":
      return "Lifetime unlock";
    case "city-pass":
      return `${cityNames(membership.cities)} City Pass`;
    case "week-pass":
      return `${cityNames([membership.city])} Week Pass`;
    case "all-access":
      return "All-Access";
  }
}

/** The line under the name. `day` formats a date, so tests need no locale. */
export function membershipDetail(
  membership: Membership,
  freeLeft: number,
  day: (ms: number) => string,
  role: AccessRole | null = null,
): string {
  if (role) return "On: every echo unlocked, on this phone.";
  switch (membership.plan) {
    case "free":
      return `${freeLeft} of ${FREE_ECHO_LIMIT} free echoes left. Everything you find and hear stays yours.`;
    case "lifetime":
      return "Everything, for good. You bought it before the plans changed, and it stays.";
    case "city-pass": {
      const names = cityNames(membership.cities);
      return `Every echo in ${names}, for good. Bought once: nothing to renew or cancel.`;
    }
    case "week-pass":
      return `Every echo in ${cityNames([membership.city])} until ${day(membership.until)}.`;
    case "all-access": {
      const kept = membership.cities.length ? ` Your ${cityNames(membership.cities)} City Pass stays after.` : "";
      return membership.renews
        ? `Every city, road trip and flight. Renews ${day(membership.until)}.${kept}`
        : `Ends ${day(membership.until)}. It will not renew.${kept}`;
    }
  }
}
