/**
 * The web app inside the iPhone app (ADR-0012, amended 2026-11-13).
 *
 * The iPhone app shows this web app, the deployed build itself, in a WebView, so every screen
 * is exactly the one built and approved here. What a page cannot do on an iPhone the phone
 * does, and this module is the only place the web app knows about it:
 *
 *   narration       played by the phone's own player, so it carries on with the screen
 *                   locked and shows on the lock screen (`narratorFor`)
 *   location        from the phone, with the screen off during a hands free walk
 *                   (`navigator.geolocation`, answered by the phone)
 *   passes          bought and restored through the App Store (`buyInApp`, `restoreInApp`,
 *                   `useInAppEntitlement`)
 *   lock screen     the phone's; its Play and Pause reach the page's own handlers
 *   offline         the app shell kept by a service worker registered only in the app
 *
 * NOTHING CHANGES IN A BROWSER. Everything here is switched on only when the page finds the
 * iPhone app's bridge (`window.ReactNativeWebView`) and the app's own marker, which the app
 * sets before the page's scripts run. Without both, `inApp()` is false and every export
 * hands back exactly what the code did before: `narratorFor` is `new Narration`,
 * `useInAppEntitlement` returns its argument, and nothing is installed. `audit:bridge`
 * checks both sides.
 *
 * The messages are in `native-bridge-protocol.ts`, which the iPhone app reads too.
 */
import { useMemo, useSyncExternalStore } from "react";
import { FREE, type Echo, type Entitlement, type QueuedEcho, type WalkSession } from "@echofinders/core";
import { Narration } from "./narration";
import { SpeechAudio } from "./speech-audio";
import { readSettings } from "./settings-store";
import {
  BRIDGE_VERSION,
  RECEIVER,
  SHELL_MARKER,
  type BridgeFix,
  type LocationPermission,
  type LocationStartResult,
  type NativeToWeb,
  type PlayRequest,
  type PurchasePlan,
  type PurchaseResult,
  type WebToNative,
} from "./native-bridge-protocol";

interface Host {
  ReactNativeWebView?: { postMessage(data: string): void };
  [SHELL_MARKER]?: { v?: unknown; sw?: unknown };
  [RECEIVER]?: { receive(message: NativeToWeb): void };
}

function host(): Host | null {
  return typeof window === "undefined" ? null : (window as unknown as Host);
}

/** Is this page inside the iPhone app? Both the bridge and the app's own marker must be there. */
export function inApp(): boolean {
  const h = host();
  return !!h && typeof h.ReactNativeWebView?.postMessage === "function" && typeof h[SHELL_MARKER] === "object" && h[SHELL_MARKER] !== null;
}

// --- The wire -------------------------------------------------------------------------------

let nextId = 1;
const pending = new Map<number, (result: unknown) => void>();

function post(message: WebToNative): void {
  host()?.ReactNativeWebView?.postMessage(JSON.stringify(message));
}

/** Send a message that expects a reply, and wait for it. */
function ask<T>(make: (id: number) => WebToNative): Promise<T> {
  const id = nextId++;
  return new Promise<T>((resolve) => {
    pending.set(id, resolve as (result: unknown) => void);
    post(make(id));
  });
}

/** Everything the phone says arrives here. */
function receive(message: NativeToWeb): void {
  switch (message.type) {
    case "reply": {
      const resolve = pending.get(message.id);
      pending.delete(message.id);
      resolve?.(message.result);
      return;
    }
    case "location:fixes":
      geolocation.deliver(message.fixes);
      return;
    case "location:error":
      geolocation.fail(message.code);
      return;
    case "purchase:entitlement":
      appStore = message.entitlement;
      for (const listener of entitlementListeners) listener();
      return;
    case "audio:remote":
      lockScreen.press(message.action);
      return;
    case "audio:ended":
    case "audio:failed":
    case "audio:progress":
      for (const narrator of narrators) narrator.hear(message);
      return;
  }
}

// --- Location -------------------------------------------------------------------------------

/** The Geolocation API's error, as `BrowserLocation` and `Suggest` read it. */
function positionError(code: 1 | 2): GeolocationPositionError {
  return {
    code,
    message: code === 1 ? "User denied Geolocation" : "Position unavailable",
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  } as GeolocationPositionError;
}

