/**
 * The real GPS, as a `LocationSource`.
 *
 * Until now the only implementation of this interface was `SimulatedJourney`, which is
 * excellent for watching a walk in three minutes and useless for the thing that actually
 * decides whether this product works: standing in a street and being asked for your
 * location. The browser has never been asked. That made the single most failure-prone
 * moment in the whole app the only one nobody had tested.
 *
 * It implements exactly the same interface the simulation does, so nothing downstream
 * knows the difference. `WalkSession` takes either.
 *
 * Three things here are about refusal rather than about GPS, and they are the reason this
 * is more than a wrapper around `watchPosition`.
 *
 * **A refusal is permanent and must be reported as state, not as an error.** On iOS a
 * denied location prompt cannot be raised again from the page; it is fixed in Settings,
 * which nobody does. So a denial is not an exception to swallow — it is a condition the
 * interface has to explain, and `state` exists for that.
 *
 * **Never ask cold.** The policy in `@echofinders/core` says when each capability becomes
 * worth asking for, and this class asks for nothing on construction. `start()` is called
 * by a person pressing a button that says what it is for.
 *
 * **A first fix can take a long time.** A cold GPS under a building can be twenty seconds,
 * and a watch that has been granted but has not yet produced a position looks identical to
 * one that is broken. `locating` is that gap, named, so the screen can say "finding you"
 * rather than showing an empty map.
 */

import type { LocationSource, Position } from "@echofinders/core";

export type LocationState =
  /** Not asked yet. The honest starting point. */
  | { readonly kind: "idle" }
  /** Asked, and waiting for the person or for the first fix. */
  | { readonly kind: "locating" }
  | { readonly kind: "live"; readonly position: Position }
  /** Refused, unavailable, or a device with no GPS. All the same to the interface. */
  | { readonly kind: "denied"; readonly why: string };

export class BrowserLocation implements LocationSource {
  private readonly listeners = new Set<(p: Position) => void>();
  private watchId: number | null = null;
  private last: Position | null = null;
  private state: LocationState = { kind: "idle" };
  private readonly onState = new Set<(s: LocationState) => void>();

  get available(): boolean {
    return typeof navigator !== "undefined" && "geolocation" in navigator;
  }

  /** Subscribe to permission and fix state, for the screens that explain it. */
  watchState(handler: (state: LocationState) => void): () => void {
    this.onState.add(handler);
    handler(this.state);
    return () => void this.onState.delete(handler);
  }

  private set(state: LocationState) {
    this.state = state;
    for (const handler of this.onState) handler(state);
  }

  /**
   * Ask, and begin watching.
   *
   * Called from a tap, never from a mount. Resolves once the outcome is known either way,
   * so a button can show a spinner and then the answer.
   */
  async start(): Promise<LocationState> {
    if (this.watchId !== null) return this.state;
    if (!this.available) {
      this.set({ kind: "denied", why: "This browser cannot share a location" });
      return this.state;
    }

    this.set({ kind: "locating" });

    return new Promise<LocationState>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return true;
        settled = true;
        resolve(this.state);
        return false;
      };

      this.watchId = navigator.geolocation.watchPosition(
        (fix) => {
          const position: Position = {
            at: { lat: fix.coords.latitude, lng: fix.coords.longitude },
            accuracyM: fix.coords.accuracy,
            ...(fix.coords.heading !== null && !Number.isNaN(fix.coords.heading)
              ? { headingDeg: fix.coords.heading }
              : {}),
            ...(fix.coords.speed !== null && !Number.isNaN(fix.coords.speed)
              ? { speedKph: fix.coords.speed * 3.6 }
              : {}),
            timestamp: fix.timestamp,
            source: "device-gnss",
          };
          this.last = position;
          this.set({ kind: "live", position });
          for (const listener of this.listeners) listener(position);
          done();
        },
        (error) => {
          // A timeout on a later fix is a blip, not a refusal: a watch that has already
          // produced a position keeps running, and demoting it to "denied" would throw
          // away a working session because one fix was slow.
          if (error.code === error.TIMEOUT && this.last) return;
          this.set({
            kind: "denied",
            why:
              error.code === error.PERMISSION_DENIED
                ? "Location access was declined"
                : "No location available here",
          });
          done();
        },
        // High accuracy because a fifty-metre trigger radius needs it, and a long timeout
        // because a cold fix under a building genuinely takes that long.
        { enableHighAccuracy: true, timeout: 30_000, maximumAge: 5_000 },
      );
    });
  }

  watch(onFix: (position: Position) => void): () => void {
    this.listeners.add(onFix);
    // A subscriber arriving after the first fix should not have to wait for the next one.
    if (this.last) onFix(this.last);
    return () => void this.listeners.delete(onFix);
  }

  stop(): void {
    if (this.watchId !== null && this.available) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
    this.listeners.clear();
    this.set({ kind: "idle" });
  }

  /**
   * What the browser will do if asked, without asking.
   *
   * The Permissions API answers this on most browsers and is missing on Safari, where the
   * only way to find out is to ask. Returning "prompt" when we cannot tell is the right
   * default: it makes the interface offer the button rather than claim a refusal that may
   * not exist.
   */
  static async status(): Promise<PermissionState> {
    try {
      if (typeof navigator === "undefined" || !navigator.permissions?.query) return "prompt";
      const result = await navigator.permissions.query({ name: "geolocation" });
      return result.state;
    } catch {
      return "prompt";
    }
  }
}
