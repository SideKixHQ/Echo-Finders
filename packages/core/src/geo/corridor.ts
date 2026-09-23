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
  EARTH_RADIUS_KM,
  boundingBox,
  distanceKm,
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

/**
 * Which route segments run near each cell of a coarse grid.
 *
 * A bounding box is the obvious cheap rejection and it fails on exactly the routes that
 * need it most. The box around a transcontinental flight is most of the United States, so
 * it rejects almost nothing: measured at 944ms for fifty thousand echoes on a server-class
 * CPU, several seconds on a phone. The same query for a walking route took 1.7ms, because
 * *there* the box is a few streets wide and throws away everything.
 *
 * Filtering alone was not enough, and the reason is worth recording. Cutting fifty thousand
 * projections down to two thousand only got to 519ms, because `projectOntoRoute` walks
 * *every* segment of the route for every echo it is given — and a flight has a hundred and
 * sixty. The work had moved rather than gone. So this returns the handful of segments worth
 * testing rather than a yes/no, which is the same lookup and turns the second factor into a
 * constant too.
 *
 * **The marking radius is the one piece of arithmetic that has to be right.** An echo within
 * `corridorKm` of segment PQ is within `corridorKm` of some point X on it, and X is at most
 * one segment-length from P — so only a radius of `corridorKm + maxSegmentKm` around each
 * route point is guaranteed to catch it. Marking `corridorKm` alone, as the first version of
 * this did, leaves a gap that test data can easily fail to find and a real route will not.
 *
 * It over-selects by about a cell, which is the right direction to be wrong in: everything
 * it returns still has to pass the real cross-track test.
 */
class CorridorIndex {
  private readonly cells = new Map<number, number[]>();
  private readonly cellDeg: number;

  constructor(geometry: RouteGeometry, corridorKm: number) {
    const points = geometry.points;

    // The true spacing, not the requested step: densification rounds up the number of
    // sub-segments, so actual segments are at most the step and usually shorter.
    let maxSegKm = 0;
    for (let i = 1; i < geometry.cumulativeKm.length; i++) {
      maxSegKm = Math.max(maxSegKm, geometry.cumulativeKm[i]! - geometry.cumulativeKm[i - 1]!);
    }
    const reachKm = corridorKm + maxSegKm;

    // One cell roughly one reach wide: selective enough to matter, coarse enough that each
    // point marks a handful of cells rather than a field of them.
    this.cellDeg = Math.max(0.0005, kmToLatDeg(Math.max(reachKm, 0.01)));
    const latReach = kmToLatDeg(reachKm);

    for (let i = 0; i < points.length; i++) {
      const point = points[i]!;
      // A degree of longitude shrinks towards the poles, so the same distance spans more of
      // them. Clamped, or a route near a pole would mark an entire parallel.
      const lngReach = latReach / Math.max(Math.cos(toRad(point.lat)), 0.01);
      const latSteps = Math.ceil(latReach / this.cellDeg);
      const lngSteps = Math.min(Math.ceil(lngReach / this.cellDeg), 64);
      const row = this.row(point.lat);
      const col = this.col(point.lng);

      // The segments this point is an end of. Both, except at the two ends of the route.
      for (let dr = -latSteps; dr <= latSteps; dr++) {
        for (let dc = -lngSteps; dc <= lngSteps; dc++) {
          const cell = key(row + dr, col + dc);
          let segments = this.cells.get(cell);
          if (!segments) this.cells.set(cell, (segments = []));
          if (i > 0 && segments[segments.length - 1] !== i - 1) segments.push(i - 1);
          if (i < points.length - 1) segments.push(i);
        }
      }
    }
  }

  /** Segments worth testing for an echo here, or null when it cannot be in the corridor. */
  segmentsNear(at: LatLng): readonly number[] | null {
    return this.cells.get(key(this.row(at.lat), this.col(at.lng))) ?? null;
  }

  private row(lat: number): number {
    return Math.floor((lat + 90) / this.cellDeg);
  }

  private col(lng: number): number {
    // Normalised first, so a route crossing the antimeridian lands in the same cells as the
    // echoes near it rather than in a column 720 degrees away.
    return Math.floor(((((lng + 180) % 360) + 360) % 360) / this.cellDeg);
  }
}

/** Pack a cell into one number. Safe well past the finest cell size above. */
const key = (row: number, col: number) => row * 8_000_000 + col;

const kmToLatDeg = (km: number) => (km / EARTH_RADIUS_KM) * (180 / Math.PI);
const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Project a point onto a named subset of a route's segments.
 *
 * `interpolate` is deliberately left until the end. Called on every improvement during the
 * scan it runs a slerp per candidate segment, and all but the last result is thrown away.
 */
function projectOntoSome(
  geometry: RouteGeometry,
  point: LatLng,
  segments: readonly number[],
): { crossTrackKm: number; alongTrackKm: number; nearestPoint: LatLng } {
  let bestCross = Number.POSITIVE_INFINITY;
  let bestAlong = 0;
  let bestAt = 0;
  let bestFraction = 0;

  for (const i of segments) {
    const start = geometry.points[i]!;
    const end = geometry.points[i + 1]!;
    const projection = projectOntoSegment(start, end, point);
    if (projection.crossTrackKm < bestCross) {
      bestCross = projection.crossTrackKm;
      bestAlong = geometry.cumulativeKm[i]! + projection.alongTrackKm;
      bestAt = i;
      bestFraction = projection.fraction;
    }
  }

  return {
    crossTrackKm: bestCross,
    alongTrackKm: bestAlong,
    nearestPoint: interpolate(geometry.points[bestAt]!, geometry.points[bestAt + 1]!, bestFraction),
  };
}

export function findEchoesAlongRoute(
  plan: Route,
  echoes: readonly Echo[],
  options: CorridorOptions = {},
): CorridorHit[] {
  const preset = presetFor(plan.mode);
  const maxCrossTrackKm = options.maxCrossTrackKm ?? preset.corridorKm;
  const geometry = buildRouteGeometry(plan, options.segmentKm);

  // Cheap rejection first. A continental route against a global library would otherwise
  // run the spherical projection tens of thousands of times for nothing — and a bounding
  // box does not save it, because the box around such a route is most of a continent. The
  // cell set follows the route's shape instead; see `CorridorCells`.
  const corridor = new CorridorIndex(geometry, maxCrossTrackKm);

  const hits: CorridorHit[] = [];
  for (const echo of echoes) {
    const segments = corridor.segmentsNear(echo.point.at);
    if (!segments) continue;

    const projection = projectOntoSome(geometry, echo.point.at, segments);
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
