import { describe, expect, it } from "vitest";
import { buildRouteGeometry, distanceKm, type Route } from "../src/index.js";

// A drive whose road bends: north, then east, then south. The waypoints alone are a
// straight line west to east; the traced road is the shape the car actually drives.
const at = (lat: number, lng: number) => ({ lat, lng });
const drive = (path?: Route["path"]): Route => ({
  id: "bend",
  mode: "driving",
  origin: { name: "A", at: at(35, -82), timeZone: "America/New_York" },
  destination: { name: "B", at: at(35, -81.9), timeZone: "America/New_York" },
  waypoints: [
    { name: "A", at: at(35, -82) },
    { name: "Top", at: at(35.05, -81.95) },
    { name: "B", at: at(35, -81.9) },
  ],
  departureAt: "2026-06-15T14:00:00Z",
  durationS: 3600,
  ...(path ? { path } : {}),
});
const road = [at(35, -82), at(35.05, -82), at(35.05, -81.95), at(35.05, -81.9), at(35, -81.9)];

describe("a traced road", () => {
  it("is followed instead of the straight lines between waypoints", () => {
    const straight = buildRouteGeometry(drive());
    const traced = buildRouteGeometry(drive(road));
    // Up five km, across nine, down five: longer than the waypoints' straight legs.
    expect(traced.totalKm).toBeGreaterThan(straight.totalKm + 4);
    // Every point lies on the road, to within metres (legs are great-circle arcs).
    for (const p of traced.points) {
      expect(p.lat).toBeGreaterThanOrEqual(35 - 1e-4);
      expect(p.lat).toBeLessThanOrEqual(35.05 + 1e-4);
    }
  });

  it("pins each waypoint to the nearest point of the road, in order", () => {
    const g = buildRouteGeometry(drive(road));
    expect(g.waypointIndex).toHaveLength(3);
    expect(g.waypointIndex[0]).toBe(0);
    expect(g.waypointIndex[2]).toBe(g.points.length - 1);
    const top = g.points[g.waypointIndex[1]!]!;
    expect(distanceKm(top, at(35.05, -81.95))).toBeLessThan(0.5);
  });

  it("falls back to the waypoints when there is no traced road", () => {
    const g = buildRouteGeometry(drive([at(35, -82)]));
    expect(g.points[0]).toEqual(at(35, -82));
    expect(g.points[g.points.length - 1]).toEqual(at(35, -81.9));
  });
});
