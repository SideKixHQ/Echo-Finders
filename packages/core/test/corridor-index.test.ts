import { describe, expect, it } from "vitest";
import { findEchoesAlongRoute } from "../src/index.js";
import { buildRouteGeometry, corridorBoundingBox } from "../src/geo/corridor.js";
import { inBoundingBox } from "../src/geo/great-circle.js";
import { projectOntoRoute } from "../src/geo/corridor.js";
import { presetFor } from "../src/modes.js";
import { effectiveRadiusKm } from "../src/content/contributions.js";
import type { Echo, Route } from "../src/types.js";

function library(n: number, seed = 1): Echo[] {
  const out: Echo[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: `e${i}`, title: "t", summary: "s",
      point: { at: { lat: 25 + ((i * 7919 * seed) % 24000) / 1000, lng: -124 + ((i * 6271 * seed) % 58000) / 1000 }, triggerRadiusKm: 0.08, place: "p" },
      category: "history", format: "short", durationS: 90, minAge: 0, quality: 0.7,
      visibility: "position-only", certainty: "documented", sources: [],
      editorial: "approved", factCheck: "corroborated",
      renders: [{ voiceId: "v", audioKey: "a", durationS: 90 }],
    } as Echo);
  }
  return out;
}

/**
 * The implementation this replaced: one bounding box around the whole corridor, then a
 * projection against every segment of the route.
 *
 * Kept as the oracle. The cell index exists to be eighteen times faster on a long route,
 * and a faster filter that quietly drops an echo is not a faster filter — it is a content
 * bug with a good benchmark. Three seeded libraries across three travel modes, because the
 * failure this guards against is geometric: the first version of the index marked cells at
 * the corridor's radius rather than the corridor plus a segment length, which is provably
 * too small and which a kinder set of test points would have let through.
 */
function byBoundingBox(route: Route, echoes: readonly Echo[]) {
  const maxCrossTrackKm = presetFor(route.mode).corridorKm;
  const geometry = buildRouteGeometry(route);
  const box = corridorBoundingBox(geometry, maxCrossTrackKm);
  const hits = [];
  for (const echo of echoes) {
    if (!inBoundingBox(box, echo.point.at)) continue;
    const projection = projectOntoRoute(geometry, echo.point.at);
    if (projection.crossTrackKm > Math.min(maxCrossTrackKm, effectiveRadiusKm(echo))) continue;
    hits.push({ echo, ...projection });
  }
  hits.sort((a, b) => a.alongTrackKm - b.alongTrackKm);
  return hits;
}

const route = (mode: Route["mode"], waypoints: Route["waypoints"]): Route => ({
  id: "r",
  mode,
  origin: { name: "a", at: waypoints[0]!.at, timeZone: "America/New_York" },
  destination: { name: "b", at: waypoints[waypoints.length - 1]!.at, timeZone: "America/New_York" },
  waypoints,
  durationS: 9000,
  departureAt: "2026-06-15T14:00:00Z",
});

const walk = route("walking", [
  { name: "Battery", at: { lat: 40.7033, lng: -74.017 } },
  { name: "Wall St", at: { lat: 40.7073, lng: -74.011 } },
  { name: "Burial", at: { lat: 40.7148, lng: -74.0043 } },
]);
const flight = route("flight", [
  { name: "SFO", at: { lat: 37.62, lng: -122.38 } },
  { name: "JFK", at: { lat: 40.64, lng: -73.78 } },
]);
const drive = route("driving", [
  { name: "Asheville", at: { lat: 35.595, lng: -82.552 } },
  { name: "Boone", at: { lat: 36.217, lng: -81.674 } },
]);

describe("the corridor filter", () => {
  it("returns exactly what the bounding-box filter returned", () => {
    // The only property that matters. A faster filter that quietly drops an echo is not a
    // faster filter, it is a content bug with a good benchmark.
    for (const seed of [1, 3, 7]) {
      const lib = library(4000, seed);
      for (const r of [walk, flight, drive]) {
        const now = findEchoesAlongRoute(r, lib).map((h) => h.echo.id);
        const before = byBoundingBox(r, lib).map((h) => h.echo.id);
        expect(now).toEqual(before);
      }
    }
  });

});
