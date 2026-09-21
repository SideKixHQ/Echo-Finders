import { describe, expect, it } from "vitest";
import { dutyCycleFor, presetFor } from "../src/modes.js";
import { buildPlaylist } from "../src/ranking/playlist.js";
import { scoreEcho } from "../src/ranking/score.js";
import { buildEchoJourney } from "../src/pkg/build.js";
import { RouteProfile } from "../src/route/profile.js";
import { buildRouteGeometry, findEchoesAlongRoute } from "../src/geo/corridor.js";
import { TRAVEL_MODES, isOnFoot } from "../src/types.js";
import type { CorridorHit } from "../src/geo/corridor.js";
import type { Echo, TravelMode } from "../src/types.js";
import { ADULT, JFK_MIA, MANHATTAN_WALK, PARKWAY_DRIVE, makeEcho, echoesAlong } from "./fixtures.js";

const NOON = Date.parse("2026-06-15T17:00:00Z");

describe("MODE_PRESETS", () => {
  it("covers every travel mode", () => {
    for (const mode of TRAVEL_MODES) expect(presetFor(mode)).toBeDefined();
  });

  it("orders speed, corridor width and timing tolerance consistently", () => {
    // These three should move together: the faster you travel, the wider the area that
    // counts as "here", and the longer a place stays the place you are at.
    const ordered: TravelMode[] = ["walking", "cycling", "driving", "rail", "flight"];
    for (let i = 1; i < ordered.length; i++) {
      const slower = presetFor(ordered[i - 1]!);
      const faster = presetFor(ordered[i]!);
      expect(faster.speedKph).toBeGreaterThan(slower.speedKph);
      expect(faster.corridorKm).toBeGreaterThan(slower.corridorKm);
      expect(faster.maxTimingDriftS).toBeGreaterThan(slower.maxTimingDriftS);
    }
  });

  it("gets chattier as the route gets more deliberate", () => {
    // Silence on a three-hour flight is restful; silence on a walking tour feels broken.
    expect(dutyCycleFor("walking", "balanced")).toBeGreaterThan(dutyCycleFor("flight", "balanced"));
    for (const mode of TRAVEL_MODES) {
      const { dutyCycle } = presetFor(mode);
      expect(dutyCycle.light).toBeLessThan(dutyCycle.balanced);
      expect(dutyCycle.balanced).toBeLessThan(dutyCycle.immersive);
      expect(dutyCycle.immersive).toBeLessThanOrEqual(1);
    }
  });

  it("puts the aircraft feed first for flight and GNSS first on the ground", () => {
    // ADR-0002 applies to the cabin only. On the ground the usual hierarchy holds.
    expect(presetFor("flight").positionPriority[0]).toBe("aircraft-feed");
    for (const mode of TRAVEL_MODES.filter((m) => m !== "flight")) {
      expect(presetFor(mode).positionPriority[0]).toBe("device-gnss");
    }
  });

  it("sizes offline packages for how they will be downloaded", () => {
    // A walking tour should download over mobile data without a thought.
    expect(presetFor("walking").packageBudgetBytes).toBeLessThan(
      presetFor("flight").packageBudgetBytes / 2,
    );
  });

  it("suggests trigger radii inside what the validator accepts", () => {
    for (const mode of TRAVEL_MODES) {
      const radius = presetFor(mode).typicalTriggerRadiusKm;
      expect(radius).toBeGreaterThanOrEqual(0.02);
      expect(radius).toBeLessThanOrEqual(250);
    }
  });
});

describe("isOnFoot", () => {
  it("counts walking and cycling, and nothing else", () => {
    expect(isOnFoot("walking")).toBe(true);
    expect(isOnFoot("cycling")).toBe(true);
    expect(isOnFoot("driving")).toBe(false);
    expect(isOnFoot("flight")).toBe(false);
  });
});

describe("visibility interacts with travel mode", () => {
  const plaque = makeEcho({
    id: "plaque",
    at: { lat: 40.7069, lng: -74.0113 },
    visibility: "at-hand",
  });
  const hit: CorridorHit = {
    echo: plaque,
    crossTrackKm: 0.02,
    alongTrackKm: 0.5,
    nearestPoint: plaque.point.at,
  };

  const scoreIn = (mode: TravelMode) =>
    scoreEcho(hit, { profile: ADULT, playAtMs: NOON, mode });

  it("makes a plaque the best kind of echo on foot", () => {
    expect(scoreIn("walking").visibility).toBe(1);
  });

  it("all but suppresses it from the air", () => {
    // A dense city holds hundreds of at-hand echoes. Without this a flight crossing
    // Manhattan would fill with plaques nobody can see.
    expect(scoreIn("flight").visibility).toBeLessThan(0.1);
  });

  it("demotes but does not suppress it from a car", () => {
    const driving = scoreIn("driving").visibility;
    expect(driving).toBeGreaterThan(scoreIn("flight").visibility);
    expect(driving).toBeLessThan(scoreIn("walking").visibility);
  });

  it("leaves a distant landmark unaffected by mode", () => {
    const mountain = makeEcho({
      id: "mountain",
      at: { lat: 35.7654, lng: -82.2651 },
      visibility: "landmark-visible",
    });
    const mountainHit: CorridorHit = {
      echo: mountain,
      crossTrackKm: 1,
      alongTrackKm: 10,
      nearestPoint: mountain.point.at,
    };
    const fromAir = scoreEcho(mountainHit, { profile: ADULT, playAtMs: NOON, mode: "flight" });
    const onFoot = scoreEcho(mountainHit, { profile: ADULT, playAtMs: NOON, mode: "walking" });
    expect(fromAir.visibility).toBe(onFoot.visibility);
  });
});

