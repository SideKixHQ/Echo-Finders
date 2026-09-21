import { describe, expect, it } from "vitest";
import {
  bearingDeg,
  boundingBox,
  distanceKm,
  EARTH_RADIUS_KM,
  interpolate,
  projectOntoSegment,
} from "../src/geo/great-circle.js";
import { buildRouteGeometry, findStoriesAlongRoute, pointAtDistance } from "../src/geo/corridor.js";
import { JFK_MIA, makeStory } from "./fixtures.js";

/** One degree of arc at the Earth's mean radius. */
const DEGREE_KM = (EARTH_RADIUS_KM * Math.PI) / 180;

describe("distanceKm", () => {
  it("measures one degree of latitude as one degree of arc", () => {
    expect(distanceKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(DEGREE_KM, 3);
  });

  it("is symmetric", () => {
    const a = { lat: 40.6413, lng: -73.7781 };
    const b = { lat: 25.7959, lng: -80.287 };
    expect(distanceKm(a, b)).toBeCloseTo(distanceKm(b, a), 9);
  });

  it("is zero for identical points", () => {
    expect(distanceKm({ lat: 51.5, lng: -0.1 }, { lat: 51.5, lng: -0.1 })).toBe(0);
  });

  it("puts JFK–MIA at a realistic 1,750km", () => {
    const km = distanceKm({ lat: 40.6413, lng: -73.7781 }, { lat: 25.7959, lng: -80.287 });
    expect(km).toBeGreaterThan(1700);
    expect(km).toBeLessThan(1800);
  });

  it("handles antipodal points without NaN", () => {
    const km = distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 });
    expect(km).toBeCloseTo(Math.PI * EARTH_RADIUS_KM, 3);
  });
});

describe("bearingDeg", () => {
  it("reads due east along the equator", () => {
    expect(bearingDeg({ lat: 0, lng: 0 }, { lat: 0, lng: 10 })).toBeCloseTo(90, 6);
  });

  it("reads due north along a meridian", () => {
    expect(bearingDeg({ lat: 0, lng: 0 }, { lat: 10, lng: 0 })).toBeCloseTo(0, 6);
  });

  it("returns a value in [0, 360)", () => {
    const b = bearingDeg({ lat: 10, lng: 10 }, { lat: 0, lng: 0 });
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
  });
});

describe("interpolate", () => {
  it("returns the endpoints at 0 and 1", () => {
    const a = { lat: 10, lng: 20 };
    const b = { lat: -5, lng: 45 };
    expect(interpolate(a, b, 0).lat).toBeCloseTo(a.lat, 9);
    expect(interpolate(a, b, 1).lng).toBeCloseTo(b.lng, 9);
  });

  it("halves an equatorial leg exactly", () => {
    const mid = interpolate({ lat: 0, lng: 0 }, { lat: 0, lng: 10 }, 0.5);
    expect(mid.lat).toBeCloseTo(0, 9);
    expect(mid.lng).toBeCloseTo(5, 9);
  });

  it("bows polewards on a high-latitude leg, as a real track does", () => {
    // A great circle between two points on the same parallel passes closer to the pole
    // than the parallel itself. This is why the route polyline must be densified.
    const mid = interpolate({ lat: 55, lng: -10 }, { lat: 55, lng: 10 }, 0.5);
    expect(mid.lat).toBeGreaterThan(55);
  });
});

describe("projectOntoSegment", () => {
  const start = { lat: 0, lng: 0 };
  const end = { lat: 0, lng: 10 };

  it("measures perpendicular offset from the track", () => {
    const p = projectOntoSegment(start, end, { lat: 1, lng: 5 });
    expect(p.crossTrackKm).toBeCloseTo(DEGREE_KM, 1);
    expect(p.alongTrackKm).toBeCloseTo(5 * DEGREE_KM, 0);
  });

  it("is sign-agnostic about which side of the track the point is on", () => {
    const north = projectOntoSegment(start, end, { lat: 1, lng: 5 });
    const south = projectOntoSegment(start, end, { lat: -1, lng: 5 });
    expect(north.crossTrackKm).toBeCloseTo(south.crossTrackKm, 6);
  });

  it("clamps a point behind the start to the start", () => {
    const p = projectOntoSegment(start, end, { lat: 0, lng: -5 });
    expect(p.alongTrackKm).toBe(0);
    expect(p.fraction).toBe(0);
    expect(p.crossTrackKm).toBeCloseTo(5 * DEGREE_KM, 3);
  });

  it("clamps a point beyond the end to the end", () => {
    const p = projectOntoSegment(start, end, { lat: 0, lng: 15 });
    expect(p.fraction).toBe(1);
    expect(p.crossTrackKm).toBeCloseTo(5 * DEGREE_KM, 3);
  });

  it("treats a degenerate segment as a single point", () => {
    const p = projectOntoSegment(start, start, { lat: 0, lng: 1 });
    expect(p.crossTrackKm).toBeCloseTo(DEGREE_KM, 3);
  });
});

