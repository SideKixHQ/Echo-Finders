/**
 * The app around the web app, the pure half: what a link does, how a fix travels to the
 * page, what the page may ask, and the hand over while the page cannot run (ADR-0012,
 * amended 2026-11-13). `WebShell.tsx` is the native half.
 *
 * Nothing here touches React Native or Expo, so the root suite tests it
 * (`test/ios/shell.test.ts`): it imports the engine and the bridge's own message types,
 * which the web app and this app read from one file.
 */
import {
  CITIES,
  CaptureTracker,
  ECHO_CATEGORIES,
  type City,
  type Echo,
  type ListenerProfile,
  type TravelMode,
} from "@echofinders/core";
import type { BridgeFix, NativeToWeb, PlayRequest, PocketPlan, WebToNative } from "../../../prototype/src/native-bridge-protocol";
import { RECEIVER, SHELL_MARKER, BRIDGE_VERSION } from "../../../prototype/src/native-bridge-protocol";
import { skuFor, type PlanKey } from "../purchases/products";
import { positionOf, type Fix } from "../walk/logic";

/** The web app the phone shows: the deployed, approved build. */
export const WEB_APP_URL = "https://echo-finders.vercel.app/";
export const WEB_APP_HOST = new URL(WEB_APP_URL).host;

// --- Links ------------------------------------------------------------------------------------

/** Schemes the WebView keeps to itself. */
const INTERNAL_SCHEMES = new Set(["about:", "blob:", "data:", "javascript:"]);

/**
 * The website's checkout. Never opened from the app, in the app or in Safari: in the app a
 * pass is bought from the App Store (App Store products, approved 2026-11-12: "No web
 * checkout link in the app").
 */
export function isWebCheckout(url: URL): boolean {
  return url.host === "checkout.stripe.com" || (url.host.endsWith(".stripe.com") && url.pathname.includes("/checkout"));
}

/** What a navigation does: stay in the app, go to Safari or another app, or nothing at all. */
export type Navigation = "load" | "outside" | "block";

/**
 * A page link, or a link the page opens. Frames inside the page load where they are; the
 * app's own site stays in the app; the policies, mail and the phone's maps go outside;
 * the website's checkout goes nowhere.
 */
export function navigationFor(raw: string, topFrame: boolean): Navigation {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "block";
  }
  if (INTERNAL_SCHEMES.has(url.protocol)) return "load";
  if (isWebCheckout(url)) return "block";
  if (!topFrame) return "load";
  if (url.protocol === "https:" && url.host === WEB_APP_HOST) return "load";
  return "outside";
}

// --- The page ---------------------------------------------------------------------------------

/**
 * Run before the page's own scripts: the marker that tells the page it is in the app
 * (`native-bridge.ts`). `sw` lets an app update switch the offline copy off.
 */
export function markerScript(sw = true): string {
  return `window[${JSON.stringify(SHELL_MARKER)}]=${JSON.stringify({ v: BRIDGE_VERSION, sw })};true;`;
}

const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

/** A message to the page, as script. Line and paragraph separators are escaped for JS. */
export function deliverScript(message: NativeToWeb): string {
  const json = JSON.stringify(message).split(LINE_SEPARATOR).join("\\u2028").split(PARAGRAPH_SEPARATOR).join("\\u2029");
  return `(function(){var r=window[${JSON.stringify(RECEIVER)}];if(r)r.receive(${json});})();true;`;
}

const WEB_TYPES = new Set<WebToNative["type"]>([
  "hello",
  "audio:play",
  "audio:pause",
  "audio:resume",
  "audio:seek",
  "audio:stop",
  "audio:mute",
  "audio:rate",
  "location:start",
  "location:stop",
  "location:permission",
  "purchase:buy",
  "purchase:restore",
  "handsfree",
  "pocket",
]);

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const text = (s: unknown): s is string => typeof s === "string";

function isPlayRequest(m: Record<string, unknown>): boolean {
  const at = m["at"] as Record<string, unknown> | undefined;
  return (
    text(m["key"]) && (m["key"] as string).startsWith("audio/") &&
    text(m["url"]) && /^https:\/\//.test(m["url"] as string) &&
    text(m["id"]) && text(m["title"]) && text(m["place"]) &&
    !!at && finite(at["lat"]) && finite(at["lng"]) &&
    finite(m["durationS"]) && finite(m["startAtS"]) && finite(m["rate"]) && typeof m["muted"] === "boolean"
  );
}

/**
 * What the page sent, if it is a message this app knows, well formed. Anything else is
 * dropped: the page is the app's own site, but a message is still checked before it moves
 * a player or opens the App Store.
 */