function positionOf(fix: BridgeFix): GeolocationPosition {
  const coords = {
    latitude: fix.lat,
    longitude: fix.lng,
    accuracy: fix.accuracyM ?? 1000,
    altitude: null,
    altitudeAccuracy: null,
    heading: fix.headingDeg,
    speed: fix.speedMps,
  };
  return { coords: { ...coords, toJSON: () => coords }, timestamp: fix.timestamp, toJSON: () => ({ coords, timestamp: fix.timestamp }) } as GeolocationPosition;
}

/**
 * `navigator.geolocation`, answered by the phone. The page's `BrowserLocation` and every
 * other caller use it unchanged; the phone asks for permission in its own order
 * (`docs/ios-permissions.md`) and keeps sending fixes with the screen off during a hands
 * free walk.
 */
class PhoneGeolocation {
  private readonly watchers = new Map<number, { ok: PositionCallback; fail?: PositionErrorCallback | null; once: boolean }>();
  private next = 1;
  private started = false;
  private last: GeolocationPosition | null = null;

  watchPosition(ok: PositionCallback, fail?: PositionErrorCallback | null): number {
    const id = this.next++;
    this.watchers.set(id, { ok, fail: fail ?? null, once: false });
    this.ensure();
    const last = this.last;
    if (last) setTimeout(() => this.watchers.get(id)?.ok(last), 0);
    return id;
  }

  getCurrentPosition(ok: PositionCallback, fail?: PositionErrorCallback | null): void {
    const last = this.last;
    if (last && Date.now() - last.timestamp < 10_000) {
      setTimeout(() => ok(last), 0);
      return;
    }
    this.watchers.set(this.next++, { ok, fail: fail ?? null, once: true });
    this.ensure();
  }

  clearWatch(id: number): void {
    this.watchers.delete(id);
    this.settle();
  }

  /** Fixes from the phone, oldest first. */
  deliver(fixes: readonly BridgeFix[]): void {
    for (const fix of fixes) {
      const position = positionOf(fix);
      this.last = position;
      for (const [id, watcher] of [...this.watchers]) {
        if (watcher.once) this.watchers.delete(id);
        watcher.ok(position);
      }
    }
    this.settle();
  }

  fail(code: 1 | 2): void {
    const error = positionError(code);
    for (const [id, watcher] of [...this.watchers]) {
      if (watcher.once) this.watchers.delete(id);
      watcher.fail?.(error);
    }
    this.started = false;
    this.settle();
  }

  private ensure(): void {
    if (this.started) return;
    this.started = true;
    void ask<LocationStartResult>((id) => ({ type: "location:start", id })).then((result) => {
      if (result?.status !== "granted") this.fail(result?.status === "denied" ? 1 : 2);
    });
  }

  /** Nobody listening: the phone stops looking. */
  private settle(): void {
    if (this.watchers.size > 0 || !this.started) return;
    this.started = false;
    post({ type: "location:stop" });
  }
}

const geolocation = new PhoneGeolocation();

// --- The lock screen ------------------------------------------------------------------------

/**
 * `navigator.mediaSession`, kept for the phone. The page publishes its Play, Pause and Stop
 * handlers here as it does in Safari (`publishNowPlaying` in `wake.ts`); the phone's lock
 * screen shows the echo itself, and its buttons call these handlers, so the page's player
 * and the phone's stay in step.
 */
const lockScreen = {
  handlers: new Map<string, ((details: { action: string }) => void) | null>(),
  session: {
    metadata: null as unknown,
    playbackState: "none" as string,
    setActionHandler(action: string, handler: ((details: { action: string }) => void) | null) {
      lockScreen.handlers.set(action, handler);
    },
    setPositionState() {},
  },
  press(action: "play" | "pause") {
    lockScreen.handlers.get(action)?.({ action });
  },
};

// --- Narration ------------------------------------------------------------------------------

const narrators = new Set<PhoneNarration>();

/** What the phone needs to play a render and show it on the lock screen. */
export function playRequest(echo: Echo, key: string, options: { startAtS: number; rate: number; muted: boolean }): PlayRequest {
  return {
    key,
    url: new URL(`/${key}`, window.location.origin).href,
    id: echo.id,
    title: echo.title,
    place: echo.point.place,
    at: { lat: echo.point.at.lat, lng: echo.point.at.lng },
    durationS: echo.durationS,
    startAtS: options.startAtS,
    rate: options.rate,
    muted: options.muted,
  };
}

