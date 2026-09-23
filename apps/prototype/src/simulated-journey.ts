/**
 * A journey, without going anywhere.
 *
 * Implements the engine's `LocationSource`, so everything downstream — capture, dwell,
 * proximity, haptics — is the real code path, not a demo mode. The only thing being faked
 * is the GPS chip.
 *
 * Position comes from `RouteProfile`, which is the same distance–time curve the scheduler
 * plans against. That matters more than it sounds. The earlier version advanced at a
 * constant speed of its own, which meant the simulated traveller never idled at the gate,
 * never slowed for the descent, and — once routes gained stops — never actually stood at
 * any of them. A walker who strolls through Bowling Green at a steady pace cannot capture
 * both echoes there, so the demo would have quietly disagreed with the playlist about what
 * the listener hears. Driving the simulation from the profile removes the second opinion.
 */

import {
  RouteProfile,
  bearingDeg,
  buildRouteGeometry,
  pointAtDistance,
  presetFor,
  type LocationSource,
  type Position,
  type Route,
} from "@echofinders/core";

/** Roughly how long a full route should take to watch, whatever its real duration. */
const TARGET_WALL_CLOCK_S = 210;

export interface SimulatedJourneyOptions {
  /**
   * How much faster than life to run the simulation.
   *
   * Defaults so that every route takes about the same time to watch: a fifty-minute walk
   * and a three-hour flight are both unwatchable at 1×, and a scale that suits one is
   * wrong for the other by a factor of six. `?speed=2` in the URL overrides it, which is
   * what to use when the twelve-second capture ring needs to be seen filling.
   */
  readonly timeScale?: number;
  /** Position fixes per simulated second. */
  readonly fixHz?: number;
  /** Reported accuracy, metres. Defaults to what the mode typically achieves. */
  readonly accuracyM?: number;
}

export class SimulatedJourney implements LocationSource {
  private readonly geometry: ReturnType<typeof buildRouteGeometry>;
  private readonly profile: RouteProfile;
  private readonly options: Required<SimulatedJourneyOptions>;
  private readonly source: Position["source"];
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<(p: Position) => void>();

  /** Simulated seconds since departure. The single piece of state that matters. */
  private elapsedS = 0;
  private clockMs: number;
  private paused = false;

  constructor(
    private readonly route: Route,
    options: SimulatedJourneyOptions = {},
  ) {
    this.geometry = buildRouteGeometry(route);
    this.profile = RouteProfile.forRoute(route, this.geometry);
    const preset = presetFor(route.mode);
    this.clockMs = Date.parse(route.departureAt);
    // In the air the aircraft knows where it is and the handset does not (ADR-0002), so the
    // simulated fix should claim to be what the mode would actually be using.
    this.source = preset.positionPriority[0] ?? "device-gnss";
    this.options = {
      timeScale: options.timeScale ?? route.durationS / TARGET_WALL_CLOCK_S,
      fixHz: options.fixHz ?? 4,
      accuracyM: options.accuracyM ?? preset.typicalFixAccuracyM,
    };
  }

  get totalMetres(): number {
    return this.geometry.totalKm * 1000;
  }

  get walkedMetres(): number {
    return this.profile.distanceAtTime(this.elapsedS) * 1000;
  }

  /** Where the profile says the traveller is in the journey: idling, underway, arriving. */
  get phase() {
    return this.profile.phaseAtTime(this.elapsedS);
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

  /** Jump to a fraction of the way through. Lets the demo skip the dull stretches. */
  seekTo(fraction: number) {
    this.elapsedS = Math.max(0, Math.min(1, fraction)) * this.route.durationS;
    this.clockMs = Date.parse(this.route.departureAt) + this.elapsedS * 1000;
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
    /*
     * A paused journey reports nothing, rather than reporting the same place over and over.
     *
     * It used to keep emitting a jittered fix four times a second whatever the state of
     * `paused`, which meant the engine was live behind the pre-flight panel: proximity was
     * computed, guidance was rendered, and the sonar cue *played out loud* before the
     * listener had pressed Start or even interacted with the page — which is also why the
     * browser was refusing the audio context. Nothing captured, because the simulated
     * clock is frozen too, so it read as a stray noise from a screen that had not started.
     *
     * Returning here fixes the pre-flight case and the two real pauses at the same time,
     * and it is the honest model in all three: standing still is not a new position.
     */
    if (this.paused) return;

    const simSeconds = (intervalMs / 1000) * this.options.timeScale;
    this.elapsedS = Math.min(this.route.durationS, this.elapsedS + simSeconds);
    this.clockMs += simSeconds * 1000;

    const km = this.profile.distanceAtTime(this.elapsedS);
    const at = pointAtDistance(this.geometry, km);
    /*
     * Which way the traveller is going, from a short look-ahead — the same method
     * `positionAtTime` uses, so the simulated fix and the dead-reckoned one agree.
     *
     * The field was simply never filled, and `Position.headingDeg` is optional, so nothing
     * complained: the map's marker, the viewfinder's alignment and the archive's turn
     * hints were all being handed "no compass" by a source that knows the answer exactly.
     * Course over ground, not compass facing — at the end of a route there is no course,
     * and saying nothing is better than saying north.
     */
    const ahead = pointAtDistance(this.geometry, Math.min(km + 0.01, this.profile.totalKm));
    const heading = km >= this.profile.totalKm ? undefined : bearingDeg(at, ahead);
    // Jitter sized to the accuracy being claimed, so the smoothing in ProximityGuide is
    // doing real work rather than being handed a perfect signal it would never see.
    const jitterDeg = this.options.accuracyM / 111_320;
    const position: Position = {
      at: {
        lat: at.lat + (Math.random() - 0.5) * jitterDeg,
        lng: at.lng + (Math.random() - 0.5) * jitterDeg,
      },
      ...(heading === undefined ? {} : { headingDeg: heading }),
      accuracyM: this.options.accuracyM,
      timestamp: this.clockMs,
      source: this.source,
    };

    for (const listener of this.listeners) listener(position);
  }
}
