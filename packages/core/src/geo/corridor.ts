/**
 * Turning a flight plan into a searchable corridor.
 *
 * Every question the ranking engine asks reduces to two numbers per story: how far off
 * the track it sits, and how far along the track you meet it. This module computes both.
 */

import type { FlightPlan, LatLng, Story } from "../types.js";
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
  readonly totalKm: number;
}

/**
 * Expand a flight plan's waypoints into a densified great-circle polyline.
 *
 * Densification matters: two waypoints 2,000km apart are joined by a great circle that
 * bows hundreds of kilometres away from the straight line between them, and a story sitting
 * under that bow would otherwise be missed entirely.
 */
export function buildRouteGeometry(plan: FlightPlan, segmentKm = 25): RouteGeometry {
  const waypoints = plan.waypoints;
  if (waypoints.length < 2) {
    throw new Error(`Flight plan ${plan.id} needs at least two waypoints`);
  }

  const points: LatLng[] = [waypoints[0]!.at];
  const cumulativeKm: number[] = [0];
  let running = 0;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i]!.at;
    const to = waypoints[i + 1]!.at;
    const legKm = distanceKm(from, to);
    const steps = Math.max(1, Math.ceil(legKm / segmentKm));

    for (let s = 1; s <= steps; s++) {
      const point = s === steps ? to : interpolate(from, to, s / steps);
      const previous = points[points.length - 1]!;
      running += distanceKm(previous, point);
      points.push(point);
      cumulativeKm.push(running);
    }
  }

  return { points, cumulativeKm, totalKm: running };
}

/** Where a story sits relative to the whole route. */
export interface CorridorHit {
  readonly story: Story;
  /** Perpendicular distance from the track, km. */
  readonly crossTrackKm: number;
  /** Distance from the origin at which the aircraft is nearest this story, km. */
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
   * Corridor half-width in km. A story is only considered if it falls inside this AND
   * inside its own trigger radius, so a route can be narrowed without editing content.
   */
  readonly maxCrossTrackKm?: number;
  /** Densification step for the route polyline. */
  readonly segmentKm?: number;
}

const DEFAULT_MAX_CROSS_TRACK_KM = 80;

/**
 * Find every story the flight passes near, with its position along the route.
 *
 * Results are sorted by along-track distance, which is the order the aircraft meets them
 * and therefore the natural order for everything downstream.
 */
export function findStoriesAlongRoute(
  plan: FlightPlan,
  stories: readonly Story[],
  options: CorridorOptions = {},
): CorridorHit[] {
  const maxCrossTrackKm = options.maxCrossTrackKm ?? DEFAULT_MAX_CROSS_TRACK_KM;
  const geometry = buildRouteGeometry(plan, options.segmentKm);

  // Cheap rejection first. A continental route against a global library would otherwise
  // run the spherical projection tens of thousands of times for nothing.
  const box = corridorBoundingBox(geometry, maxCrossTrackKm);

  const hits: CorridorHit[] = [];
  for (const story of stories) {
    if (!inBoundingBox(box, story.at)) continue;

    const projection = projectOntoRoute(geometry, story.at);
    const limit = Math.min(maxCrossTrackKm, story.triggerRadiusKm);
    if (projection.crossTrackKm > limit) continue;

    hits.push({ story, ...projection });
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