export function parseWebMessage(data: string): WebToNative | null {
  let m: unknown;
  try {
    m = JSON.parse(data);
  } catch {
    return null;
  }
  if (!m || typeof m !== "object") return null;
  const r = m as Record<string, unknown>;
  if (!WEB_TYPES.has(r["type"] as WebToNative["type"])) return null;
  switch (r["type"]) {
    case "audio:play":
      return isPlayRequest(r) ? (r as unknown as WebToNative) : null;
    case "audio:seek":
      return finite(r["fraction"]) ? (r as unknown as WebToNative) : null;
    case "audio:mute":
      return typeof r["muted"] === "boolean" ? (r as unknown as WebToNative) : null;
    case "audio:rate":
      return finite(r["rate"]) && (r["rate"] as number) > 0 ? (r as unknown as WebToNative) : null;
    case "location:start":
    case "location:permission":
    case "purchase:restore":
      return finite(r["id"]) ? (r as unknown as WebToNative) : null;
    case "purchase:buy":
      return finite(r["id"]) && (r["plan"] === "week" || r["plan"] === "city" || r["plan"] === "allAccess") &&
        (r["cityId"] === undefined || text(r["cityId"]))
        ? (r as unknown as WebToNative)
        : null;
    case "handsfree":
      return typeof r["on"] === "boolean" && typeof r["changed"] === "boolean" ? (r as unknown as WebToNative) : null;
    case "pocket": {
      const ids = (v: unknown) => Array.isArray(v) && v.every(text);
      const reqs = (v: unknown) => Array.isArray(v) && v.every((x) => !!x && typeof x === "object" && isPlayRequest(x as Record<string, unknown>));
      const current = r["current"];
      return typeof r["handsFree"] === "boolean" && text(r["mode"]) && ids(r["plays"]) && ids(r["captured"]) && reqs(r["waiting"]) &&
        (current === null || (!!current && typeof current === "object" && isPlayRequest(current as Record<string, unknown>)))
        ? (r as unknown as WebToNative)
        : null;
    }
    default:
      return r as unknown as WebToNative;
  }
}

// --- Location ---------------------------------------------------------------------------------

/** A fix as expo-location reports it, the fields the page reads. */
export interface PhoneFix extends Fix {
  readonly coords: Fix["coords"] & { readonly heading?: number | null };
}

/** The page's fix. Unknown accuracy, heading or speed stay unknown, never zero. */
export function bridgeFix(fix: PhoneFix): BridgeFix {
  const { latitude, longitude, accuracy, speed, heading } = fix.coords;
  return {
    lat: latitude,
    lng: longitude,
    accuracyM: accuracy !== null && accuracy >= 0 ? accuracy : null,
    headingDeg: heading !== undefined && heading !== null && heading >= 0 ? heading : null,
    speedMps: speed !== null && speed >= 0 ? speed : null,
    timestamp: fix.timestamp,
  };
}

/** How many fixes are kept for the page while it cannot run: hours of a walk at one a second. */
export const MAX_KEPT_FIXES = 4000;

/**
 * Fixes on their way to the page. Two watches can report the same fix (the page's own and,
 * during a hands free walk, the background task), and iOS can deliver a batch out of order,
 * so each is taken once, oldest first. While the page cannot run they are kept, in order,
 * and handed over together when it can.
 */
export class FixRelay {
  private lastMs = Number.NEGATIVE_INFINITY;
  private kept: BridgeFix[] = [];

  /** Take what the phone delivered. Returns the new fixes, oldest first. */
  take(fixes: readonly PhoneFix[]): BridgeFix[] {
    const fresh: BridgeFix[] = [];
    for (const fix of [...fixes].sort((a, b) => a.timestamp - b.timestamp)) {
      if (!(fix.timestamp > this.lastMs)) continue;
      if (!Number.isFinite(fix.coords.latitude) || !Number.isFinite(fix.coords.longitude)) continue;
      this.lastMs = fix.timestamp;
      fresh.push(bridgeFix(fix));
    }
    return fresh;
  }

  /** Keep these for later. The oldest go first once there are too many. */
  keep(fixes: readonly BridgeFix[]): void {
    this.kept.push(...fixes);
    if (this.kept.length > MAX_KEPT_FIXES) this.kept = this.kept.slice(this.kept.length - MAX_KEPT_FIXES);
  }

  /** Everything kept, oldest first, and forget it. */
  drain(): BridgeFix[] {
    const all = this.kept;
    this.kept = [];
    return all;
  }
}

// --- Passes -----------------------------------------------------------------------------------

/** What the page asked to buy, as the App Store sells it. Null for a plan it cannot sell. */
export function offerFor(plan: PlanKey, cityId: string | undefined): { plan: PlanKey; sku: string; city?: City } | null {
  if (plan === "allAccess") return { plan, sku: skuFor(plan) };
  const city = CITIES.find((c) => c.id === cityId);
  if (!city) return null;
  return { plan, sku: skuFor(plan, city.id), city };
}

