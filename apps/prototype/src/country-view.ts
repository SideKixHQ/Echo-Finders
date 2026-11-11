/**
 * The country view: where "Show me where they are" goes when the app has no location.
 *
 * It used to open on the busiest place in the library, which was always Wilmington, so
 * everybody without a location landed in North Carolina (James, 2026-11-11: use the
 * country view instead). Now it opens zoomed out on the continental United States, every
 * echo grouped into a numbered dot per town, and a tap on a town goes in.
 *
 * The library runs from San Francisco to Edinburgh, which no phone map can draw at a scale
 * worth reading, so the frame is the echoes inside the continental US only. The rest are
 * not lost: they are still on the map, a search or a drag away.
 */

import type { LatLng } from "@echofinders/core";

/** A box on the map, in degrees. */
export interface Bounds {
  readonly south: number;
  readonly west: number;
  readonly north: number;
  readonly east: number;
}

/**
 * The lower 48 states, a little generous at the edges: Key West to the Canadian border,
 * Cape Flattery to West Quoddy Head. Alaska, Hawaii and anything abroad fall outside, which
 * is the point.
 */
export const CONTINENTAL_US: Bounds = { south: 24.3, west: -125.0, north: 49.5, east: -66.8 };

export const inContinentalUS = (at: LatLng): boolean =>
  at.lat >= CONTINENTAL_US.south &&
  at.lat <= CONTINENTAL_US.north &&
  at.lng >= CONTINENTAL_US.west &&
  at.lng <= CONTINENTAL_US.east;

/**
 * What the country view frames: the box round the given points that are in the continental
 * US, or the whole of it when none are.
 */
export function countryFrame(points: readonly LatLng[]): Bounds {
  const inside = points.filter(inContinentalUS);
  if (inside.length === 0) return CONTINENTAL_US;
  return {
    south: Math.min(...inside.map((p) => p.lat)),
    west: Math.min(...inside.map((p) => p.lng)),
    north: Math.max(...inside.map((p) => p.lat)),
    east: Math.max(...inside.map((p) => p.lng)),
  };
}
