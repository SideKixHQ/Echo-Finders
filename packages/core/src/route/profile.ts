/**
 * The mapping between "how far along the route" and "how many seconds since departure".
 *
 * A constant-speed model is badly wrong at exactly the moments that matter. Ten minutes
 * after a JFK departure the aircraft has barely cleared Jamaica Bay, but constant speed
 * would place it over Philadelphia and cue an echo about the wrong city. The same mistake
 * appears in every mode, just scaled: a walking tour that assumes you were already at
 * strolling pace during the first twenty seconds has you a block further along than you
 * are, which on foot is an entirely different building.
 *
 * So the profile models four stages — idling, getting up to speed, travelling, slowing —
 * with lengths taken from the mode preset rather than hardcoded.
 */

import type { RoutePhase, Route, Position, TravelMode } from "../types.js";
import { presetFor } from "../modes.js";
import { pointAtDistance, type RouteGeometry } from "../geo/corridor.js";
import { bearingDeg } from "../geo/great-circle.js";

/** Relative ground speed through each phase. Absolute values are derived, not assumed. */
interface PhaseSpec {
  readonly phase: RoutePhase;
  readonly seconds: number;
  /** Ground speed at the start and end of the phase, as a fraction of cruise speed. */
  readonly from: number;
  readonly to: number;
}

/** A place the traveller stands still, at a known distance along the route. */
export interface RouteStop {
  readonly distanceKm: number;
  readonly seconds: number;
}

/** Overrides for the stage lengths the mode preset would otherwise supply. */
export interface ProfileOptions {
  readonly idleS?: number;
  readonly settlingS?: number;
  readonly arrivingS?: number;
  readonly finishingS?: number;
  /**
   * Stops along the route, in distance order. `RouteProfile.forRoute` derives these from
   * the waypoints' dwell times; they are exposed here so a caller can model a stop that
   * is not a waypoint.
   *
   * The total dwell is taken out of the route's duration, not added to it — the duration
   * is door to door either way, and the legs between stops speed up to absorb it.
   */
  readonly stops?: readonly RouteStop[];
}

const SAMPLES = 2000;

/** Speed while idling, as a fraction of travelling speed. Not zero: taxiing is movement. */
const IDLE_FACTOR = 0.02;

/** Speed at the moment acceleration begins. */
const INITIAL_FACTOR = 0.35;

/**
 * The most of a route's duration that may be spent standing still.
 *
 * A backstop against content, not a design parameter. Dwell is subtracted from the
 * duration, so stops totalling more than the route lasts would leave negative time to
 * walk in; capping them keeps the curve well formed and the mistake visible as an
 * implausibly rushed tour rather than a crash.
 */
const MAX_DWELL_FRACTION = 0.75;

/**
 * A monotonic, invertible distance–time curve for one flight.
 *
 * Built once per flight and then queried thousands of times by the scheduler, so it is
 * precomputed into a lookup table rather than integrated on every call.
 */
export class RouteProfile {
  private readonly times: Float64Array;
  private readonly distances: Float64Array;
  private readonly phases: readonly PhaseSpec[];

  /**
   * Stops in distance order, each carrying the wall-clock moment the traveller reaches it.
   *
   * The distance–time table above is a *moving* clock: it knows nothing about standing
   * still. These convert between it and the wall clock the rest of the engine speaks.
   */
  private readonly stops: readonly { distanceKm: number; startS: number; seconds: number }[];

  /** Duration with the stops taken out — the span the speed curve is integrated over. */
  private readonly movingS: number;

  readonly durationS: number;
  readonly totalKm: number;
  readonly mode: TravelMode;

  constructor(
    durationS: number,
    totalKm: number,
    mode: TravelMode = "flight",
    options: ProfileOptions = {},
  ) {
    if (durationS <= 0) throw new Error("Route duration must be positive");
    if (totalKm <= 0) throw new Error("Route distance must be positive");

    this.durationS = durationS;
    this.totalKm = totalKm;
    this.mode = mode;

    // Stops come out of the duration, so a route whose dwells exceed its duration would
    // leave no time to travel at all. Scale them down together rather than rejecting the
    // route: the author's intent — mostly standing, briefly walking — is still legible,
    // and a hard error here would be a content bug surfacing as a crash at playback.
    const requested = (options.stops ?? [])
      .filter((stop) => stop.seconds > 0 && stop.distanceKm >= 0 && stop.distanceKm <= totalKm)
      .slice()
      .sort((a, b) => a.distanceKm - b.distanceKm);
    const requestedDwell = requested.reduce((sum, stop) => sum + stop.seconds, 0);
    const dwellBudget = durationS * MAX_DWELL_FRACTION;
    const dwellScale = requestedDwell > dwellBudget ? dwellBudget / requestedDwell : 1;

    this.movingS = durationS - requestedDwell * dwellScale;
    this.phases = buildPhases(this.movingS, mode, options);

    this.times = new Float64Array(SAMPLES + 1);
    this.distances = new Float64Array(SAMPLES + 1);

    // Integrate the speed profile, then normalise so the curve ends at exactly totalKm.
    const step = this.movingS / SAMPLES;
    let accumulated = 0;
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i * step;
      if (i > 0) {
        const midpoint = t - step / 2;
        accumulated += this.speedFactorAt(midpoint) * step;
      }
      this.times[i] = t;
      this.distances[i] = accumulated;
    }

