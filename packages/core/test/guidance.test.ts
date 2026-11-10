import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  arrivalClock,
  compassWord,
  decodeStreets,
  routeGuidance,
  straightGuidance,
  walkingRoute,
  type StreetFile,
  type WalkingRoute,
} from "../src/index.js";

const route = (over: Partial<WalkingRoute>): WalkingRoute => ({
  line: [],
  metres: 450,
  seconds: 360,
  turns: [],
  startOn: "",
  ...over,
});

describe("turn by turn", () => {
  it("says the next turn, how far to it and onto what", () => {
    const g = routeGuidance(
      route({ turns: [{ at: { lat: 0, lng: 0 }, fromStartM: 120, direction: "right", onto: "Chestnut Street" }] }),
    );
    expect(g.say).toBe("Turn right onto Chestnut Street");
    expect(g.inM).toBe(120);
    expect(g.glyph).toBe("right");
    expect(g.streets).toBe(true);
    expect(g.seconds).toBe(360);
  });

  it("says only the turn when the street has no name", () => {
    const g = routeGuidance(route({ turns: [{ at: { lat: 0, lng: 0 }, fromStartM: 30, direction: "slight left", onto: "" }] }));
    expect(g.say).toBe("Turn slight left");
  });

  it("with no turns left, names the street to stay on", () => {
    expect(routeGuidance(route({ startOn: "Market Street", metres: 200 })).say).toBe("Continue on Market Street");
    expect(routeGuidance(route({ metres: 200 })).say).toBe("Straight on to it");
  });

  it("says almost there in the last few steps", () => {
    const g = routeGuidance(route({ metres: 25 }));
    expect(g.say).toBe("Almost there");
    expect(g.inM).toBeNull();
    expect(g.glyph).toBe("arrive");
  });
});

describe("with no street map: as the crow flies", () => {
  const from = { lat: 34.2357, lng: -77.9452 };

  it("gives a heading and the straight distance, and says it is not along streets", () => {
    const to = { lat: 34.2457, lng: -77.9352 };
    const g = straightGuidance(from, to);
    expect(g.say).toBe("Head northeast");
    expect(g.glyph).toBe("bearing");
    expect(g.streets).toBe(false);
    expect(g.metres).toBeGreaterThan(1300);
    expect(g.metres).toBeLessThan(1500);
    expect(g.inM).toBe(g.metres);
    expect(g.bearingDeg).toBeGreaterThan(30);
    expect(g.bearingDeg).toBeLessThan(60);
  });

  it("says almost there when close", () => {
    expect(straightGuidance(from, { lat: 34.2359, lng: -77.9452 }).say).toBe("Almost there");
  });

  it("names all eight directions without hyphens", () => {
    expect([0, 45, 90, 135, 180, 225, 270, 315, 359, -45].map(compassWord)).toEqual([
      "north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest", "north", "northwest",
    ]);
  });
});

describe("arrival time", () => {
  it("is the clock now plus the walk, hours and minutes", () => {
    const now = Date.UTC(2026, 10, 10, 0, 6, 0); // 7:06 pm in New York
    expect(arrivalClock(now, 6 * 60, "America/New_York")).toBe("7:12");
    expect(arrivalClock(now, 60 * 60, "America/New_York")).toBe("8:06");
  });
});

describe("guidance on a real street file", () => {
  const file = JSON.parse(
    readFileSync(new URL("../../../apps/prototype/public/streets/the-lady-in-grey.json", import.meta.url), "utf8"),
  ) as StreetFile;
  const g = decodeStreets(file);

  it("turns downtown Wilmington into a named turn and a sensible time", () => {
    const r = walkingRoute(g, { lat: 34.2357, lng: -77.9478 }, { lat: 34.2369, lng: -77.9446 })!;
    const out = routeGuidance(r);
    expect(out.streets).toBe(true);
    expect(out.say).toMatch(/^(Turn (left|right|slight left|slight right)( onto .+)?|Carry on onto .+|Continue on .+|Straight on to it)$/);
    expect(out.seconds / 60).toBeGreaterThan(2);
    expect(out.seconds / 60).toBeLessThan(10);
  });
});
