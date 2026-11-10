/**
 * A guided walk, walked: where the position comes from, which stop is next, how far along.
 *
 * Guided walks ran on `SimulatedJourney`. Starting "Old Wilmington" while standing at
 * St. James moved the you-are-here dot to the river and synced the riverwalk's echo within
 * seconds, to somebody who had not taken a step (found in review, 2026-11-10). That breaks
 * the one rule the product is built on: an echo unlocks only where it happened.
 *
 * So a route you steer yourself follows the phone, and the simulation is kept for what it
 * was made for: a flight, where the aircraft knows where it is and the handset does not
 * (ADR-0002), and a demo somebody asked for with `?simulate` on the address. Kept pure so
 * it can be tested without a browser.
 */

import { WALKABLE_KM } from "./going";
import {
  distanceKm,
  presetFor,
  projectOntoRoute,
  type LatLng,
  type Route,
  type RouteGeometry,
  type TravelMode,
  type Waypoint,
} from "@echofinders/core";

/**
 * Whether a route is played back by the simulation rather than by the phone's position.
 *
 * Carried modes (a flight) are simulated: there is no aircraft feed yet, and nothing a
 * passenger does moves the aircraft. A self directed route (on foot, driving) follows the
 * real position, unless the address asks for the demo with `?simulate`.
 */
export function simulatesRoute(mode: TravelMode, search: string): boolean {
  if (!presetFor(mode).selfDirected) return true;
  return new URLSearchParams(search).has("simulate");
}

/** How far from a stop its echo may stand and still be that stop's echo. */
export const STOP_REACH_KM = 0.12;

/**
 * Where a route stops: every waypoint it lingers at, and the end.
 *
 * The same count the trip menu gives ("8 echoes"), because a walk's stops are what it is
 * listed by.
 */
export function stopWaypoints(route: Route): readonly Waypoint[] {
  return route.waypoints.filter((w, i) => (w.dwellS ?? 0) > 0 || i === route.waypoints.length - 1);
}

/**
 * The stops of a guided walk, as echoes, in the order the walk reaches them, that are
 * still to sync.
 *
 * Each stop is the echo nearest it, if one stands within `STOP_REACH_KM`; a stop with no
 * echo of its own is walked past. Anything already synced is not a stop to walk to: it is
 * behind you, or it was found on another day.
 */
export function guidedStops(
  route: Route,
  echoes: readonly { readonly id: string; readonly at: LatLng }[],
  sealed: (id: string) => boolean,
): readonly string[] {
  const out: string[] = [];
  for (const stop of stopWaypoints(route)) {
    let best: { id: string; km: number } | null = null;
    for (const e of echoes) {
      if (out.includes(e.id)) continue;
      const km = distanceKm(stop.at, e.at);
      if (km <= STOP_REACH_KM && (!best || km < best.km)) best = { id: e.id, km };
    }
    if (best) out.push(best.id);
  }
  return out.filter(sealed);
}

/**
 * How far from its first stop a walk still offers to take you there, km.
 *
 * The same hour on foot as everywhere else that offers a walk (`going.ts`): a walk in
 * another town is something you look at, not "Walk to the start · 2 hr 7 min".
 */
export const GUIDE_FROM_KM = WALKABLE_KM;

/** Whether to point somebody standing at `from` towards a walk's first stop. */
export function guideFrom(from: LatLng, firstStop: LatLng): boolean {
  return distanceKm(from, firstStop) <= GUIDE_FROM_KM;
}

/**
 * How far along the route the walker is, km, from their real position.
 *
 * Zero until the walk has begun (the first stop reached), because "Walk to the start"
 * and a chip saying the walk is two thirds done cannot both be true. After that, the
 * nearest point on the route, while within the mode's corridor of it; off the route the
 * walk has not moved on, so it says how far it had got (`previousKm`).
 */
export function walkedKm(
  geometry: RouteGeometry,
  at: LatLng | null,
  mode: TravelMode,
  started: boolean,
  previousKm = 0,
): number {
  if (!started || !at) return started ? previousKm : 0;
  const hit = projectOntoRoute(geometry, at);
  if (hit.crossTrackKm > presetFor(mode).corridorKm) return previousKm;
  // Forward only: GPS wobble near a bend should not walk the chip backwards.
  return Math.max(previousKm, Math.min(geometry.totalKm, hit.alongTrackKm));
}

/** The first step of a guided walk, as the directions sheet says it. */
export function startLine(minutes: string): string {
  return `Walk to the start · ${minutes}`;
}