    const scale = accumulated === 0 ? 0 : totalKm / accumulated;
    for (let i = 0; i <= SAMPLES; i++) {
      this.distances[i] = this.distances[i]! * scale;
    }

    // Now that the moving curve exists, each stop can be placed on the wall clock: the
    // moving time at which the traveller reaches it, plus every earlier stop's dwell.
    let elapsedDwell = 0;
    this.stops = requested.map((stop) => {
      const seconds = stop.seconds * dwellScale;
      const startS = this.movingTimeAtDistance(stop.distanceKm) + elapsedDwell;
      elapsedDwell += seconds;
      return { distanceKm: stop.distanceKm, startS, seconds };
    });
  }

  static forRoute(route: Route, geometry: RouteGeometry, options?: ProfileOptions) {
    return new RouteProfile(route.durationS, geometry.totalKm, route.mode, {
      ...options,
      stops: options?.stops ?? stopsFromWaypoints(route, geometry),
    });
  }

  /** Speed at time `t`, as a fraction of full travelling speed. */
  private speedFactorAt(t: number): number {
    let elapsed = 0;
    for (const phase of this.phases) {
      if (t < elapsed + phase.seconds) {
        const within = phase.seconds === 0 ? 0 : (t - elapsed) / phase.seconds;
        return phase.from + (phase.to - phase.from) * within;
      }
      elapsed += phase.seconds;
    }
    return this.phases[this.phases.length - 1]!.to;
  }

  /** Distance travelled, in km, `t` seconds after departure. */
  distanceAtTime(t: number): number {
    if (t <= 0) return 0;
    if (t >= this.durationS) return this.totalKm;
    return this.movingDistanceAtTime(this.movingTimeAt(t));
  }

  /**
   * Wall-clock `t` on the moving clock the distance table is indexed by.
   *
   * Time spent standing at a stop does not advance the table, so it is subtracted; a `t`
   * that lands inside a stop returns that stop's arrival time, since the traveller has
   * not moved since.
   */
  private movingTimeAt(t: number): number {
    let dwell = 0;
    for (const stop of this.stops) {
      if (t >= stop.startS + stop.seconds) {
        dwell += stop.seconds;
        continue;
      }
      if (t > stop.startS) return stop.startS - dwell;
      break;
    }
    return t - dwell;
  }

  private movingDistanceAtTime(mt: number): number {
    if (mt <= 0) return 0;
    if (mt >= this.movingS) return this.totalKm;
    const exact = (mt / this.movingS) * SAMPLES;
    const lo = Math.floor(exact);
    const hi = Math.min(lo + 1, SAMPLES);
    const fraction = exact - lo;
    return this.distances[lo]! + (this.distances[hi]! - this.distances[lo]!) * fraction;
  }

  /**
   * Seconds after departure at which the traveller reaches `km` along the route.
   *
   * At a stop this is the moment of *arrival*, not of departure: standing at a place is
   * time spent being able to hear about it, so the echo anchored there should be free to
   * play anywhere in that span rather than only once the traveller is leaving.
   */
  timeAtDistance(km: number): number {
    let dwell = 0;
    for (const stop of this.stops) {
      if (stop.distanceKm < km) dwell += stop.seconds;
      else break;
    }
    return this.movingTimeAtDistance(km) + dwell;
  }

  private movingTimeAtDistance(km: number): number {
    if (km <= 0) return 0;
    if (km >= this.totalKm) return this.movingS;

    let lo = 0;
    let hi = SAMPLES;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.distances[mid]! <= km) lo = mid;
      else hi = mid;
    }

    const span = this.distances[hi]! - this.distances[lo]!;
    const fraction = span === 0 ? 0 : (km - this.distances[lo]!) / span;
    return this.times[lo]! + (this.times[hi]! - this.times[lo]!) * fraction;
  }

  phaseAtTime(t: number): RoutePhase {
    if (t >= this.durationS) return "arrived";
    // Phases are lengths on the moving clock, so a traveller standing at a stop stays in
    // whatever phase they arrived in rather than drifting through the rest of the route.
    t = this.movingTimeAt(t);
    let elapsed = 0;
    for (const phase of this.phases) {
      elapsed += phase.seconds;
      if (t < elapsed) return phase.phase;
    }
    return "arrived";
  }

  /**
   * The window during which echoes may play: once the route has actually begun, and
   * before it is winding down. On a flight that means after the climb and before the
   * descent announcement. On a walking tour it is a handful of seconds at each end.
   *
   * The tail then reopens by the mode's destination dwell, which is the one place the
   * window has to outlast the route. An echo about the final stop is anchored at the
   * moment the listener is nearest it — the very end — so it needs room beyond that, and
   * a window closing on arrival gives it none. For carried modes the dwell is zero and
   * nothing changes; on foot it is the difference between the walk's destination having
   * an echo and being the one place that cannot.
   */
  listeningWindow(): { startS: number; endS: number } {
    const idle = this.phases[0]!.seconds;
    const settling = this.phases[1]!.seconds;
    const arriving = this.phases[3]!.seconds;
    const finishing = this.phases[4]!.seconds;
    const dwell = presetFor(this.mode).destinationDwellS;
    return {
      startS: idle + settling * 0.6,
      endS: Math.max(0, this.durationS - arriving * 0.5 - finishing + dwell),
    };
  }
}

