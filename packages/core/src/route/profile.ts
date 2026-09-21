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

/** Overrides for the stage lengths the mode preset would otherwise supply. */
export interface ProfileOptions {
  readonly idleS?: number;
  readonly settlingS?: number;
  readonly arrivingS?: number;
  readonly finishingS?: number;
}

const SAMPLES = 2000;

/** Speed while idling, as a fraction of travelling speed. Not zero: taxiing is movement. */
const IDLE_FACTOR = 0.02;

/** Speed at the moment acceleration begins. */
const INITIAL_FACTOR = 0.35;

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
    this.phases = buildPhases(durationS, mode, options);

    this.times = new Float64Array(SAMPLES + 1);
    this.distances = new Float64Array(SAMPLES + 1);

    // Integrate the speed profile, then normalise so the curve ends at exactly totalKm.
    const step = durationS / SAMPLES;
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
  }

  static forRoute(route: Route, geometry: RouteGeometry, options?: ProfileOptions) {
    return new RouteProfile(route.durationS, geometry.totalKm, route.mode, options);
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

  /** Distance flown, in km, `t` seconds after departure. */
  distanceAtTime(t: number): number {
    if (t <= 0) return 0;
    if (t >= this.durationS) return this.totalKm;
    const exact = (t / this.durationS) * SAMPLES;
    const lo = Math.floor(exact);
    const hi = Math.min(lo + 1, SAMPLES);
    const fraction = exact - lo;
    return this.distances[lo]! + (this.distances[hi]! - this.distances[lo]!) * fraction;
  }

  /** Seconds after departure at which the aircraft reaches `km` along the route. */
  timeAtDistance(km: number): number {
    if (km <= 0) return 0;
    if (km >= this.totalKm) return this.durationS;

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
   */
  listeningWindow(): { startS: number; endS: number } {
    const idle = this.phases[0]!.seconds;
    const settling = this.phases[1]!.seconds;
    const arriving = this.phases[3]!.seconds;
    const finishing = this.phases[4]!.seconds;
    return {
      startS: idle + settling * 0.6,
      endS: Math.max(0, this.durationS - arriving * 0.5 - finishing),
    };
  }
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
