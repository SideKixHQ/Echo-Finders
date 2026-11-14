/**
 * The iPhone app's in-app purchase, the pure half (`apps/ios/src/purchases/`): product ids,
 * the Week Pass city token, App Store transactions as the engine's entitlement, merging
 * with website passes and keys, what the paywall offers, and the Skeleton key's answers.
 *
 * Run from the root suite, as the other `test/ios` files are: these modules import nothing
 * but the engine and each other.
 */
import { describe, expect, it } from "vitest";
import {
  ALL_ACCESS_TERM_MS,
  CITIES,
  FREE,
  FREE_ECHO_LIMIT,
  WEEK_PASS_TERM_MS,
  membershipOf,
  type Entitlement,
} from "@echofinders/core";
import {
  ALL_ACCESS_SKU,
  ALL_SKUS,
  WEEK_PASS_SKU,
  cityOfSku,
  cityOfToken,
  citySku,
  cityToken,
  cityUpgradeSku,
  isUpgradeSku,
  pagePrices,
  planOfSku,
  skuFor,
} from "../../apps/ios/src/purchases/products.js";
import { offerFor, parseWebMessage } from "../../apps/ios/src/shell/logic.js";
import {
  entitlementFromStore,
  fromStorePurchase,
  membershipDetail,
  membershipName,
  mergeEntitlements,
  parseEntitlement,
  parseHeard,
  parseWebPass,
  withAccess,
  type StoreTransaction,
} from "../../apps/ios/src/purchases/entitlement.js";
import { PAYWALL_HEADING, buyLabel, heardLine, isLocked, paywallFor, smallPrint } from "../../apps/ios/src/purchases/paywall.js";
import { accessToStore, keyResult, parseAccess, stillTester } from "../../apps/ios/src/purchases/access.js";
import { paidCities } from "../../apps/ios/src/packs/passes.js";

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 10, 12, 12);
const BOSTON = { lat: 42.3601, lng: -71.0589 };
const ROAD = { lat: 36.0, lng: -81.5 }; // the Blue Ridge, in no city

const tx = (over: Partial<StoreTransaction> & Pick<StoreTransaction, "productId">): StoreTransaction => ({
  transactionId: `${over.productId}-${over.purchasedAt ?? T0}-${over.appAccountToken ?? ""}`,
  purchasedAt: T0,
  ...over,
});

describe("product ids", () => {
  it("are exactly the ones created in App Store Connect", () => {
    expect(ALL_ACCESS_SKU).toBe("com.echofinders.app.allaccess.yearly");
    expect(WEEK_PASS_SKU).toBe("com.echofinders.app.weekpass");
    expect(CITIES.map((c) => citySku(c.id))).toEqual([
      "com.echofinders.app.city.new_york",
      "com.echofinders.app.city.cape_fear",
      "com.echofinders.app.city.washington_dc",
      "com.echofinders.app.city.philadelphia",
      "com.echofinders.app.city.savannah",
      "com.echofinders.app.city.charleston",
      "com.echofinders.app.city.new_orleans",
      "com.echofinders.app.city.boston",
      "com.echofinders.app.city.houston",
    ]);
    expect(ALL_SKUS).toHaveLength(CITIES.length * 2 + 2);
  });

  it("map back to their city and plan", () => {
    expect(cityOfSku("com.echofinders.app.city.cape_fear")?.id).toBe("cape-fear");
    expect(cityOfSku("com.echofinders.app.city.nowhere")).toBeNull();
    expect(cityOfSku(WEEK_PASS_SKU)).toBeNull();
    expect(planOfSku(ALL_ACCESS_SKU)).toBe("allAccess");
    expect(planOfSku(WEEK_PASS_SKU)).toBe("week");
    expect(planOfSku(citySku("boston"))).toBe("city");
    expect(planOfSku("com.example.other")).toBeNull();
    expect(skuFor("city", "new-orleans")).toBe("com.echofinders.app.city.new_orleans");
    expect(() => skuFor("city")).toThrow();
  });
});

