/**
 * The iPhone app around the web app, the pure half (`apps/ios/src/shell/logic.ts`), and the
 * one sum both sides must do alike (`mergePasses` in the web app's `native-passes.ts`
 * against `mergeEntitlements` in the iPhone app). ADR-0012, amended 2026-11-13.
 *
 * Run from the root suite, as the other `test/ios` files are: these modules import nothing
 * but the engine and the bridge's own message types.
 */
import { describe, expect, it } from "vitest";
import type { Echo, Entitlement, LatLng } from "@echofinders/core";
import type { PlayRequest, PocketPlan } from "../../apps/prototype/src/native-bridge-protocol.js";
import {
  FixRelay,
  MAX_KEPT_FIXES,
  PocketJudge,
  PocketLedger,
  RECLAIM_MS,
  bridgeFix,
  deliverScript,
  echoOfRequest,
  markerScript,
  navigationFor,
  offerFor,
  parseWebMessage,
  type PhoneFix,
} from "../../apps/ios/src/shell/logic.js";
import { mergeEntitlements } from "../../apps/ios/src/purchases/entitlement.js";
import { mergePasses } from "../../apps/prototype/src/native-passes.js";

/** Bowling Green, New York. */
const here: LatLng = { lat: 40.7049, lng: -74.0137 };
const T0 = Date.parse("2026-11-13T15:00:00Z");

function echo(id: string, at: LatLng): Echo {
  return {
    id,
    title: `Echo ${id}`,
    point: { at, triggerRadiusKm: 0.05, place: "Bowling Green" },
    category: "history",
    era: "colonial",
    tone: "documentary",
    minAge: 0,
    durationS: 120,
    quality: 0.5,
    editorial: "approved",
    script: "",
    renders: [{ voiceId: "v", audioKey: `audio/${id}/v.mp3`, durationS: 120 }],
  } as unknown as Echo;
}

function fix(at: LatLng, timestamp: number, extra: Partial<PhoneFix["coords"]> = {}): PhoneFix {
  return { coords: { latitude: at.lat, longitude: at.lng, accuracy: 8, speed: 0.5, ...extra }, timestamp };
}

function request(id: string): PlayRequest {
  return {
    key: `audio/${id}/v.mp3`,
    url: `https://echo-finders.vercel.app/audio/${id}/v.mp3`,
    id,
    title: `Echo ${id}`,
    place: "Bowling Green",
    at: here,
    durationS: 120,
    startAtS: 0,
    rate: 1,
    muted: false,
  };
}

describe("links", () => {
  it("keeps the app's own site in the app", () => {
    expect(navigationFor("https://echo-finders.vercel.app/?echo=x", true)).toBe("load");
  });
  it("opens the policies, mail and the phone's maps outside the app", () => {
    expect(navigationFor("https://echofinders.com/terms", true)).toBe("outside");
    expect(navigationFor("mailto:hello@echofinders.com", true)).toBe("outside");
    expect(navigationFor("https://maps.apple.com/?daddr=1,2", true)).toBe("outside");
  });
  it("never opens the website's checkout, in the app or outside it", () => {
    expect(navigationFor("https://checkout.stripe.com/c/pay/cs_test_1", true)).toBe("block");
    expect(navigationFor("https://checkout.stripe.com/c/pay/cs_test_1", false)).toBe("block");
  });
  it("lets frames inside the page load, and drops what is not an address", () => {
    expect(navigationFor("https://example.com/frame", false)).toBe("load");
    expect(navigationFor("about:blank", true)).toBe("load");
    expect(navigationFor("not a url", true)).toBe("block");
  });
});

describe("the page's scripts", () => {
  it("marks the page as inside the app", () => {
    const window: Record<string, unknown> = {};
    new Function("window", markerScript())(window);
    expect(window["__EF_SHELL__"]).toEqual({ v: 1, sw: true });
  });
  it("delivers a message to the page's receiver, line separators and all", () => {
    const got: unknown[] = [];
    const window = { __echoFindersNative: { receive: (m: unknown) => got.push(m) } };
    const title = `a${String.fromCharCode(0x2028)}b`;
    new Function("window", deliverScript({ type: "reply", id: 3, result: title }))(window);
    expect(got).toEqual([{ type: "reply", id: 3, result: title }]);
  });
  it("does nothing on a page that has no receiver", () => {
    expect(() => new Function("window", deliverScript({ type: "audio:ended", key: "k" }))({})).not.toThrow();
  });
});

