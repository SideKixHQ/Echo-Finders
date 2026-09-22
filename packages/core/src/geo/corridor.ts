/**
 * Turning a flight plan into a searchable corridor.
 *
 * Every question the ranking engine asks reduces to two numbers per echo: how far off
 * the track it sits, and how far along the track you meet it. This module computes both.
 */

import type { Route, LatLng, Echo } from "../types.js";
import { presetFor } from "../modes.js";
import { effectiveRadiusKm } from "../content/contributions.js";
import {
  boundingBox,
  distanceKm,
  inBoundingBox,
  interpolate,
  projectOntoSegment,
  type BoundingBox,
} from "./great-circle.js";

/** The flight path expanded into a polyline with cumulative distances. */
export interface RouteGeometry {
  readonly points: readonly LatLng[];
  /** `cumulativeKm[i]` is the distance from the origin to `points[i]`. */
  readonly cumulativeKm: readonly number[];
  /**
   * `waypointIndex[i]` is the index in `points` of the route's i-th waypoint.
   *
   * Densification inserts points between waypoints, so a waypoint's position in `points`
   * is not its position in `Route.waypoints`. Anything that needs a waypoint's distance
   * along the route — a stop's dwell, in practice — has to come back through here rather
   * than re-summing the legs, which would disagree with the densified total.
   */
  readonly waypointIndex: readonly number[];
  readonly totalKm: number;
}

/**
 * Expand a flight plan's waypoints into a densified great-circle polyline.
 *
 * Densification matters: two waypoints 2,000km apart are joined by a great circle that
 * bows hundreds of kilometres away from the straight line between them, and an echo sitting
 * under that bow would otherwise be missed entirely.
 */
/**
 * Polyline resolution for a mode.
 *
 * Densification exists to stop the polyline cutting across a great-circle bow, and the
 * error it corrects is quadratic in step length: a 25km step deviates from the true arc by
 * about twelve metres, which is negligible against an 80km flight corridor. So the step is
 * capped at 25km however wide the corridor is — going finer buys nothing and made the flight
 * geometry six times larger for no gain.
 *
 * Ground modes get a proportionally finer step, mostly so the drawn route on the map follows
 * the street rather than chording across a bend.
 */
export function defaultSegmentKm(route: Route): number {
  return Math.min(25, Math.max(0.05, presetFor(route.mode).corridorKm / 2));
}

export function buildRouteGeometry(plan: Route, segmentKm?: number): RouteGeometry {
  const step = segmentKm ?? defaultSegmentKm(plan);
  const waypoints = plan.waypoints;
  if (waypoints.length < 2) {
    throw new Error(`Route ${plan.id} needs at least two waypoints`);
  }

  const points: LatLng[] = [waypoints[0]!.at];
  const cumulativeKm: number[] = [0];
  const waypointIndex: number[] = [0];
  let running = 0;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i]!.at;
    const to = waypoints[i + 1]!.at;
    const legKm = distanceKm(from, to);
    const steps = Math.max(1, Math.ceil(legKm / step));

    for (let s = 1; s <= steps; s++) {
      const point = s === steps ? to : interpolate(from, to, s / steps);
      const previous = points[points.length - 1]!;
      running += distanceKm(previous, point);
      points.push(point);
      cumulativeKm.push(running);
    }
    waypointIndex.push(points.length - 1);
  }

  return { points, cumulativeKm, waypointIndex, totalKm: running };
}

/** Where an echo sits relative to the whole route. */
export interface CorridorHit {
  readonly echo: Echo;
  /** Perpendicular distance from the track, km. */
  readonly crossTrackKm: number;
  /** Distance from the origin at which the aircraft is nearest this echo, km. */
  readonly alongTrackKm: number;
  /** The nearest point on the track itself — where the map pin's leader line lands. */
  readonly nearestPoint: LatLng;
}

/** Project one point onto the route, returning the nearest position along it. */
export function projectOntoRoute(
  geometry: RouteGeometry,
  point: LatLng,
): { crossTrackKm: number; alongTrackKm: number; nearestPoint: LatLng } {
  let best = {
    crossTrackKm: Number.POSITIVE_INFINITY,
    alongTrackKm: 0,
    nearestPoint: geometry.points[0]!,
  };

  for (let i = 0; i < geometry.points.length - 1; i++) {
    const start = geometry.points[i]!;
    const end = geometry.points[i + 1]!;
    const projection = projectOntoSegment(start, end, point);

    if (projection.crossTrackKm < best.crossTrackKm) {
      best = {
        crossTrackKm: projection.crossTrackKm,
        alongTrackKm: geometry.cumulativeKm[i]! + projection.alongTrackKm,
        nearestPoint: interpolate(start, end, projection.fraction),
      };
    }
  }

  return best;
}

export interface CorridorOptions {
  /**
   * Corridor half-width in km. An echo is only considered if it falls inside this AND
   * inside its own trigger radius, so a route can be narrowed without editing content.
   */
  readonly maxCrossTrackKm?: number;
  /** Densification step for the route polyline. Defaults per mode; see `defaultSegmentKm`. */
  readonly segmentKm?: number;
}



/**
 * Find every echo the flight passes near, with its position along the route.
 *
 * Results are sorted by along-track distance, which is the order the aircraft meets them
 * and therefore the natural order for everything downstream.
 */
export function findEchoesAlongRoute(
  plan: Route,
  echoes: readonly Echo[],
  options: CorridorOptions = {},
): CorridorHit[] {
  const preset = presetFor(plan.mode);
  const maxCrossTrackKm = options.maxCrossTrackKm ?? preset.corridorKm;
  const geometry = buildRouteGeometry(plan, options.segmentKm);

  // Cheap rejection first. A continental route against a global library would otherwise
  // run the spherical projection tens of thousands of times for nothing.
  const box = corridorBoundingBox(geometry, maxCrossTrackKm);

  const hits: CorridorHit[] = [];
  for (const echo of echoes) {
    if (!inBoundingBox(box, echo.point.at)) continue;

    const projection = projectOntoRoute(geometry, echo.point.at);
    // Contributed echoes carry only as far as their contributor has earned.
    const limit = Math.min(maxCrossTrackKm, effectiveRadiusKm(echo));
    if (projection.crossTrackKm > limit) continue;

    hits.push({ echo, ...projection });
  }

  hits.sort((a, b) => a.alongTrackKm - b.alongTrackKm);
  return hits;
}

/** Bounding box covering the corridor, for pre-filtering and for map viewport fitting. */
export function corridorBoundingBox(
  geometry: RouteGeometry,
  paddingKm: number,
): BoundingBox {
  return boundingBox(geometry.points, paddingKm);
}

/** Point on the route at a given distance from the origin. */
export function pointAtDistance(geometry: RouteGeometry, km: number): LatLng {
  const { points, cumulativeKm, totalKm } = geometry;
  if (km <= 0) return points[0]!;
  if (km >= totalKm) return points[points.length - 1]!;

  // Binary search for the segment containing `km`.
  let lo = 0;
  let hi = cumulativeKm.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cumulativeKm[mid]! <= km) lo = mid;
    else hi = mid;
  }

  const segmentKm = cumulativeKm[hi]! - cumulativeKm[lo]!;
  const fraction = segmentKm === 0 ? 0 : (km - cumulativeKm[lo]!) / segmentKm;
  return interpolate(points[lo]!, points[hi]!, fraction);
}