/**
 * The stops a route declares, as distances along its densified geometry.
 *
 * The first waypoint is skipped whatever it declares: dwelling at the origin is time
 * before the route begins, and the listening window already accounts for it.
 */
function stopsFromWaypoints(route: Route, geometry: RouteGeometry): readonly RouteStop[] {
  const stops: RouteStop[] = [];
  for (let i = 1; i < route.waypoints.length; i++) {
    const seconds = route.waypoints[i]!.dwellS ?? 0;
    if (seconds <= 0) continue;
    const index = geometry.waypointIndex[i];
    if (index === undefined) continue;
    stops.push({ distanceKm: geometry.cumulativeKm[index]!, seconds });
  }
  return stops;
}

function buildPhases(
  durationS: number,
  mode: TravelMode,
  options: ProfileOptions,
): PhaseSpec[] {
  const preset = presetFor(mode);

  const wanted = {
    idleS: options.idleS ?? preset.idleS,
    settlingS: options.settlingS ?? preset.settlingS,
    arrivingS: options.arrivingS ?? preset.arrivingS,
    // The tail is shorter than the head: taxiing to a gate is quicker than pushback and
    // the queue for the runway.
    finishingS: options.finishingS ?? preset.idleS * 0.5,
  };

  // A short route cannot afford the full stage lengths, so scale them down together
  // until at least a fifth of it is spent actually travelling. Without this a
  // twenty-minute hop would be entirely climb and descent, and the listening window
  // would collapse to nothing.
  const requested = wanted.idleS + wanted.settlingS + wanted.arrivingS + wanted.finishingS;
  const shrink = requested > durationS * 0.8 ? (durationS * 0.8) / requested : 1;

  const idleS = wanted.idleS * shrink;
  const settlingS = wanted.settlingS * shrink;
  const arrivingS = wanted.arrivingS * shrink;
  const finishingS = wanted.finishingS * shrink;
  const underwayS = Math.max(0, durationS - idleS - settlingS - arrivingS - finishingS);

  return [
    { phase: "not-started", seconds: idleS, from: IDLE_FACTOR, to: 0.05 },
    { phase: "settling", seconds: settlingS, from: INITIAL_FACTOR, to: 1 },
    { phase: "underway", seconds: underwayS, from: 1, to: 1 },
    { phase: "arriving", seconds: arrivingS, from: 1, to: INITIAL_FACTOR },
    { phase: "arrived", seconds: finishingS, from: 0.05, to: IDLE_FACTOR },
  ];
}

/** Dead-reckoned position `t` seconds after departure. The floor of ADR-0002. */
export function positionAtTime(
  geometry: RouteGeometry,
  profile: RouteProfile,
  t: number,
  departureEpochMs: number,
): Position {
  const km = profile.distanceAtTime(t);
  const at = pointAtDistance(geometry, km);

  // Heading from a short look-ahead, which also handles the final point gracefully.
  const ahead = pointAtDistance(geometry, Math.min(km + 1, profile.totalKm));
  const headingDeg = km >= profile.totalKm ? 0 : bearingDeg(at, ahead);

  return {
    at,
    headingDeg,
    timestamp: departureEpochMs + t * 1000,
    source: "dead-reckoned",
  };
}
