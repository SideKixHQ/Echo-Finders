/**
 * Which country a point is in, from Natural Earth's outlines (James, 2026-11-13).
 *
 * Picking a topic fits that topic's echoes in the country the map is looking at, not every
 * echo in the library: in the US it fits the US ones, in England the UK ones. More
 * countries are coming, so nothing here knows any country by name. The outlines are
 * Natural Earth's 1:50m countries (public domain, via `world-atlas`, the same source the
 * map's borders are drawn from), written by `scripts/build-library.mjs` for the countries
 * the library has echoes in. England and Scotland are one country there, the United
 * Kingdom.
 *
 * 1:50m coastlines are about a kilometre apart and leave small islands and harbour edges
 * out: Bald Head Island is 8.9 km outside the US outline, Manhattan's west side is in the
 * Hudson. So a point outside every outline belongs to the nearest one within
 * `COUNTRY_REACH_KM`, and to none past that: the open sea, or a country with no echoes.
 */

import type { LatLng } from "../types.js";

/** One country: its name and its polygons, each an outer ring then any holes, as [lng, lat]. */
export interface CountryOutline {
  readonly name: string;
  /** [west, south, east, north], to skip a country quickly. */
  readonly bbox: readonly [number, number, number, number];
  readonly polygons: readonly (readonly (readonly (readonly [number, number])[])[])[];
}

/**
 * How far outside an outline a point still belongs to it. Every echo in the library is
 * within 9 km of its country's 1:50m outline (2026-11-13), and no other country is within
 * 60 km of any of them.
 */
export const COUNTRY_REACH_KM = 25;

function inRing(lng: number, lat: number, ring: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Kilometres from a point to a segment, flat at the point's latitude (fine at 25 km). */
function segmentKm(at: LatLng, a: readonly [number, number], b: readonly [number, number]): number {
  const k = Math.cos((at.lat * Math.PI) / 180) * 111.32;
  const ax = (a[0] - at.lng) * k;
  const ay = (a[1] - at.lat) * 110.57;
  const dx = (b[0] - a[0]) * k;
  const dy = (b[1] - a[1]) * 110.57;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

const contains = (c: CountryOutline, at: LatLng) =>
  at.lng >= c.bbox[0] &&
  at.lng <= c.bbox[2] &&
  at.lat >= c.bbox[1] &&
  at.lat <= c.bbox[3] &&
  c.polygons.some(([outer, ...holes]) => !!outer && inRing(at.lng, at.lat, outer) && !holes.some((h) => inRing(at.lng, at.lat, h)));

/** The country this point is in, by name, or null in the open sea or a country not given. */
export function countryAt(at: LatLng, outlines: readonly CountryOutline[]): string | null {
  for (const c of outlines) if (contains(c, at)) return c.name;
  // Near a coast the outline may have left it out: the nearest within reach.
  const pad = COUNTRY_REACH_KM / 80;
  let best: { name: string; km: number } | null = null;
  for (const c of outlines) {
    if (at.lng < c.bbox[0] - pad * 2 || at.lng > c.bbox[2] + pad * 2 || at.lat < c.bbox[1] - pad || at.lat > c.bbox[3] + pad) continue;
    // Every ring, holes as well: a lake's shore is that country's too.
    for (const ring of c.polygons.flat()) {
      for (let i = 1; i < ring.length; i++) {
        const km = segmentKm(at, ring[i - 1]!, ring[i]!);
        if (km <= COUNTRY_REACH_KM && (!best || km < best.km)) best = { name: c.name, km };
      }
    }
  }
  return best?.name ?? null;
}