describe("buildRouteGeometry", () => {
  it("densifies to roughly the requested segment length", () => {
    const geometry = buildRouteGeometry(JFK_MIA, 25);
    expect(geometry.points.length).toBeGreaterThan(60);
    for (let i = 1; i < geometry.points.length; i++) {
      expect(distanceKm(geometry.points[i - 1]!, geometry.points[i]!)).toBeLessThanOrEqual(26);
    }
  });

  it("keeps cumulative distance monotonic and consistent with the total", () => {
    const geometry = buildRouteGeometry(JFK_MIA);
    for (let i = 1; i < geometry.cumulativeKm.length; i++) {
      expect(geometry.cumulativeKm[i]!).toBeGreaterThanOrEqual(geometry.cumulativeKm[i - 1]!);
    }
    expect(geometry.cumulativeKm.at(-1)).toBeCloseTo(geometry.totalKm, 6);
  });

  it("rejects a plan with fewer than two waypoints", () => {
    expect(() =>
      buildRouteGeometry({ ...JFK_MIA, waypoints: [JFK_MIA.waypoints[0]!] }),
    ).toThrow(/at least two waypoints/);
  });
});

describe("pointAtDistance", () => {
  it("returns the endpoints at the extremes and clamps beyond them", () => {
    const geometry = buildRouteGeometry(JFK_MIA);
    expect(pointAtDistance(geometry, -100).lat).toBeCloseTo(40.6413, 6);
    expect(pointAtDistance(geometry, geometry.totalKm + 100).lat).toBeCloseTo(25.7959, 6);
  });

  it("advances monotonically along the route", () => {
    const geometry = buildRouteGeometry(JFK_MIA);
    let previous = 0;
    for (let km = 0; km <= geometry.totalKm; km += 100) {
      const point = pointAtDistance(geometry, km);
      const fromOrigin = distanceKm(geometry.points[0]!, point);
      expect(fromOrigin).toBeGreaterThanOrEqual(previous - 1);
      previous = fromOrigin;
    }
  });
});

describe("findStoriesAlongRoute", () => {
  it("includes a story under the path and excludes one far inland", () => {
    const onPath = makeStory({ id: "on-path", at: { lat: 33.69, lng: -78.89 } });
    const farAway = makeStory({ id: "far-away", at: { lat: 39.74, lng: -104.99 } }); // Denver

    const hits = findStoriesAlongRoute(JFK_MIA, [onPath, farAway]);

    expect(hits.map((h) => h.story.id)).toEqual(["on-path"]);
    expect(hits[0]!.crossTrackKm).toBeLessThan(5);
  });

  it("respects a story's own trigger radius, not just the corridor width", () => {
    // ~55km off the track: inside the default corridor, outside this story's radius.
    const tight = makeStory({
      id: "tight",
      at: { lat: 33.69, lng: -78.3 },
      triggerRadiusKm: 10,
    });
    const loose = makeStory({ id: "loose", at: { lat: 33.69, lng: -78.3 }, triggerRadiusKm: 80 });

    expect(findStoriesAlongRoute(JFK_MIA, [tight]).length).toBe(0);
    expect(findStoriesAlongRoute(JFK_MIA, [loose]).length).toBe(1);
  });

  it("returns hits in the order the aircraft meets them", () => {
    const hits = findStoriesAlongRoute(JFK_MIA, [
      makeStory({ id: "south", at: { lat: 27.0, lng: -80.4 } }),
      makeStory({ id: "north", at: { lat: 40.0, lng: -74.0 } }),
      makeStory({ id: "middle", at: { lat: 33.69, lng: -78.89 } }),
    ]);
    expect(hits.map((h) => h.story.id)).toEqual(["north", "middle", "south"]);
  });

  it("narrows the corridor when asked", () => {
    const offset = makeStory({ id: "offset", at: { lat: 33.69, lng: -78.3 }, triggerRadiusKm: 200 });
    expect(findStoriesAlongRoute(JFK_MIA, [offset], { maxCrossTrackKm: 80 }).length).toBe(1);
    expect(findStoriesAlongRoute(JFK_MIA, [offset], { maxCrossTrackKm: 20 }).length).toBe(0);
  });
});

describe("boundingBox", () => {
  it("contains its input points", () => {
    const box = boundingBox([{ lat: 10, lng: 20 }, { lat: -5, lng: 45 }]);
    expect(box.minLat).toBeLessThanOrEqual(-5);
    expect(box.maxLat).toBeGreaterThanOrEqual(10);
  });

  it("pads longitude more than latitude at high latitude", () => {
    const box = boundingBox([{ lat: 70, lng: 0 }], 100);
    const latPad = box.maxLat - 70;
    const lngPad = box.maxLng - 0;
    expect(lngPad).toBeGreaterThan(latPad * 2);
  });

  it("rejects an empty input", () => {
    expect(() => boundingBox([])).toThrow();
  });
});
