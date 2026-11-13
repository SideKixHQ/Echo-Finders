/**
 * The messages between the web app and the iPhone app that shows it (ADR-0012, amended
 * 2026-11-13). One file, read by both sides: `native-bridge.ts` here, and
 * `apps/ios/src/shell/` in the iPhone app, which imports it in place as it imports the
 * library. Types and constants only, so it costs a browser nothing.
 *
 * The iPhone app shows this web app, the deployed build itself, in a WebView. The page stays
 * the page; the phone supplies only what a page cannot do on an iPhone: narration that keeps
 * playing with the screen locked, location with the screen off, the App Store, and the
 * phone's own screens for downloads and the driving lock.
 *
 *   web to phone    `window.ReactNativeWebView.postMessage(JSON.stringify(message))`
 *   phone to web    `window.__echoFindersNative.receive(message)`, run by the phone
 *
 * A message that expects an answer carries an `id`; the answer is a `reply` with that id.
 */
import type { Entitlement } from "@echofinders/core";

/** Bumped when a message changes shape, so an old app and a new page can tell. */
export const BRIDGE_VERSION = 1;

/** What the phone sets before the page's own scripts run, so the page knows where it is. */
export const SHELL_MARKER = "__EF_SHELL__";
/** The page's receiver, which the phone calls. */
export const RECEIVER = "__echoFindersNative";

/** Set by the phone before the page loads. */
export interface ShellMarker {
  readonly v: number;
}

/** A position fix, as the phone reports it and the page's geolocation hands it on. */
export interface BridgeFix {
  readonly lat: number;
  readonly lng: number;
  /** Metres; null when the phone does not know. */
  readonly accuracyM: number | null;
  /** Degrees from north, the direction of travel; null when standing or unknown. */
  readonly headingDeg: number | null;
  /** Metres per second; null when unknown. */
  readonly speedMps: number | null;
  /** Epoch milliseconds, when the phone took it. */
  readonly timestamp: number;
}

/** An echo the page asks the phone to play: the file, and what the lock screen shows. */
export interface PlayRequest {
  /** The render's key, `audio/<id>/<voice>.mp3`. */
  readonly key: string;
  /** Where the file is, absolute. */
  readonly url: string;
  readonly id: string;
  readonly title: string;
  readonly place: string;
  /** Where the echo is, so a waiting echo can be dropped once walked away from. */
  readonly at: { readonly lat: number; readonly lng: number };
  /** The content file's length, used until the file says its own. */
  readonly durationS: number;
  readonly startAtS: number;
  readonly rate: number;
  readonly muted: boolean;
}

/**
 * The page going out of sight hands the phone the plan, because the page may not run again
 * until it is back on screen: what is playing, what waits behind it, and which echoes would
 * play on arrival (the engine's own answer, with the paywall's), for a walk with the phone
 * in a pocket.
 */
export interface PocketPlan {
  /** Hands-free is on in Settings. Without it the phone only finishes what was asked. */
  readonly handsFree: boolean;
  /** The journey's travel mode, as the engine names it. */
  readonly mode: string;
  /** Echo ids that start on their own when reached. */
  readonly plays: readonly string[];
  /** Echo ids already found, never found again. */
  readonly captured: readonly string[];
  /** The echo playing now, if any. */
  readonly current: PlayRequest | null;
  /** What waits behind it, in order. */
  readonly waiting: readonly PlayRequest[];
}

export type PurchasePlan = "week" | "city" | "allAccess";

export type PurchaseOutcome = "bought" | "cancelled" | "pending" | "failed";

/** Location permission, in the Permissions API's words. */
export type LocationPermission = "granted" | "denied" | "prompt";

export type WebToNative =
  | { readonly type: "hello"; readonly v: number }
  | ({ readonly type: "audio:play" } & PlayRequest)
  | { readonly type: "audio:pause" }
  | { readonly type: "audio:resume" }
  | { readonly type: "audio:seek"; readonly fraction: number }
  | { readonly type: "audio:stop" }
  | { readonly type: "audio:mute"; readonly muted: boolean }
  | { readonly type: "audio:rate"; readonly rate: number }
  | { readonly type: "location:start"; readonly id: number }
  | { readonly type: "location:stop" }
  | { readonly type: "location:permission"; readonly id: number }
  | { readonly type: "purchase:buy"; readonly id: number; readonly plan: PurchasePlan; readonly cityId?: string }
  | { readonly type: "purchase:restore"; readonly id: number }
  /**
   * Settings › Hands-free. `changed` is true when the listener just switched it, which is
   * the only time the phone may ask for Always; false when the page reports it on loading.
   */
  | { readonly type: "handsfree"; readonly on: boolean; readonly changed: boolean }
  | ({ readonly type: "pocket" } & PocketPlan);

export type NativeToWeb =
  | { readonly type: "reply"; readonly id: number; readonly result: unknown }
  | { readonly type: "audio:ended"; readonly key: string }
  | { readonly type: "audio:failed"; readonly key: string }
  | { readonly type: "audio:progress"; readonly key: string; readonly positionS: number; readonly durationS: number }
  /** Play or Pause pressed on the lock screen or on headphones. */
  | { readonly type: "audio:remote"; readonly action: "play" | "pause" }
  | { readonly type: "location:fixes"; readonly fixes: readonly BridgeFix[] }
  /** 1 refused, 2 unavailable: the Geolocation API's own codes. */
  | { readonly type: "location:error"; readonly code: 1 | 2 }
  /** What the App Store says this Apple Account holds, and nothing else. */
  | { readonly type: "purchase:entitlement"; readonly entitlement: Entitlement };

export interface LocationStartResult {
  readonly status: "granted" | "denied" | "unavailable";
}

export interface PurchaseResult {
  readonly outcome: PurchaseOutcome;
  /** Words the phone already says for this (an Ask to Buy wait, an App Store failure). */
  readonly message?: string;
}
