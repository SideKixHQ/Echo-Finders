/**
 * The mapping between "how far along the route" and "how many seconds since departure".
 *
 * A constant-speed model is badly wrong at exactly the moments that matter. Ten minutes
 * after a JFK departure the aircraft has barely cleared Jamaica Bay, but constant speed
 * would place it over Philadelphia and cue a story about the wrong city. Modelling taxi,
 * climb and descent explicitly costs very little and fixes the first and last half hour of
 * every flight — which is also the half hour with the densest, most recognisable content.
 */

import type { FlightPhase, FlightPlan, Position } from "../types.js";
import { pointAtDistance, type RouteGeometry } from "../geo/corridor.js";
import { bearingDeg } from "../geo/great-circle.js";

/** Relative ground speed through each phase. Absolute values are derived, not assumed. */
interface PhaseSpec {
  readonly phase: FlightPhase;
  readonly seconds: number;
  /** Ground speed at the start and end of the phase, as a fraction of cruise speed. */
  readonly from: number;
  readonly to: number;
}

export interface ProfileOptions {
  readonly taxiOutS?: number;
  readonly climbS?: number;
  readonly descentS?: number;
  readonly taxiInS?: number;
}

const DEFAULTS = {
  taxiOutS: 600,
  climbS: 900,
  descentS: 1200,
  taxiInS: 300,
} as const;

const SAMPLES = 2000;

/**
 * A monotonic, invertible distance–time curve for one flight.
 *
 * Built once per flight and then queried thousands of times by the scheduler, so it is
 * precomputed into a lookup table rather than integrated on every call.
 */
export class FlightProfile {
  private readonly times: Float64Array;
  private readonly distances: Float64Array;
  private readonly phases: readonly PhaseSpec[];

  readonly durationS: number;
  readonly totalKm: number;

  constructor(durationS: number, totalKm: number, options: ProfileOptions = {}) {
    if (durationS <= 0) throw new Error("Flight duration must be positive");
    if (totalKm <= 0) throw new Error("Route distance must be positive");

    this.durationS = durationS;
    this.totalKm = totalKm;
    this.phases = buildPhases(durationS, options);

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

  static forPlan(plan: FlightPlan, geometry: RouteGeometry, options?: ProfileOptions) {
    return new FlightProfile(plan.durationS, geometry.totalKm, options);
  }

  /** Ground speed at time `t`, as a fraction of cruise speed. */
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

  phaseAtTime(t: number): FlightPhase {
    if (t >= this.durationS) return "arrived";
    let elapsed = 0;
    for (const phase of this.phases) {
      elapsed += phase.seconds;
      if (t < elapsed) return phase.phase;
    }
    return "arrived";
  }

  /**
   * The window during which stories may play: after the cabin has settled in the climb,
   * and before the descent announcement. Nobody wants a narrator during the safety brief.
   */
  listeningWindow(): { startS: number; endS: number } {
    const taxiOut = this.phases[0]!.seconds;
    const climb = this.phases[1]!.seconds;
    const descent = this.phases[3]!.seconds;
    return {
      startS: taxiOut + climb * 0.6,
      endS: Math.max(0, this.durationS - descent * 0.5 - this.phases[4]!.seconds),
    };
  }
}

function buildPhases(durationS: number, options: ProfileOptions): PhaseSpec[] {
  // Short hops cannot afford the full default climb and descent, so scale the fixed
  // phases down proportionally until at least a fifth of the flight remains for cruise.
  const requested =
    (options.taxiOutS ?? DEFAULTS.taxiOutS) +
    (options.climbS ?? DEFAULTS.climbS) +
    (options.descentS ?? DEFAULTS.descentS) +
    (options.taxiInS ?? DEFAULTS.taxiInS);

  const shrink = requested > durationS * 0.8 ? (durationS * 0.8) / requested : 1;

  const taxiOutS = (options.taxiOutS ?? DEFAULTS.taxiOutS) * shrink;
  const climbS = (options.climbS ?? DEFAULTS.climbS) * shrink;
  const descentS = (options.descentS ?? DEFAULTS.descentS) * shrink;
  const taxiInS = (options.taxiInS ?? DEFAULTS.taxiInS) * shrink;
  const cruiseS = Math.max(0, durationS - taxiOutS - climbS - descentS - taxiInS);

  return [
    { phase: "pre-departure", seconds: taxiOutS, from: 0.02, to: 0.05 },
    { phase: "climb", seconds: climbS, from: 0.35, to: 1 },
    { phase: "cruise", seconds: cruiseS, from: 1, to: 1 },
    { phase: "descent", seconds: descentS, from: 1, to: 0.35 },
    { phase: "arrived", seconds: taxiInS, from: 0.05, to: 0.02 },
  ];
}

/** Dead-reckoned position `t` seconds after departure. The floor of ADR-0002. */
export function positionAtTime(
  geometry: RouteGeometry,
  profile: FlightProfile,
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