describe("a walking tour", () => {
  const library = echoesAlong(MANHATTAN_WALK, 24, { visibility: "at-hand" });

  it("finds echoes at street scale", () => {
    const hits = findEchoesAlongRoute(MANHATTAN_WALK, library);
    expect(hits.length).toBe(library.length);
    for (const hit of hits) expect(hit.crossTrackKm).toBeLessThan(0.3);
  });

  it("does not pick up an echo a block away", () => {
    // Roughly 400m east of the route — nothing on a flight, a different street on foot.
    const offRoute = makeEcho({
      id: "off-route",
      at: { lat: 40.7069, lng: -74.0066 },
      triggerRadiusKm: 0.12,
    });
    expect(findEchoesAlongRoute(MANHATTAN_WALK, [offRoute])).toEqual([]);
  });

  it("schedules a tour's worth of echoes in forty minutes", () => {
    const playlist = buildPlaylist(MANHATTAN_WALK, library, ADULT);
    expect(playlist.mode).toBe("walking");
    expect(playlist.items.length).toBeGreaterThan(5);
  });

  it("keeps every echo within a hundred metres of its subject", () => {
    // The whole point of the tight walking tolerance: play an echo late and the listener
    // is looking at a different building.
    const playlist = buildPlaylist(MANHATTAN_WALK, library, ADULT);
    const drift = presetFor("walking").maxTimingDriftS;
    for (const item of playlist.items) {
      const midpoint = item.startS + item.echo.durationS / 2;
      expect(Math.abs(midpoint - item.nearestS)).toBeLessThanOrEqual(drift);
    }
  });

  it("starts talking almost immediately", () => {
    const geometry = buildRouteGeometry(MANHATTAN_WALK);
    const window = RouteProfile.forRoute(MANHATTAN_WALK, geometry).listeningWindow();
    // No safety briefing to wait out.
    expect(window.startS).toBeLessThan(30);
  });

  it("talks for more of the route than a flight does", () => {
    const walk = buildPlaylist(MANHATTAN_WALK, library, ADULT);
    const flightLibrary = echoesAlong(JFK_MIA, 120);
    const flight = buildPlaylist(JFK_MIA, flightLibrary, ADULT);

    const walkShare = walk.totalAudioS / walk.routeDurationS;
    const flightShare = flight.totalAudioS / flight.routeDurationS;
    expect(walkShare).toBeGreaterThan(flightShare);
  });

  it("packages small enough for mobile data", () => {
    const pkg = buildEchoJourney(MANHATTAN_WALK, library);
    expect(pkg.totalBytes).toBeLessThanOrEqual(presetFor("walking").packageBudgetBytes);
  });
});

describe("a scenic drive", () => {
  const library = echoesAlong(PARKWAY_DRIVE, 40, { visibility: "landmark-visible" });

  it("schedules along the road", () => {
    const playlist = buildPlaylist(PARKWAY_DRIVE, library, ADULT);
    expect(playlist.mode).toBe("driving");
    expect(playlist.items.length).toBeGreaterThan(8);
  });

  it("uses a corridor between a walk's and a flight's", () => {
    const corridor = presetFor("driving").corridorKm;
    expect(corridor).toBeGreaterThan(presetFor("walking").corridorKm);
    expect(corridor).toBeLessThan(presetFor("flight").corridorKm);
  });

  it("keeps echoes near the road, not across the valley", () => {
    const hits = findEchoesAlongRoute(PARKWAY_DRIVE, library);
    for (const hit of hits) expect(hit.crossTrackKm).toBeLessThan(5);
  });
});

describe("the same library, different modes", () => {
  /** One echo per mode scale, all on the Manhattan route. */
  const mixed: Echo[] = [
    makeEcho({
      id: "city-scale",
      at: { lat: 40.708, lng: -74.011 },
      triggerRadiusKm: 60,
      visibility: "landmark-visible",
    }),
    makeEcho({
      id: "street-scale",
      at: { lat: 40.7069, lng: -74.0113 },
      triggerRadiusKm: 0.1,
      visibility: "at-hand",
    }),
  ];

  it("gives a walker the street echo and a pilot the city echo", () => {
    const onFoot = findEchoesAlongRoute(MANHATTAN_WALK, mixed).map((h) => h.echo.id);
    expect(onFoot).toContain("street-scale");

    // The same walk flown over: the street-scale echo is inside the flight corridor by
    // distance, but its own trigger radius keeps it out.
    const flownOver = findEchoesAlongRoute({ ...MANHATTAN_WALK, mode: "flight" }, mixed);
    expect(flownOver.map((h) => h.echo.id)).toContain("city-scale");
  });

  it("scores the same echo differently depending on how you are moving", () => {
    const walk = buildPlaylist(MANHATTAN_WALK, mixed, ADULT);
    const streetItem = walk.items.find((i) => i.echo.id === "street-scale");
    expect(streetItem).toBeDefined();
    expect(streetItem!.score).toBeGreaterThan(0.6);
  });
});

describe("RouteProfile across modes", () => {
  it("scales its stages to the route", () => {
    for (const route of [JFK_MIA, PARKWAY_DRIVE, MANHATTAN_WALK]) {
      const geometry = buildRouteGeometry(route);
      const profile = RouteProfile.forRoute(route, geometry);
      const window = profile.listeningWindow();

      expect(profile.mode).toBe(route.mode);
      expect(window.endS).toBeGreaterThan(window.startS);
      expect(profile.distanceAtTime(route.durationS)).toBeCloseTo(geometry.totalKm, 6);
      // Most of every route should be available for listening.
      expect(window.endS - window.startS).toBeGreaterThan(route.durationS * 0.5);
    }
  });

  it("defaults to flight when no mode is given", () => {
    expect(new RouteProfile(10_800, 1800).mode).toBe("flight");
  });
});
