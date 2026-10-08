/**
 * Holding the screen awake, which is what makes the walk work at all on the web.
 *
 * The policy is in the engine (`screenAwake`), where it can be tested without a browser.
 * This file is the adapter: it owns the one platform call, and the three ways that call
 * goes wrong.
 *
 * **The lock releases itself when the page hides, and does not come back.** This is the
 * thing everybody gets wrong. Lock the phone, unlock it, and the sentinel you are holding
 * is already dead: the promise resolved long ago and nothing tells you. So the hook
 * listens for `visibilitychange` and re-requests on the way back, every time.
 *
 * **The request can be refused** — Safari refuses while the page is not visible, and
 * browsers refuse at low battery — so a rejection is an ordinary outcome, not an error to
 * throw. It is recorded and surfaced, because an app that quietly fails to keep the screen
 * on is worse than one that says it cannot.
 *
 * **Support is uneven.** Screen Wake Lock needs iOS 18.4 or later and, on iOS, a web app
 * added to the home screen. In a plain Safari tab it is simply absent. `unsupported` is a
 * first-class state for that reason, and the settings screen can say so plainly rather
 * than pretending.
 *
 * Nothing here throws. The worst case is the phone sleeping, which is exactly what happens
 * today with no wake lock at all, so a failure is never worse than the status quo.
 */

import { useEffect, useRef, useState } from "react";
import type { ScreenAwakeDecision } from "@echofinders/core";

export type WakeState =
  /** Held right now. The screen will not dim. */
  | "held"
  /** Nothing is asking for it. */
  | "idle"
  /** The browser cannot do this at all. */
  | "unsupported"
  /** The browser could and would not. Low battery, or the page was not visible. */
  | "refused";

interface WakeSentinel {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: "release", listener: () => void): void;
}

/** Whether the page is visible, as a React value. The decision needs it; so does the hook. */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState === "visible",
  );
  useEffect(() => {
    const on = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return visible;
}

/*
 * `"wakeLock" in navigator` is not good enough: the key can be present with the value
 * undefined, and then the feature reads as supported right up to the call that throws.
 * Ask for the method itself.
 */
const supported = (): boolean =>
  typeof navigator !== "undefined" &&
  typeof (navigator as unknown as { wakeLock?: { request?: unknown } }).wakeLock?.request === "function";

/**
 * @param want Whether the app currently needs the screen held, from `screenAwake`.
 * @returns What actually happened, which is not always what was wanted.
 */
export function useScreenAwake(want: ScreenAwakeDecision): WakeState {
  const [state, setState] = useState<WakeState>(() => (supported() ? "idle" : "unsupported"));
  const sentinel = useRef<WakeSentinel | null>(null);
  /**
   * Guards against two requests in flight at once.
   *
   * Without it, a visibility change arriving while a request is pending leaves the first
   * sentinel unreferenced and un-released, and the screen stays awake after the walk ends
   * with nothing holding a handle to turn it off.
   */
  const turn = useRef(0);

  useEffect(() => {
    if (!supported()) return;
    let cancelled = false;

    const drop = async () => {
      const held = sentinel.current;
      sentinel.current = null;
      if (held && !held.released) await held.release().catch(() => {});
    };

    const take = async () => {
      if (sentinel.current && !sentinel.current.released) return;
      const mine = ++turn.current;
      try {
        const api = (navigator as unknown as {
          wakeLock: { request(type: "screen"): Promise<WakeSentinel> };
        }).wakeLock;
        const got = await api.request("screen");
        // A newer turn started while this one was in flight, or the effect was torn down.
        if (cancelled || mine !== turn.current) { await got.release().catch(() => {}); return; }
        sentinel.current = got;
        // The browser releases it on its own when the page hides. Reflect that rather
        // than reporting "held" over a lock that no longer exists.
        got.addEventListener("release", () => {
          if (sentinel.current === got) sentinel.current = null;
          if (!cancelled) setState((s) => (s === "held" ? "idle" : s));
        });
        setState("held");
      } catch {
        if (!cancelled) setState("refused");
      }
    };

    const sync = () => {
      const visible = typeof document === "undefined" || document.visibilityState === "visible";
      if (want.hold && visible) void take();
      else { void drop(); if (!cancelled) setState(want.hold ? "idle" : "idle"); }
    };

    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", sync);
      void drop();
    };
  }, [want.hold]);

  return state;
}

/**
 * The lock screen and the headphone buttons.
 *
 * Separate from the wake lock and solving the other half of the same problem: when audio
 * is playing, the phone should show what is playing and respond to a squeezed earbud. The
 * Media Session API is the only part of a web client that reaches the lock screen at all,
 * so it is the difference between an echo that behaves like a podcast and one that
 * behaves like a web page making noise.
 *
 * Every handler is optional, and an unsupported browser gets a no-op rather than a check
 * at every call site.
 */
export interface NowPlayingMeta {
  readonly title: string;
  readonly place: string;
  /** Which button the lock screen shows: Pause while playing, Play while paused. */
  readonly state?: "playing" | "paused";
  readonly onPlay?: () => void;
  readonly onPause?: () => void;
  readonly onStop?: () => void;
  readonly onNext?: () => void;
}

export function publishNowPlaying(meta: NowPlayingMeta | null): void {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  const ms = (navigator as unknown as { mediaSession: MediaSession }).mediaSession;
  if (!meta) {
    ms.metadata = null;
    ms.playbackState = "none";
    for (const a of ["play", "pause", "stop", "nexttrack"] as const) {
      try { ms.setActionHandler(a, null); } catch { /* not every browser has every action */ }
    }
    return;
  }
  try {
    ms.metadata = new MediaMetadata({
      title: meta.title,
      artist: meta.place,
      album: "Echo Finders",
    });
  } catch { /* Firefox has mediaSession without MediaMetadata in some versions */ }
  ms.playbackState = meta.state ?? "playing";
  const set = (action: MediaSessionAction, fn?: () => void) => {
    try { ms.setActionHandler(action, fn ? () => fn() : null); } catch { /* unsupported action */ }
  };
  set("play", meta.onPlay);
  set("pause", meta.onPause);
  set("stop", meta.onStop);
  set("nexttrack", meta.onNext);
}
