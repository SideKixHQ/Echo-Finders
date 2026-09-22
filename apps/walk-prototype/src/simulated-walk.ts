/**
 * A walk, without going outside.
 *
 * Implements the engine's `LocationSource`, so everything downstream — capture, dwell,
 * proximity, haptics — is the real code path, not a demo mode. The only thing being faked
 * is the GPS chip.
 */

import {
  buildRouteGeometry,
  pointAtDistance,
  type LocationSource,
  type Position,
  type Route,
} from "@echofinders/core";

export interface SimulatedWalkOptions {
  /** Real-world walking pace, km/h. */
  readonly speedKph?: number;
  /**
   * How much faster than life to run the simulation.
   *
   * At 14× a twelve-second dwell passes in under a second, which is too quick to watch the
   * ring fill. `?speed=2` in the URL slows it down for a demo or a screenshot.
   */
  readonly timeScale?: number;
  /** Position fixes per simulated second of walking. */
  readonly fixHz?: number;
  /** Reported accuracy, metres. A street between tall buildings is 25–40m. */
  readonly accuracyM?: number;
}

export class SimulatedWalk implements LocationSource {
  private readonly geometry: ReturnType<typeof buildRouteGeometry>;
  private readonly options: Required<SimulatedWalkOptions>;
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<(p: Position) => void>();

  /** Metres walked so far. */
  private metres = 0;
  private clockMs = Date.parse("2026-06-15T14:00:00Z");
  private paused = false;

  constructor(route: Route, options: SimulatedWalkOptions = {}) {
    this.geometry = buildRouteGeometry(route);
    this.options = {
      speedKph: options.speedKph ?? 4.5,
      timeScale: options.timeScale ?? 14,
      fixHz: options.fixHz ?? 4,
      accuracyM: options.accuracyM ?? 8,
    };
  }

  get totalMetres(): number {
    return this.geometry.totalKm * 1000;
  }

  get walkedMetres(): number {
    return this.metres;
  }

  watch(onFix: (position: Position) => void) {
    this.listeners.add(onFix);
    if (!this.timer) this.start();
    return () => {
      this.listeners.delete(onFix);
      if (this.listeners.size === 0) this.stop();
    };
  }

  setPaused(paused: boolean) {
    this.paused = paused;
  }

  /** Jump to a fraction of the way along. Lets the demo skip the dull stretches. */
  seekTo(fraction: number) {
    this.metres = Math.max(0, Math.min(1, fraction)) * this.totalMetres;
  }

  private start() {
    const intervalMs = 1000 / this.options.fixHz;
    this.timer = setInterval(() => this.tick(intervalMs), intervalMs);
  }

  private stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(intervalMs: number) {
    // Simulated seconds elapsed since the last fix.
    const simSeconds = (intervalMs / 1000) * this.options.timeScale;
    this.clockMs += simSeconds * 1000;

    if (!this.paused) {
      this.metres += (this.options.speedKph / 3.6) * simSeconds;
      if (this.metres > this.totalMetres) this.metres = this.totalMetres;
    }

    const at = pointAtDistance(this.geometry, this.metres / 1000);
    // A little jitter, so the smoothing in ProximityGuide is doing real work rather than
    // being handed a perfect signal it would never see on a street.
    const jitterDeg = 0.000015;
    const position: Position = {
      at: {
        lat: at.lat + (Math.random() - 0.5) * jitterDeg,
        lng: at.lng + (Math.random() - 0.5) * jitterDeg,
      },
      accuracyM: this.options.accuracyM,
      timestamp: this.clockMs,
      source: "device-gnss",
    };

    for (const listener of this.listeners) listener(position);
  }
}