describe("Week Pass city token", () => {
  it("is a UUID, different for every city, and finds its city again", () => {
    const tokens = CITIES.map((c) => cityToken(c.id));
    for (const t of tokens) expect(t).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(new Set(tokens).size).toBe(CITIES.length);
    for (const c of CITIES) {
      expect(cityOfToken(cityToken(c.id))?.id).toBe(c.id);
      expect(cityOfToken(cityToken(c.id).toUpperCase())?.id).toBe(c.id);
    }
    expect(cityOfToken("00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(cityOfToken(null)).toBeNull();
  });

  it("never changes: passes already sold find their place by it", () => {
    expect({ capeFear: cityToken("cape-fear"), boston: cityToken("boston") }).toMatchInlineSnapshot(`
      {
        "boston": "9f29851b-57d6-499f-ace1-28e9f3bc28ab",
        "capeFear": "d72fbb6a-8872-4866-a552-fec40e7aa21a",
      }
    `);
  });
});

describe("App Store transactions as the engine's entitlement", () => {
  it("is free with nothing bought", () => {
    expect(entitlementFromStore([])).toEqual(FREE);
  });

  it("keeps City Passes for good, and drops refunded and pending ones", () => {
    const e = entitlementFromStore([
      tx({ productId: citySku("boston") }),
      tx({ productId: citySku("savannah"), purchasedAt: T0 - DAY }),
      tx({ productId: citySku("houston"), revokedAt: T0 + DAY }),
      tx({ productId: citySku("charleston"), pending: true }),
      tx({ productId: "com.example.other" }),
    ]);
    expect(e).toEqual({ kind: "passes", purchasedAt: T0 - DAY, cities: ["boston", "savannah"] });
    expect(paidCities(e, T0 + 1000 * DAY).map((c) => c.id)).toEqual(["savannah", "boston"]);
  });

  it("runs a Week Pass seven days from purchase, in the city its token names", () => {
    const e = entitlementFromStore([tx({ productId: WEEK_PASS_SKU, appAccountToken: cityToken("boston") })]);
    expect(e.weekPasses).toEqual([{ city: "boston", until: T0 + WEEK_PASS_TERM_MS }]);
    expect(isLocked(e, Array.from({ length: 10 }, (_, i) => `h${i}`), { id: "b", point: { at: BOSTON } }, T0 + 6 * DAY)).toBe(false);
    expect(isLocked(e, Array.from({ length: 10 }, (_, i) => `h${i}`), { id: "b", point: { at: BOSTON } }, T0 + 8 * DAY)).toBe(true);
  });

  it("runs a second week on from the first, as the website does", () => {
    const e = entitlementFromStore([
      tx({ productId: WEEK_PASS_SKU, appAccountToken: cityToken("boston"), purchasedAt: T0 }),
      tx({ productId: WEEK_PASS_SKU, appAccountToken: cityToken("boston"), purchasedAt: T0 + 5 * DAY }),
      tx({ productId: WEEK_PASS_SKU, appAccountToken: cityToken("savannah"), purchasedAt: T0 + DAY }),
    ]);
    expect(e.weekPasses).toEqual([
      { city: "boston", until: T0 + 2 * WEEK_PASS_TERM_MS },
      { city: "savannah", until: T0 + DAY + WEEK_PASS_TERM_MS },
    ]);
  });

  it("finds a Week Pass's city from the phone's note when the token is missing, else leaves it out", () => {
    const missing = tx({ productId: WEEK_PASS_SKU, transactionId: "2000001" });
    expect(entitlementFromStore([missing], { "2000001": "charleston" }).weekPasses).toEqual([
      { city: "charleston", until: T0 + WEEK_PASS_TERM_MS },
    ]);
    expect(entitlementFromStore([missing])).toEqual(FREE);
    expect(entitlementFromStore([missing], { "2000001": "atlantis" })).toEqual(FREE);
  });

  it("opens All-Access to the latest expiry, with its renewal", () => {
    const e = entitlementFromStore([
      tx({ productId: ALL_ACCESS_SKU, transactionId: "1", expiresAt: T0 + 365 * DAY, willAutoRenew: true }),
      tx({ productId: ALL_ACCESS_SKU, transactionId: "2", purchasedAt: T0 + 365 * DAY, expiresAt: T0 + 730 * DAY, willAutoRenew: false }),
    ]);
    expect(e).toEqual({ kind: "passes", purchasedAt: T0, allAccessUntil: T0 + 730 * DAY, renews: false });
    const m = membershipOf(e, T0 + 400 * DAY);
    expect(m).toEqual({ plan: "all-access", until: T0 + 730 * DAY, renews: false, cities: [] });
    expect(entitlementFromStore([tx({ productId: ALL_ACCESS_SKU })]).allAccessUntil).toBe(T0 + ALL_ACCESS_TERM_MS);
  });

  it("counts a transaction once, whichever list it came from", () => {
    const one = tx({ productId: WEEK_PASS_SKU, transactionId: "9", appAccountToken: cityToken("boston") });
    expect(entitlementFromStore([one, one]).weekPasses).toEqual([{ city: "boston", until: T0 + WEEK_PASS_TERM_MS }]);
  });

  it("reads expo-iap's purchase shape", () => {
    expect(
      fromStorePurchase({
        productId: ALL_ACCESS_SKU,
        id: "id-1",
        transactionId: "tx-1",
        transactionDate: T0,
        purchaseState: "purchased",
        expirationDateIOS: T0 + 365 * DAY,
        revocationDateIOS: null,
        appAccountToken: null,
        isAutoRenewing: true,
        renewalInfoIOS: { willAutoRenew: false },
      }),
    ).toEqual({
      productId: ALL_ACCESS_SKU,
      transactionId: "tx-1",
      purchasedAt: T0,
      expiresAt: T0 + 365 * DAY,
      revokedAt: null,
      appAccountToken: null,
      willAutoRenew: false,
      pending: false,
    });
    expect(fromStorePurchase({ productId: WEEK_PASS_SKU, id: "id-2", transactionDate: T0, purchaseState: "pending" })).toMatchObject({
      transactionId: "id-2",
      pending: true,
    });
  });
});

describe("merging the App Store, the website and a key", () => {
  const store: Entitlement = { kind: "passes", purchasedAt: T0, cities: ["boston"], weekPasses: [{ city: "savannah", until: T0 + DAY }] };
  const web: Entitlement = {
    kind: "passes",
    purchasedAt: T0 - DAY,
    cities: ["cape-fear", "boston"],
    weekPasses: [{ city: "savannah", until: T0 + 3 * DAY }],
    allAccessUntil: T0 + 100 * DAY,
    renews: false,
  };

  it("takes every City Pass, the latest week per city and the longest All-Access", () => {
    expect(mergeEntitlements(store, web)).toEqual({
      kind: "passes",
      purchasedAt: T0 - DAY,
      cities: ["boston", "cape-fear"],
      weekPasses: [{ city: "savannah", until: T0 + 3 * DAY }],
      allAccessUntil: T0 + 100 * DAY,
      renews: false,
    });
    const renewing: Entitlement = { kind: "passes", allAccessUntil: T0 + 200 * DAY };
    expect(mergeEntitlements(web, renewing)).toMatchObject({ allAccessUntil: T0 + 200 * DAY });
    expect(mergeEntitlements(web, renewing).renews).toBeUndefined();
  });

  it("is free when nothing is held, and everything with the retired unlock", () => {
    expect(mergeEntitlements(FREE, FREE)).toEqual(FREE);
    expect(mergeEntitlements(store, { kind: "unlocked", purchasedAt: T0 - 9 * DAY })).toEqual({ kind: "unlocked", purchasedAt: T0 - 9 * DAY });
  });

  it("opens everything for an owner, tester or reviewer key, as the web's owner mode does", () => {
    const keyed = withAccess(FREE, "tester");
    expect(keyed.kind).toBe("unlocked");
    expect(isLocked(keyed, Array.from({ length: 50 }, (_, i) => `h${i}`), { id: "x", point: { at: ROAD } }, T0)).toBe(false);
    expect(withAccess(store, null)).toBe(store);
    expect(paidCities(keyed, T0)).toHaveLength(CITIES.length);
  });

  it("reads the website's answer and the phone's files defensively", () => {
    expect(parseWebPass({ customerId: "cus_ABC123", entitlement: web })).toEqual({ customerId: "cus_ABC123", entitlement: web });
    expect(parseWebPass({ customerId: "nope", entitlement: web })).toBeNull();
    expect(parseWebPass(null)).toBeNull();
    expect(parseEntitlement("garbage")).toEqual(FREE);
    expect(parseEntitlement({ kind: "passes", cities: ["boston", 4], weekPasses: [{ city: "x" }], renews: false })).toEqual({
      kind: "passes",
      cities: ["boston"],
    });
    expect(parseHeard(["a", "b", "a", 3])).toEqual(["a", "b"]);
    expect(parseHeard({})).toEqual([]);
  });
});

describe("what is locked: the engine's rule", () => {
  const heard = Array.from({ length: FREE_ECHO_LIMIT }, (_, i) => `h${i}`);
  const boston = { id: "new-one", point: { at: BOSTON } };

  it("opens the free ten, and replays anything heard", () => {
    expect(isLocked(FREE, heard.slice(0, 9), boston, T0)).toBe(false);
    expect(isLocked(FREE, heard, boston, T0)).toBe(true);
    expect(isLocked(FREE, heard, { id: "h3", point: { at: BOSTON } }, T0)).toBe(false);
  });

  it("opens a city with its pass, and the road only with All-Access", () => {
    const city: Entitlement = { kind: "passes", cities: ["boston"] };
    expect(isLocked(city, heard, boston, T0)).toBe(false);
    expect(isLocked(city, heard, { id: "road", point: { at: ROAD } }, T0)).toBe(true);
    const all: Entitlement = { kind: "passes", allAccessUntil: T0 + DAY };
    expect(isLocked(all, heard, { id: "road", point: { at: ROAD } }, T0)).toBe(false);
    expect(isLocked(all, heard, { id: "road", point: { at: ROAD } }, T0 + 2 * DAY)).toBe(true);
  });
});

describe("what the paywall offers", () => {
  it("in a city: the Week Pass, that city's City Pass and All-Access, City Pass chosen", () => {
    const plan = paywallFor(BOSTON);
    expect(plan.city?.id).toBe("boston");
    expect(plan.offers.map((o) => [o.plan, o.sku, o.name])).toEqual([
      ["week", WEEK_PASS_SKU, "Week Pass"],
      ["city", "com.echofinders.app.city.boston", "Boston City Pass"],
      ["allAccess", ALL_ACCESS_SKU, "All-Access"],
    ]);
    expect(plan.chosen).toBe("city");
    expect(plan.sum).toBe("Visiting four cities or more this year? All-Access costs less.");
  });

  it("no Week Pass credit towards the City Pass in the app", () => {
    const week = paywallFor(BOSTON).offers[0]!;
    expect(week.what).toBe("Every echo in Boston for the next seven days. Nothing to renew.");
    expect(week.what).not.toMatch(/counts towards/);
  });

  it("on the road: All-Access only, and says why", () => {
    const plan = paywallFor(ROAD);
    expect(plan.city).toBeNull();
    expect(plan.offers.map((o) => o.plan)).toEqual(["allAccess"]);
    expect(plan.sum).toBe("City Passes cover a city. This echo is on the road, so it is part of All-Access.");
  });

  it("labels the button with the App Store's own price", () => {
    const [week, city, all] = paywallFor(BOSTON).offers;
    expect(buyLabel(week!, "£3.99")).toBe("Get the Week Pass · £3.99");
    expect(buyLabel(city!, "€9,99")).toBe("Get the City Pass · €9,99");
    expect(buyLabel(all!, "$34.99")).toBe("Start All-Access · $34.99 a year");
    expect(buyLabel(all!, null)).toBe("Start All-Access");
  });

  it("says what it must, with no dashes and no website checkout", () => {
    const words = [
      PAYWALL_HEADING,
      heardLine(10),
      heardLine(14),
      smallPrint("allAccess"),
      smallPrint("city"),
      ...[BOSTON, ROAD].flatMap((at) => {
        const plan = paywallFor(at);
        return [plan.sum, ...plan.offers.flatMap((o) => [o.name, o.per, o.what])];
      }),
    ];
    expect(heardLine(14)).toBe("10 of 10 free echoes heard");
    expect(smallPrint("allAccess")).toMatch(/Renews each year/);
    for (const w of words) {
      expect(w).not.toMatch(/[–—]|\s-\s/);
      expect(w).not.toMatch(/website|echofinders\.com|stripe/i);
    }
  });
});

describe("Settings lines", () => {
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  it("name what is held, without the website's Week Pass credit", () => {
    const week = membershipOf({ kind: "passes", weekPasses: [{ city: "boston", until: T0 + DAY }] }, T0);
    expect(membershipName(week)).toBe("Boston Week Pass");
    expect(membershipDetail(week, 0, day)).toBe("Every echo in Boston until 2026-11-13.");
    expect(membershipName(membershipOf(FREE, T0))).toBe("Free");
    expect(membershipDetail(membershipOf(FREE, T0), 4, day)).toBe("4 of 10 free echoes left. Everything you find and hear stays yours.");
    expect(membershipName(membershipOf({ kind: "unlocked" }, T0), "owner")).toBe("Owner mode");
    expect(membershipDetail(membershipOf({ kind: "unlocked" }, T0), 0, day, "tester")).toBe("On: every echo unlocked, on this phone.");
  });
});

describe("Skeleton key", () => {
  it("reads /api/owner's answer as the web does", () => {
    expect(keyResult(200, { ok: true, role: "owner" })).toBe("owner");
    expect(keyResult(200, { ok: true, role: "tester" })).toBe("tester");
    expect(keyResult(403, { error: "That link is not right." })).toBe("wrong");
    expect(keyResult(400, null)).toBe("wrong");
    expect(keyResult(503, null)).toBe("offline");
    expect(keyResult(500, null)).toBe("offline");
  });

  it("keeps the role, and a tester's code to ask again with; never the owner's", () => {
    expect(accessToStore("owner", "secret")).toEqual({ role: "owner" });
    expect(accessToStore("tester", " t-code ")).toEqual({ role: "tester", code: "t-code" });
    expect(accessToStore("wrong", "x")).toBeNull();
    expect(parseAccess({ role: "owner" })).toEqual({ role: "owner" });
    expect(parseAccess({ role: "tester" })).toBeNull();
    expect(parseAccess({ role: "admin" })).toBeNull();
  });

  it("turns a tester off only on a definite no", () => {
    expect(stillTester(200)).toBe(true);
    expect(stillTester(null)).toBe(true);
    expect(stillTester(500)).toBe(true);
    expect(stillTester(403)).toBe(false);
    expect(stillTester(503)).toBe(false);
  });
});

describe("the City Pass upgrade and Apple's prices on the page (James, 2026-11-13)", () => {
  it("has one upgrade product per city, as created in App Store Connect", () => {
    expect(cityUpgradeSku("cape-fear")).toBe("com.echofinders.app.cityupgrade.cape_fear");
    expect(cityUpgradeSku("washington-dc")).toBe("com.echofinders.app.cityupgrade.washington_dc");
    for (const c of CITIES) expect(ALL_SKUS).toContain(cityUpgradeSku(c.id));
  });

  it("an upgrade opens its city for good, as a City Pass does", () => {
    expect(cityOfSku("com.echofinders.app.cityupgrade.boston")?.id).toBe("boston");
    expect(isUpgradeSku("com.echofinders.app.cityupgrade.boston")).toBe(true);
    expect(isUpgradeSku("com.echofinders.app.city.boston")).toBe(false);
    const e = entitlementFromStore([
      { productId: "com.echofinders.app.cityupgrade.boston", transactionId: "t1", purchasedAt: 1000 } as never,
    ]);
    expect(e.cities).toEqual(["boston"]);
  });

  it("sells the upgrade only when the page showed it as the upgrade", () => {
    expect(offerFor("city", "boston", true)?.sku).toBe("com.echofinders.app.cityupgrade.boston");
    expect(offerFor("city", "boston")?.sku).toBe("com.echofinders.app.city.boston");
    expect(offerFor("week", "boston", true)?.sku).toBe("com.echofinders.app.weekpass");
    expect(offerFor("allAccess", undefined, true)?.sku).toBe("com.echofinders.app.allaccess.yearly");
  });

  it("the page's buy may say it is the upgrade, and nothing odd", () => {
    expect(parseWebMessage(JSON.stringify({ type: "purchase:buy", id: 1, plan: "city", cityId: "boston", upgrade: true }))).not.toBeNull();
    expect(parseWebMessage(JSON.stringify({ type: "purchase:buy", id: 1, plan: "city", cityId: "boston", upgrade: "yes" }))).toBeNull();
  });

  it("hands the page Apple's price for each plan, and leaves out what Apple has not answered", () => {
    const apple: Record<string, string> = {
      "com.echofinders.app.weekpass": "$4.99",
      "com.echofinders.app.city.boston": "$11.99",
      "com.echofinders.app.cityupgrade.houston": "$6.99",
      "com.echofinders.app.allaccess.yearly": "$41.99",
    };
    expect(pagePrices((sku) => apple[sku] ?? null)).toEqual({ week: "$4.99", city: "$11.99", cityUpgrade: "$6.99", allAccess: "$41.99" });
    expect(pagePrices(() => null)).toEqual({});
  });
});
