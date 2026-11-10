import { describe, expect, it } from "vitest";
import { buildRouteGeometry, type Route } from "@echofinders/core";
import {
  GUIDE_FROM_KM,
  STOP_REACH_KM,
  guideFrom,
  guidedStops,
  simulatesRoute,
  stopWaypoints,
  walkedKm,
} from "../../apps/prototype/src/guided-walk";
import { WALKABLE_KM } from "../../apps/prototype/src/going";

/* A walk due east along a street in Wilmington: the river, two stops, then the end. */
const RIVER = { lat: 34.2355, lng: -77.95 };
const MIDDLE = { lat: 34.2355, lng: -77.947 };
const CHURCH = { lat: 34.2355, lng: -77.9455 };
const END = { lat: 34.2355, lng: -77.943 };
const place = (name: string, at: { lat: number; lng: number }) => ({ name, at, timeZone: "America/New_York" });
const walk: Route = {
  id: "test-walk",
  mode: "walking",
  name: "Test: the river to the end",
  origin: place("River", RIVER),
  destination: place("End", END),
  waypoints: [
    { name: "River", at: RIVER, dwellS: 120 },
    { name: "Middle", at: MIDDLE },
    { name: "Church", at: CHURCH, dwellS: 240 },
    { name: "End", at: END },
  ],
  departureAt: "2026-11-10T10:00:00-05:00",
  durationS: 1800,
};
const east = (at: { lat: number; lng: number }, metres: number) => ({ lat: at.lat, lng: at.lng + metres / (111_320 * Math.cos((at.lat * Math.PI) / 180)) });
const echoes = [
  { id: "end", at: east(END, 20) },
  { id: "river", at: east(RIVER, 30) },
  { id: "church", at: east(CHURCH, -15) },
  { id: "church-too", at: east(CHURCH, 60) },
  { id: "between", at: MIDDLE },
];

describe("a guided walk follows the phone, not a simulation", () => {
  it("walking and driving routes use the real position", () => {
    expect(simulatesRoute("walking", "")).toBe(false);
    expect(simulatesRoute("driving", "?at=34.2357,-77.9452")).toBe(false);
  });
  it("a flight, which has no aircraft feed yet, is still simulated", () => {
    expect(simulatesRoute("flight", "")).toBe(true);
  });
  it("the demo runs only when the address asks for it", () => {
    expect(simulatesRoute("walking", "?simulate")).toBe(true);
    expect(simulatesRoute("walking", "?speed=2&simulate=1")).toBe(true);
    expect(simulatesRoute("walking", "?speed=2")).toBe(false);
  });
});

describe("its stops", () => {
  it("are the waypoints it lingers at, and the end, as the trip menu counts them", () => {
    expect(stopWaypoints(walk).map((w) => w.name)).toEqual(["River", "Church", "End"]);
  });
  it("are the echo nearest each stop, in the order the walk reaches them", () => {
    expect(guidedStops(walk, echoes, () => true)).toEqual(["river", "church", "end"]);
  });
  it("leave out what is already synced", () => {
    expect(guidedStops(walk, echoes, (id) => id !== "river")).toEqual(["church", "end"]);
  });
  it("skip a stop with no echo within reach of it", () => {
    const far = echoes.filter((e) => e.id !== "end").concat({ id: "end", at: east(END, STOP_REACH_KM * 1000 + 40) });
    expect(guidedStops(walk, far, () => true)).toEqual(["river", "church"]);
  });
  it("never use one echo for two stops", () => {
    const one = [{ id: "only", at: RIVER }];
    expect(guidedStops({ ...walk, waypoints: [walk.waypoints[0]!, { at: east(RIVER, 10), dwellS: 60 }] }, one, () => true)).toEqual(["only"]);
  });
});

describe("the way to the start", () => {
  it("is offered within a walk of the first stop", () => {
    expect(guideFrom(CHURCH, RIVER)).toBe(true);
  });
  it("is not offered from another city", () => {
    expect(guideFrom({ lat: 40.7033, lng: -74.017 }, RIVER)).toBe(false);
    expect(GUIDE_FROM_KM).toBe(WALKABLE_KM);
  });
  it("is not offered past an hour on foot", () => {
    // 9.5 km north of the first stop: shown, not walked to.
    expect(guideFrom({ lat: RIVER.lat + 9.5 / 111.2, lng: RIVER.lng }, RIVER)).toBe(false);
    expect(guideFrom({ lat: RIVER.lat + 4 / 111.2, lng: RIVER.lng }, RIVER)).toBe(true);
  });
});

describe("how far along, from where you really are", () => {
  const geometry = buildRouteGeometry(walk);
  it("is nothing before the walk has begun, wherever you stand on it", () => {
    expect(walkedKm(geometry, CHURCH, "walking", false)).toBe(0);
  });
  it("is the nearest point on the route once it has", () => {
    const km = walkedKm(geometry, CHURCH, "walking", true);
    expect(km).toBeGreaterThan(0.4);
    expect(km).toBeLessThan(geometry.totalKm);
  });
  it("does not move while you are off the route", () => {
    const off = { lat: CHURCH.lat + 0.01, lng: CHURCH.lng };
    expect(walkedKm(geometry, off, "walking", true, 0.2)).toBe(0.2);
  });
  it("never goes backwards", () => {
    expect(walkedKm(geometry, RIVER, "walking", true, 0.3)).toBe(0.3);
  });
  it("keeps what it had with no fix", () => {
    expect(walkedKm(geometry, null, "walking", true, 0.3)).toBe(0.3);
  });
});