/**
 * `Narration`, with its recordings played by the phone. The same choice per echo as
 * `Narration` makes: a render plays from its file, and an echo with no render, or the simple
 * telling (which has none), is spoken by the page's stand in voice, exactly as in Safari.
 */
export class PhoneNarration {
  private readonly speech: SpeechAudio;
  private readonly handlers = new Set<() => void>();
  private readonly blockedHandlers = new Set<() => void>();
  private readonly byFile: ReadonlyMap<string, Echo>;
  /** The file the phone is playing for this page, or null. */
  private current: PlayRequest | null = null;
  private simple = false;
  private muted = false;
  private rate = 1;
  /** The phone's last word on where it is in the file. */
  position: { key: string; positionS: number; durationS: number } | null = null;

  constructor(library: readonly Echo[]) {
    this.speech = new SpeechAudio(library);
    this.speech.ended(() => this.fire());
    const byFile = new Map<string, Echo>();
    for (const echo of library) {
      for (const render of echo.renders ?? []) {
        if (render.audioKey.startsWith("audio/")) byFile.set(render.audioKey, echo);
      }
    }
    this.byFile = byFile;
    narrators.add(this);
  }

  /** The request for the file playing now, for the pocket hand over. */
  get playing(): PlayRequest | null {
    return this.current;
  }

  /** Would this echo play from a file, as things are set? The pocket can only play those. */
  fileFor(echo: Echo, key: string): PlayRequest | null {
    if (!this.byFile.has(key) || (this.simple && echo.simple?.script)) return null;
    return playRequest(echo, key, { startAtS: 0, rate: this.rate, muted: this.muted });
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.speech.setMuted(muted);
    post({ type: "audio:mute", muted });
  }

  setRate(rate: number) {
    this.rate = rate;
    this.speech.setRate(rate);
    post({ type: "audio:rate", rate });
  }

  setVoice(voiceId: string | null) {
    this.speech.setVoice(voiceId);
  }

  setSimple(simple: boolean) {
    this.simple = simple;
    this.speech.setSimple(simple);
  }

  get busy(): boolean {
    return this.current !== null || this.speech.busy;
  }

  play(audioKey: string, options?: { startAtS?: number }) {
    const echo = this.byFile.get(audioKey);
    if (!echo || (this.simple && echo.simple?.script)) {
      this.haltFile();
      this.speech.play(echo ? `speech/${echo.id}` : audioKey);
      return;
    }
    this.speech.stop();
    this.current = playRequest(echo, audioKey, { startAtS: Math.max(0, options?.startAtS ?? 0), rate: this.rate, muted: this.muted });
    this.position = null;
    post({ type: "audio:play", ...this.current });
  }

  seek(fraction: number) {
    if (this.current) post({ type: "audio:seek", fraction: Math.max(0, Math.min(1, fraction)) });
    else this.speech.seek(fraction);
  }

  pause() {
    if (this.current) post({ type: "audio:pause" });
    else this.speech.pause();
  }

  resume() {
    if (this.current) post({ type: "audio:resume" });
    else this.speech.resume();
  }

  stop() {
    this.haltFile();
    this.speech.stop();
  }

  chime() {
    this.speech.chime();
  }

  ended(handler: () => void) {
    this.handlers.add(handler);
    return () => void this.handlers.delete(handler);
  }

  /** As `Narration.blocked`. The phone needs no tap to start a file, so it never fires. */
  blocked(handler: () => void) {
    this.blockedHandlers.add(handler);
    return () => void this.blockedHandlers.delete(handler);
  }

  /** What the phone said about a file. Only the file playing now counts. */
  hear(message: Extract<NativeToWeb, { type: "audio:ended" | "audio:failed" | "audio:progress" }>) {
    if (!this.current || message.key !== this.current.key) return;
    if (message.type === "audio:progress") {
      this.position = { key: message.key, positionS: message.positionS, durationS: message.durationS };
      return;
    }
    const echo = this.byFile.get(this.current.key);
    this.current = null;
    this.position = null;
    // A file that will not play falls back to the stand in, as `Narration` does.
    if (message.type === "audio:failed" && echo) this.speech.play(`speech/${echo.id}`);
    else this.fire();
  }

