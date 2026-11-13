/**
 * A flight, in real time, from takeoff.
 *
 * A flight ran on `SimulatedJourney`, which plays any route in about 210 seconds: whatever
 * the clock said, JFK to Miami landed three and a half minutes after the gate, and on a
 * real plane every echo would have been offered in the first few minutes, wherever the
 * plane was. The demo stays, behind `?simulate` (`simulatesRoute`).
 *
 * This is the floor ADR-0002 asks for, dead reckoning: where the flight is comes from the
 * clock and the route's own distance and time curve (`RouteProfile`, the curve the
 * playlist and Coming up are planned against), counted from takeoff. Before takeoff the
 * plane is at the gate.
 *
 * TAKEOFF IS DETECTED FROM SPEED (James, 2026-11-13, decision 7): the first time the
 * phone's own position says it is moving faster than `TAKEOFF_KPH`. A "We've taken off"
 * button is the backup in that decision; it is new UI and waits for its mockup, so it is
 * not here. Until one of the two happens, the flight waits at the gate.
 *
 * Kept free of React and of the browser, with the time passed in, so it can be tested.
 */

import {
  RouteProfile,
  bearingDeg,
  buildRouteGeometry,
  distanceKm,
  pointAtDistance,
  presetFor,
  type LocationSource,
  type Position,
  type Route,
  type RouteGeometry,
} from "@echofinders/core";

/**
 * Faster than this over the ground and the aircraft has left it, km/h.
 *
 * The plan's figure ("GPS speed over about 250 km/h", Drives-and-flying-plan, F1): above any
 * taxi or road speed, and below an airliner's at rotation.
 */
export const TAKEOFF_KPH = 250;

/** How often the flight reports where it is, ms. */
const TICK_MS = 1000;

export interface FlightClockOptions {
  /** The wall clock, epoch ms. Injected so a test can move time. */
  readonly now?: () => number;
}

export class FlightClock implements LocationSource {
  readonly geometry: RouteGeometry;
  private readonly profile: RouteProfile;
  private readonly now: () => number;
  /** Where takeoff sits on the route's own clock: the end of the taxi (`idleS`). */
  private readonly takeoffS: number;
  /**
   * The last thing known for certain about where the flight is: so far along, at this
   * point on the route's own clock, at this wall-clock moment. Null until takeoff.
   */
  private anchor: { readonly km: number; readonly routeS: number; readonly ms: number } | null = null;
  /** The phone's last fix, for measuring its speed. */
  private lastGps: Position | null = null;
  private paused = false;
  private readonly listeners = new Set<(p: Position) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private unwatchGps: (() => void) | null = null;

  constructor(
    private readonly route: Route,
    private readonly gps: LocationSource,
    options: FlightClockOptions = {},
  ) {
    this.geometry = buildRouteGeometry(route);
    this.profile = RouteProfile.forRoute(route, this.geometry);
    this.now = options.now ?? Date.now;
    this.takeoffS = Math.min(presetFor(route.mode).idleS, route.durationS);
  }

  /** When the flight took off, epoch ms, or null while it is still on the ground. */
  get takeoffAtMs(): number | null {
    return this.anchor ? this.anchor.ms - (this.anchor.routeS - this.takeoffS) * 1000 : null;
  }

  /** Seconds into the route's own clock: 0 at the gate, `durationS` at arrival. */
  elapsedS(atMs = this.now()): number {
    if (!this.anchor) return 0;
    return Math.min(this.route.durationS, this.anchor.routeS + Math.max(0, atMs - this.anchor.ms) / 1000);
  }

  /** How far along the route, km. */
  km(atMs = this.now()): number {
    return this.profile.distanceAtTime(this.elapsedS(atMs));
  }

  /** The flight has taken off, at `atMs`. */
  tookOff(atMs: number): void {
    if (this.anchor) return;
    this.anchor = { km: this.profile.distanceAtTime(this.takeoffS), routeS: this.takeoffS, ms: atMs };
  }

  /** Report nothing while held (behind the welcome screens). The flight itself goes on. */
  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  /**
   * A fix from the phone. Used to tell when the plane has taken off.
   *
   * The speed is the one the phone reports where it gives one (measured by the satellites'
   * Doppler shift), otherwise measured between two fixes, and only when the distance
   * between them is more than both fixes' uncertainty: a parked phone's fix wanders, and
   * two wandering fixes a second apart can read as hundreds of km/h.
   */
  onGps(fix: Position): void {
    const kph = this.speedOf(fix);
    this.lastGps = fix;
    if (!this.anchor && kph !== null && kph > TAKEOFF_KPH) this.tookOff(fix.timestamp);
  }

  private speedOf(fix: Position): number | null {
    if (fix.speedKph !== undefined && fix.speedKph !== null && Number.isFinite(fix.speedKph)) return fix.speedKph;
    const last = this.lastGps;
    if (!last) return null;
    const seconds = (fix.timestamp - last.timestamp) / 1000;
    if (seconds <= 0) return null;
    const km = distanceKm(last.at, fix.at);
    const blurKm = ((last.accuracyM ?? 0) + (fix.accuracyM ?? 0)) / 1000;
    if (km <= blurKm) return null;
    return (km / seconds) * 3600;
  }

  /** Where the flight is now, by the clock. */
  position(atMs = this.now()): Position {
    const km = this.km(atMs);
    const at = pointAtDistance(this.geometry, km);
    const ahead = pointAtDistance(this.geometry, Math.min(km + 0.5, this.geometry.totalKm));
    const moving = this.anchor !== null && km < this.geometry.totalKm;
    return {
      at,
      ...(moving ? { headingDeg: bearingDeg(at, ahead) } : {}),
      timestamp: atMs,
      source: "dead-reckoned",
    };
  }

  watch(onFix: (position: Position) => void): () => void {
    this.listeners.add(onFix);
    if (!this.timer) this.start();
    return () => {
      this.listeners.delete(onFix);
      if (this.listeners.size === 0) this.stop();
    };
  }

  private start(): void {
    this.unwatchGps = this.gps.watch((fix) => this.onGps(fix));
    this.tick();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.unwatchGps?.();
    this.unwatchGps = null;
  }

  private tick(): void {
    if (this.paused) return;
    this.emit(this.position());
  }

  private emit(position: Position): void {
    for (const listener of this.listeners) listener(position);
  }
}
