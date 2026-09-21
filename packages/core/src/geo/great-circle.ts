/**
 * Spherical geometry on the WGS-84 mean radius.
 *
 * A sphere is not the Earth, but for our purposes it is close enough: the error over a
 * transcontinental leg is a few kilometres, and our trigger radii are tens of kilometres
 * precisely because position is approximate to begin with (ADR-0002). Ellipsoidal maths
 * would add cost and complexity to buy accuracy the product cannot use.
 */

import type { LatLng } from "../types.js";

export const EARTH_RADIUS_KM = 6371.0088;

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

/** Clamp into [-1, 1] before asin/acos, where float drift otherwise yields NaN. */
const clampUnit = (x: number): number => (x < -1 ? -1 : x > 1 ? 1 : x);

/** Great-circle distance between two points, in kilometres. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const phi1 = toRad(a.lat);
  const phi2 = toRad(b.lat);
  const dPhi = toRad(b.lat - a.lat);
  const dLambda = toRad(b.lng - a.lng);

  const h =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(clampUnit(h)));
}

/** Initial bearing from `a` to `b`, in degrees clockwise from north (0–360). */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const phi1 = toRad(a.lat);
  const phi2 = toRad(b.lat);
  const dLambda = toRad(b.lng - a.lng);

  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Point at `fraction` of the way along the great circle from `a` to `b`.
 * Spherical linear interpolation, so the path bows polewards exactly as a real
 * flight track does — a straight line on a Mercator map is not the route flown.
 */
export function interpolate(a: LatLng, b: LatLng, fraction: number): LatLng {
  const d = distanceKm(a, b) / EARTH_RADIUS_KM;
  if (d === 0) return a;

  const sinD = Math.sin(d);
  const A = Math.sin((1 - fraction) * d) / sinD;
  const B = Math.sin(fraction * d) / sinD;

  const phi1 = toRad(a.lat);
  const lambda1 = toRad(a.lng);
  const phi2 = toRad(b.lat);
  const lambda2 = toRad(b.lng);

  const x = A * Math.cos(phi1) * Math.cos(lambda1) + B * Math.cos(phi2) * Math.cos(lambda2);
  const y = A * Math.cos(phi1) * Math.sin(lambda1) + B * Math.cos(phi2) * Math.sin(lambda2);
  const z = A * Math.sin(phi1) + B * Math.sin(phi2);

  return {
    lat: toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))),
    lng: toDeg(Math.atan2(y, x)),
  };
}

/** Where a point sits relative to one great-circle segment. */
export interface SegmentProjection {
  /** Perpendicular distance from the segment's great circle, km. Always positive. */
  readonly crossTrackKm: number;
  /** Distance from the segment start to the nearest point, km, clamped to the segment. */
  readonly alongTrackKm: number;
  /** Fraction along the segment of the nearest point, 0–1. */
  readonly fraction: number;
}

/**
 * Project `point` onto the great-circle segment `start`→`end`.
 *
 * Clamped to the segment: an echo beyond either end measures to that endpoint rather than
 * to an imaginary extension of the track, which is what stops an echo in Maine matching a
 * flight down the Florida coast.
 */
export function projectOntoSegment(
  start: LatLng,
  end: LatLng,
  point: LatLng,
): SegmentProjection {
  const segmentKm = distanceKm(start, end);
  if (segmentKm === 0) {
    return { crossTrackKm: distanceKm(start, point), alongTrackKm: 0, fraction: 0 };
  }

  const d13 = distanceKm(start, point) / EARTH_RADIUS_KM;
  const theta13 = toRad(bearingDeg(start, point));
  const theta12 = toRad(bearingDeg(start, end));

  const crossTrackRad = Math.asin(clampUnit(Math.sin(d13) * Math.sin(theta13 - theta12)));
  const cosCross = Math.cos(crossTrackRad);
  const alongTrackRad =
    cosCross === 0 ? 0 : Math.acos(clampUnit(Math.cos(d13) / cosCross));

  // acos loses the sign, so recover it: an along-track angle beyond a quarter turn from
  // the heading means the point lies behind the segment start.
  const signedAlongKm =
    Math.abs(theta13 - theta12) > Math.PI / 2 && Math.abs(theta13 - theta12) < (3 * Math.PI) / 2
      ? -alongTrackRad * EARTH_RADIUS_KM
      : alongTrackRad * EARTH_RADIUS_KM;

  if (signedAlongKm <= 0) {
    return { crossTrackKm: distanceKm(start, point), alongTrackKm: 0, fraction: 0 };
  }
  if (signedAlongKm >= segmentKm) {
    return {
      crossTrackKm: distanceKm(end, point),
      alongTrackKm: segmentKm,
      fraction: 1,
    };
  }

  return {
    crossTrackKm: Math.abs(crossTrackRad) * EARTH_RADIUS_KM,
    alongTrackKm: signedAlongKm,
    fraction: signedAlongKm / segmentKm,
  };
}

/** A bounding box, for cheap pre-filtering before the expensive spherical maths. */
export interface BoundingBox {
  readonly minLat: number;
  readonly maxLat: number;
  readonly minLng: number;
  readonly maxLng: number;
}

/** Bounding box containing every point within `paddingKm` of any of `points`. */
export function boundingBox(points: readonly LatLng[], paddingKm = 0): BoundingBox {
  if (points.length === 0) {
    throw new Error("boundingBox requires at least one point");
  }

  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;

  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }

  const latPad = (paddingKm / EARTH_RADIUS_KM) * (180 / Math.PI);
  // A degree of longitude shrinks towards the poles, so pad using the widest latitude the
  // box reaches. cos() is clamped to avoid an unbounded pad at the poles.
  const widestLat = Math.max(Math.abs(minLat), Math.abs(maxLat));
  const lngScale = Math.max(Math.cos(toRad(widestLat)), 0.01);
  const lngPad = latPad / lngScale;

  return {
    minLat: Math.max(minLat - latPad, -90),
    maxLat: Math.min(maxLat + latPad, 90),
    minLng: minLng - lngPad,
    maxLng: maxLng + lngPad,
  };
}

export function inBoundingBox(box: BoundingBox, p: LatLng): boolean {
  return (
    p.lat >= box.minLat && p.lat <= box.maxLat && p.lng >= box.minLng && p.lng <= box.maxLng
  );
}