// --- The pocket -------------------------------------------------------------------------------

/**
 * Every category, for the pocket's tracker. What may PLAY is the page's own answer (`plays`
 * in the plan, which already applied kids mode, true crime and the paywall); the tracker
 * only has to notice arriving.
 */
const POCKET_LISTENER: ListenerProfile = { categories: [...ECHO_CATEGORIES], age: 35, density: "immersive" };

const MODES: readonly TravelMode[] = ["walking", "cycling", "driving", "rail", "flight"];

function modeOf(mode: string): TravelMode {
  return (MODES as readonly string[]).includes(mode) ? (mode as TravelMode) : "walking";
}

/**
 * The walk while the page cannot run: the engine's own arrival rules (`CaptureTracker`, as
 * the page's walk uses), from the plan the page handed over. It starts only the echoes the
 * page said would play on arrival, and finds nothing the page had already found.
 */
export class PocketJudge {
  private readonly tracker: CaptureTracker;
  private readonly plays: ReadonlySet<string>;
  private readonly library: readonly Echo[];
  private lastMs = Number.NEGATIVE_INFINITY;

  constructor(plan: PocketPlan, library: readonly Echo[], nowIso: string) {
    this.plays = new Set(plan.plays);
    this.library = library.filter((e) => this.plays.has(e.id) || plan.captured.includes(e.id));
    this.tracker = CaptureTracker.restore(
      POCKET_LISTENER,
      plan.captured.map((echoId) => ({ echoId, capturedAt: nowIso })),
      { mode: modeOf(plan.mode) },
    );
  }

  /** Feed fixes; returns the echoes reached that play, in order. */
  update(fixes: readonly PhoneFix[]): Echo[] {
    const reached: Echo[] = [];
    for (const fix of [...fixes].sort((a, b) => a.timestamp - b.timestamp)) {
      if (!(fix.timestamp > this.lastMs)) continue;
      this.lastMs = fix.timestamp;
      for (const capture of this.tracker.update(positionOf(fix), this.library)) {
        if (this.plays.has(capture.echo.id)) reached.push(capture.echo);
      }
    }
    return reached;
  }
}

/** What the phone does when the page, back on screen, asks for an echo the pocket played. */
export type Reclaim = "adopt" | "ended" | "play";

/**
 * The hand back. While the page could not run, the phone played some echoes itself: what
 * it played to the end, and what is playing now. When the page runs again it is told where
 * you went (the kept fixes) and comes to the same echoes by the same rules; when it then
 * asks for one, the phone carries on with the one already playing ("adopt"), says at once
 * that one already heard has ended ("ended"), and plays anything else ("play").
 *
 * Only for a short while after the hand back: later, asking for an echo is the listener
 * choosing it, and it plays from the start.
 */
export class PocketLedger {
  private readonly heard = new Set<string>();
  private playing: string | null = null;
  private until = 0;

  /** The phone started this file while the page could not run. */
  started(key: string): void {
    this.playing = key;
  }

  /** It ran out. */
  finished(key: string): void {
    if (this.playing === key) this.playing = null;
    this.heard.add(key);
  }

  /** The page runs again; its asks are matched for `windowMs`. */
  handBack(nowMs: number, windowMs = RECLAIM_MS): void {
    this.until = nowMs + windowMs;
  }

  /** The page asked for `key`, and the phone has `loaded` in its player. */
  reclaim(key: string, loaded: string | null, nowMs: number): Reclaim {
    if (nowMs > this.until) {
      this.clear();
      return "play";
    }
    if (key === loaded && this.playing === key) return "adopt";
    if (this.heard.has(key)) {
      this.heard.delete(key);
      return "ended";
    }
    return "play";
  }

  /** The page went out of sight again, or the hand back is over. */
  clear(): void {
    this.heard.clear();
    this.playing = null;
    this.until = 0;
  }

  /** Anything to hand back? */
  get empty(): boolean {
    return this.heard.size === 0 && this.playing === null;
  }
}

/** How long after the hand back the page's asks are matched to what the pocket played. */
export const RECLAIM_MS = 20_000;

/** An echo the page asked for that this build's library does not have (a newer echo). */
export function echoOfRequest(request: PlayRequest, library: ReadonlyMap<string, Echo>): Echo {
  const known = library.get(request.id);
  if (known) return known;
  return {
    id: request.id,
    title: request.title,
    durationS: request.durationS,
    quality: 0,
    point: { at: request.at, place: request.place, triggerRadiusKm: 0 },
    renders: [{ voiceId: "", audioKey: request.key, durationS: request.durationS }],
  } as unknown as Echo;
}