describe("what the page may ask", () => {
  it("takes a well formed play", () => {
    expect(parseWebMessage(JSON.stringify({ type: "audio:play", ...request("a") }))).toMatchObject({ type: "audio:play", key: "audio/a/v.mp3" });
  });
  it("refuses a play that is not one of the app's files over https", () => {
    expect(parseWebMessage(JSON.stringify({ type: "audio:play", ...request("a"), url: "http://x/a.mp3" }))).toBeNull();
    expect(parseWebMessage(JSON.stringify({ type: "audio:play", ...request("a"), key: "speech/a" }))).toBeNull();
  });
  it("refuses an unknown message, a plan it does not sell, and what is not JSON", () => {
    expect(parseWebMessage(JSON.stringify({ type: "open:anything" }))).toBeNull();
    expect(parseWebMessage(JSON.stringify({ type: "purchase:buy", id: 1, plan: "lifetime" }))).toBeNull();
    expect(parseWebMessage("{")).toBeNull();
  });
  it("takes buying, Hands-free and the pocket plan", () => {
    expect(parseWebMessage(JSON.stringify({ type: "purchase:buy", id: 1, plan: "city", cityId: "boston" }))).not.toBeNull();
    expect(parseWebMessage(JSON.stringify({ type: "handsfree", on: true, changed: true }))).not.toBeNull();
    const plan: PocketPlan = { handsFree: true, mode: "walking", plays: ["a"], captured: [], current: request("a"), waiting: [request("b")] };
    expect(parseWebMessage(JSON.stringify({ type: "pocket", ...plan }))).not.toBeNull();
    expect(parseWebMessage(JSON.stringify({ type: "pocket", ...plan, plays: [1] }))).toBeNull();
  });
});

describe("fixes on their way to the page", () => {
  it("says unknown, never zero, for what iOS does not know", () => {
    expect(bridgeFix(fix(here, T0, { accuracy: null, speed: -1, heading: -1 }))).toEqual({
      lat: here.lat,
      lng: here.lng,
      accuracyM: null,
      headingDeg: null,
      speedMps: null,
      timestamp: T0,
    });
  });
  it("takes each fix once, oldest first, from either watch", () => {
    const relay = new FixRelay();
    expect(relay.take([fix(here, T0 + 1000), fix(here, T0)]).map((f) => f.timestamp)).toEqual([T0, T0 + 1000]);
    expect(relay.take([fix(here, T0 + 1000)])).toEqual([]);
    expect(relay.take([fix(here, T0 + 2000)]).map((f) => f.timestamp)).toEqual([T0 + 2000]);
  });
  it("keeps fixes for the page in order, and the newest when there are too many", () => {
    const relay = new FixRelay();
    const many = Array.from({ length: MAX_KEPT_FIXES + 10 }, (_, i) => bridgeFix(fix(here, T0 + i)));
    relay.keep(many);
    const kept = relay.drain();
    expect(kept).toHaveLength(MAX_KEPT_FIXES);
    expect(kept[0]!.timestamp).toBe(T0 + 10);
    expect(relay.drain()).toEqual([]);
  });
});