  /** Stop the phone's file without reporting an end: a stop is not a finish. */
  private haltFile() {
    if (!this.current) return;
    this.current = null;
    this.position = null;
    post({ type: "audio:stop" });
  }

  private fire() {
    for (const handler of this.handlers) handler();
  }
}

/** The narrator for this page: the phone's player in the iPhone app, `Narration` elsewhere. */
export function narratorFor(library: readonly Echo[]): Narration | PhoneNarration {
  return inApp() ? new PhoneNarration(library) : new Narration(library);
}

// --- The pocket hand over -------------------------------------------------------------------

let journey: { session: WalkSession; library: readonly Echo[]; narrator: Narration | PhoneNarration; waiting: readonly QueuedEcho[] } | null = null;

/**
 * The journey this page is on, for the hand over when the page goes out of sight. Returns
 * how to let go. Does nothing outside the app.
 */
export function bridgeSession(session: WalkSession, library: readonly Echo[], narrator: Narration | PhoneNarration): () => void {
  if (!inApp()) return () => undefined;
  const mine = { session, library, narrator, waiting: [] as readonly QueuedEcho[] };
  journey = mine;
  const off = session.subscribe((event) => {
    if (event.type === "playback") mine.waiting = event.waiting;
  });
  return () => {
    off();
    if (journey === mine) journey = null;
  };
}

/**
 * The engine's own answers, read from the session: what plays on arrival
 * (`playsOnArrival`), what the paywall allows (the gate the app sets), and what is found.
 * The gate and the mode are not public on `WalkSession`, so they are read by name;
 * `audit:bridge` checks the plan still carries them.
 */
function pocketPlan(): WebToNative | null {
  if (!journey) return null;
  const { session, library, narrator, waiting } = journey;
  const inside = session as unknown as { playGate?: ((echo: Echo) => boolean) | null; mode?: string };
  const gate = inside.playGate ?? null;
  const phone = narrator instanceof PhoneNarration ? narrator : null;
  const plays: string[] = [];
  const captured: string[] = [];
  for (const echo of library) {
    if (session.tracker.stateOf(echo.id) !== "sealed") {
      captured.push(echo.id);
      continue;
    }
    const key = echo.renders?.find((r) => r.audioKey.startsWith("audio/"))?.audioKey;
    if (!key || !phone?.fileFor(echo, key)) continue;
    if (!session.playsOnArrival(echo) || (gate && !gate(echo))) continue;
    plays.push(echo.id);
  }
  const queued = waiting
    .map((item) => phone?.fileFor(item.echo, item.render.audioKey) ?? null)
    .filter((r): r is PlayRequest => r !== null);
  return {
    type: "pocket",
    handsFree: readSettings().privacy.handsFree,
    mode: inside.mode ?? "walking",
    plays,
    captured,
    current: phone?.playing ?? null,
    waiting: queued,
  };
}

// --- Hands-free -----------------------------------------------------------------------------

let handsFree: boolean | null = null;

/** Settings › Hands-free, as saved. The phone hears when it changes. */
function checkHandsFree(): void {
  const on = readSettings().privacy.handsFree;
  if (on === handsFree) return;
  const first = handsFree === null;
  handsFree = on;
  post({ type: "handsfree", on, changed: !first });
}

// --- Passes ---------------------------------------------------------------------------------

/** What the App Store says this Apple Account holds. Free until the phone says otherwise. */
let appStore: Entitlement = FREE;
const entitlementListeners = new Set<() => void>();

/**
 * Two records as one: every city, the latest end of each Week Pass, the year that runs
 * longest. The same sum as the iPhone app's `mergeEntitlements`
 * (`apps/ios/src/purchases/entitlement.ts`), which `test/ios/bridge.test.ts` holds it to.
 */
