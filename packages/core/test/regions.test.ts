import { describe, expect, it } from "vitest";
import {
  COARSE_RADIUS_FLOOR_M,
  IOS_REGION_LIMIT,
  arrivalAt,
  regionsToMonitor,
} from "../src/proximity/regions.js";
import type { Echo } from "../src/types.js";
import { ADULT, makeEcho } from "./fixtures.js";

const WALL_STREET = { lat: 40.7069, lng: -74.0113 };
const NOON = Date.parse("2026-06-15T17:00:00Z");

/** A point `m` metres due north of `from`, near enough for a test at this latitude. */
const north = (from: { lat: number; lng: number }, m: number) => ({
  lat: from.lat + m / 111_320,
  lng: from.lng,
});

describe("regionsToMonitor", () => {
  const library: Echo[] = [
    makeEcho({ id: "doorway", at: WALL_STREET, triggerRadiusKm: 0.04, quality: 0.9 }),
    makeEcho({ id: "next-street", at: north(WALL_STREET, 180), triggerRadiusKm: 0.04 }),
    makeEcho({ id: "wide", at: north(WALL_STREET, 400), triggerRadiusKm: 2, quality: 0.8 }),
  ];

  it("widens a forty metre echo to something a platform can honour", () => {
    const [first] = regionsToMonitor(WALL_STREET, library, ADULT, { atMs: NOON });
    expect(first!.triggerRadiusM).toBe(40);
    expect(first!.radiusM).toBe(COARSE_RADIUS_FLOOR_M);
  });

  it("leaves a radius alone when it is already wider than the floor", () => {
    const wide = regionsToMonitor(WALL_STREET, library, ADULT, { atMs: NOON }).find(
      (r) => r.echoId === "wide",
    );
    expect(wide!.radiusM).toBe(2000);
  });

  it("never hands the platform more regions than it can hold", () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      makeEcho({ id: `echo-${i}`, at: north(WALL_STREET, 20 + i * 10), triggerRadiusKm: 0.04 }),
    );
    const planned = regionsToMonitor(WALL_STREET, many, ADULT, { atMs: NOON });
    expect(planned.length).toBe(IOS_REGION_LIMIT);
  });

  it("honours a platform that can hold more, or fewer", () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      makeEcho({ id: `echo-${i}`, at: north(WALL_STREET, 20 + i * 10), triggerRadiusKm: 0.04 }),
    );
    expect(regionsToMonitor(WALL_STREET, many, ADULT, { atMs: NOON, max: 50 }).length).toBe(50);
    expect(regionsToMonitor(WALL_STREET, many, ADULT, { atMs: NOON, max: 0 })).toEqual([]);
  });

  it("keeps a region the platform already holds rather than churning it", () => {
    // Fill the plan, then re-plan while holding one that ranking would otherwise drop.
    const many = Array.from({ length: 40 }, (_, i) =>
      makeEcho({ id: `echo-${i}`, at: north(WALL_STREET, 20 + i * 10), triggerRadiusKm: 0.04 }),
    );
    const first = regionsToMonitor(WALL_STREET, many, ADULT, { atMs: NOON });
    const dropped = `echo-39`;
    expect(first.map((r) => r.echoId)).not.toContain(dropped);

    const again = regionsToMonitor(WALL_STREET, many, ADULT, { atMs: NOON, keep: [dropped] });
    expect(again.map((r) => r.echoId)).toContain(dropped);
    expect(again.length).toBe(IOS_REGION_LIMIT);
  });

  it("does not invent a region for an echo the listener may not hear", () => {
    const grown = makeEcho({ id: "grown-ups", at: WALL_STREET, triggerRadiusKm: 0.04, minAge: 18 });
    const planned = regionsToMonitor(
      WALL_STREET,
      [grown],
      { ...ADULT, age: 9 },
      { atMs: NOON },
    );
    expect(planned.map((r) => r.echoId)).not.toContain("grown-ups");
  });
});

describe("arrivalAt", () => {
  const region = { at: WALL_STREET, triggerRadiusM: 40 };

  it("arrives when the whole fix fits inside the echo's own radius", () => {
    const got = arrivalAt(region, { at: north(WALL_STREET, 10), accuracyM: 8 });
    expect(got.kind).toBe("arrived");
  });

  it("says elsewhere when the fix is outside by more than its own error", () => {
    const got = arrivalAt(region, { at: north(WALL_STREET, 120), accuracyM: 10 });
    expect(got.kind).toBe("elsewhere");
  });

  it("refuses to guess when the fix straddles the boundary", () => {
    const got = arrivalAt(region, { at: north(WALL_STREET, 45), accuracyM: 30 });
    expect(got.kind).toBe("unsure");
  });

  it("is unsure rather than arrived when a vague fix sits on the point", () => {
    // The listener may be here. A sixty metre fix cannot tell, and saying "arrived"
    // would play the echo to somebody across the junction.
    const got = arrivalAt(region, { at: WALL_STREET, accuracyM: 60 });
    expect(got.kind).toBe("unsure");
  });

  it("treats a nonsense accuracy as no accuracy at all rather than as a bonus", () => {
    const got = arrivalAt(region, { at: north(WALL_STREET, 10), accuracyM: -50 });
    expect(got.kind).toBe("arrived");
  });

  it("reports the distance it measured, so a walk log can explain itself", () => {
    const got = arrivalAt(region, { at: north(WALL_STREET, 100), accuracyM: 5 });
    expect(got.distanceM).toBeGreaterThan(95);
    expect(got.distanceM).toBeLessThan(105);
  });
});