describe("passes", () => {
  it("sells what the page asked for, as the App Store names it", () => {
    expect(offerFor("allAccess", undefined)).toEqual({ plan: "allAccess", sku: "com.echofinders.app.allaccess.yearly" });
    expect(offerFor("city", "cape-fear")).toMatchObject({ plan: "city", sku: "com.echofinders.app.city.cape_fear" });
    expect(offerFor("week", "boston")).toMatchObject({ plan: "week", sku: "com.echofinders.app.weekpass", city: { id: "boston" } });
  });
  it("sells nothing for a city it does not know", () => {
    expect(offerFor("city", "atlantis")).toBeNull();
    expect(offerFor("week", undefined)).toBeNull();
  });
  it("adds the App Store's passes to the page's exactly as the app does", () => {
    const now = T0;
    const cases: [Entitlement, Entitlement][] = [
      [{ kind: "free" }, { kind: "free" }],
      [{ kind: "free" }, { kind: "passes", cities: ["boston"], purchasedAt: now }],
      [{ kind: "passes", cities: ["savannah"], purchasedAt: now - 5 }, { kind: "passes", cities: ["boston"], purchasedAt: now }],
      [
        { kind: "passes", weekPasses: [{ city: "boston", until: now + 1 }], allAccessUntil: now + 10, renews: false },
        { kind: "passes", weekPasses: [{ city: "boston", until: now + 5 }], allAccessUntil: now + 20 },
      ],
      [{ kind: "unlocked", purchasedAt: now }, { kind: "passes", cities: ["boston"] }],
    ];
    for (const [web, store] of cases) expect(mergePasses(web, store)).toEqual(mergeEntitlements(web, store));
  });
});

describe("the pocket", () => {
  const plan = (over: Partial<PocketPlan> = {}): PocketPlan => ({
    handsFree: true,
    mode: "walking",
    plays: ["a"],
    captured: [],
    current: null,
    waiting: [],
    ...over,
  });

  it("starts an echo the page said would play, once you have settled there", () => {
    const judge = new PocketJudge(plan(), [echo("a", here)], new Date(T0).toISOString());
    expect(judge.update([fix(here, T0)])).toEqual([]);
    expect(judge.update([fix(here, T0 + 4000)]).map((e) => e.id)).toEqual(["a"]);
    expect(judge.update([fix(here, T0 + 8000)])).toEqual([]);
  });
  it("starts nothing the page did not say would play", () => {
    const judge = new PocketJudge(plan({ plays: [] }), [echo("a", here)], new Date(T0).toISOString());
    expect(judge.update([fix(here, T0), fix(here, T0 + 4000)])).toEqual([]);
  });
  it("finds nothing the page had already found", () => {
    const judge = new PocketJudge(plan({ captured: ["a"] }), [echo("a", here)], new Date(T0).toISOString());
    expect(judge.update([fix(here, T0), fix(here, T0 + 4000)])).toEqual([]);
  });

  it("hands back: carries on with the one playing, ends the one heard, plays the rest", () => {
    const ledger = new PocketLedger();
    ledger.started("audio/a/v.mp3");
    ledger.finished("audio/a/v.mp3");
    ledger.started("audio/b/v.mp3");
    ledger.handBack(T0);
    expect(ledger.reclaim("audio/b/v.mp3", "audio/b/v.mp3", T0 + 10)).toBe("adopt");
    expect(ledger.reclaim("audio/a/v.mp3", "audio/b/v.mp3", T0 + 20)).toBe("ended");
    expect(ledger.reclaim("audio/a/v.mp3", "audio/b/v.mp3", T0 + 30)).toBe("play");
    expect(ledger.reclaim("audio/c/v.mp3", "audio/b/v.mp3", T0 + 40)).toBe("play");
  });
  it("after the hand back, asking is choosing: it plays from the start", () => {
    const ledger = new PocketLedger();
    ledger.started("audio/b/v.mp3");
    ledger.handBack(T0);
    expect(ledger.reclaim("audio/b/v.mp3", "audio/b/v.mp3", T0 + RECLAIM_MS + 1)).toBe("play");
    expect(ledger.empty).toBe(true);
  });
  it("before any hand back, everything plays", () => {
    expect(new PocketLedger().reclaim("audio/a/v.mp3", null, T0)).toBe("play");
  });

  it("plays an echo newer than this build's library with what the page sent", () => {
    const known = echo("a", here);
    expect(echoOfRequest(request("a"), new Map([["a", known]]))).toBe(known);
    const newer = echoOfRequest(request("z"), new Map());
    expect(newer.id).toBe("z");
    expect(newer.title).toBe("Echo z");
    expect(newer.point.at).toEqual(here);
    expect(newer.renders?.[0]?.audioKey).toBe("audio/z/v.mp3");
  });
});