export function mergePasses(a: Entitlement, b: Entitlement): Entitlement {
  const paid = [a, b].filter((e) => e.kind !== "free");
  if (paid.length === 0) return FREE;
  if (paid.length === 1) return paid[0]!;
  const firsts = paid.map((e) => e.purchasedAt).filter((n): n is number => typeof n === "number");
  const at = firsts.length ? { purchasedAt: Math.min(...firsts) } : {};
  if (paid.some((e) => e.kind === "unlocked")) return { kind: "unlocked", ...at };
  const cities = [...new Set(paid.flatMap((e) => e.cities ?? []))].sort();
  const weekUntil = new Map<string, number>();
  for (const w of paid.flatMap((e) => e.weekPasses ?? [])) weekUntil.set(w.city, Math.max(w.until, weekUntil.get(w.city) ?? 0));
  const weekPasses = [...weekUntil].sort(([x], [y]) => x.localeCompare(y)).map(([city, until]) => ({ city, until }));
  const year = paid
    .filter((e) => e.allAccessUntil !== undefined)
    .sort((x, y) => (y.allAccessUntil ?? 0) - (x.allAccessUntil ?? 0))[0];
  return {
    kind: "passes",
    ...at,
    ...(cities.length ? { cities } : {}),
    ...(weekPasses.length ? { weekPasses } : {}),
    ...(year ? { allAccessUntil: year.allAccessUntil! } : {}),
    ...(year && year.renews === false ? { renews: false } : {}),
  };
}

function subscribeEntitlement(listener: () => void): () => void {
  entitlementListeners.add(listener);
  return () => void entitlementListeners.delete(listener);
}

/**
 * What this listener holds: the page's own record (a website purchase, or one recorded on
 * this phone), and in the iPhone app what the App Store holds too. Outside the app it is
 * the page's record, the same object.
 */
export function useInAppEntitlement(web: Entitlement): Entitlement {
  const store = useSyncExternalStore(subscribeEntitlement, () => appStore, () => appStore);
  return useMemo(() => (inApp() ? mergePasses(web, store) : web), [web, store]);
}

/** The same, outside React: a record with the App Store's passes added in the app. */
export function withInApp(web: Entitlement): Entitlement {
  return inApp() ? mergePasses(web, appStore) : web;
}

/**
 * Buy through the App Store. Resolves true once bought (the phone has already sent what
 * the App Store now holds), false if the listener cancelled; throws with the phone's words
 * when it is waiting for approval or did not go through.
 */
export async function buyInApp(plan: PurchasePlan, cityId: string | undefined): Promise<boolean> {
  const result = await ask<PurchaseResult>((id) => ({ type: "purchase:buy", id, plan, ...(cityId ? { cityId } : {}) }));
  if (result?.outcome === "bought") return true;
  if (result?.outcome === "cancelled") return false;
  throw new Error(result?.message ?? "");
}

/** Restore from the App Store; what it holds arrives before this resolves. */
export async function restoreInApp(): Promise<void> {
  await ask<unknown>((id) => ({ type: "purchase:restore", id }));
}

// --- Offline --------------------------------------------------------------------------------

/**
 * The app shell, kept for a launch with no signal: a service worker registered only here,
 * in the app (`public/app-sw.js`). A browser never registers it.
 */
function keepOffline(): void {
  const marker = host()?.[SHELL_MARKER];
  if (!("serviceWorker" in navigator)) return;
  if (marker?.sw === false) {
    void navigator.serviceWorker.getRegistrations().then((all) => all.forEach((r) => void r.unregister()));
    return;
  }
  navigator.serviceWorker.register("/app-sw.js", { scope: "/" }).catch(() => undefined);
}

// --- Start ----------------------------------------------------------------------------------

function define(target: object, name: string, value: unknown): void {
  try {
    Object.defineProperty(target, name, { value, configurable: true, writable: true });
  } catch {
    /* Left as the browser has it. */
  }
}

function install(): void {
  const h = host()!;
  h[RECEIVER] = { receive };
  define(navigator, "geolocation", geolocation);
  define(navigator, "mediaSession", lockScreen.session);
  const permissions = navigator.permissions;
  if (permissions?.query) {
    const query = permissions.query.bind(permissions);
    define(permissions, "query", (descriptor: PermissionDescriptor) =>
      descriptor?.name === "geolocation"
        ? ask<LocationPermission>((id) => ({ type: "location:permission", id })).then(
            (state) => ({ name: "geolocation", state, onchange: null, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false }) as unknown as PermissionStatus,
          )
        : query(descriptor),
    );
  }
  post({ type: "hello", v: BRIDGE_VERSION });
  checkHandsFree();
  // The switch is saved by Settings; look for a change while the page is on screen.
  setInterval(() => {
    if (document.visibilityState === "visible") checkHandsFree();
  }, 400);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") return;
    checkHandsFree();
    const plan = pocketPlan();
    if (plan) post(plan);
  });
  keepOffline();
}

if (inApp()) install();
