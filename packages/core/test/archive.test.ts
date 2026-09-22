import { describe, expect, it } from "vitest";
import { alignmentTo, alignmentWords } from "../src/proximity/archive.js";
import type { ArchivePhoto, LatLng } from "../src/types.js";

const SUBJECT: LatLng = { lat: 40.7069, lng: -74.0113 };
/** Across the road, south of the subject — where a photographer of it would stand. */
const VANTAGE: LatLng = { lat: 40.7066, lng: -74.0113 };

const north = (from: LatLng, metres: number): LatLng => ({
  lat: from.lat + metres / 111_195,
  lng: from.lng,
});
const east = (from: LatLng, metres: number): LatLng => ({
  lat: from.lat,
  lng: from.lng + metres / (111_320 * Math.cos((from.lat * Math.PI) / 180)),
});

const photo = (overrides: Partial<ArchivePhoto> = {}): ArchivePhoto => ({
  imageKey: "archive/1908.jpg",
  at: VANTAGE,
  // Looking due north, from the vantage at the subject.
  bearingDeg: 0,
  year: 1908,
  credit: "Library of Congress",
  rights: "public-domain",
  ...overrides,
});

describe("standing where the photographer stood", () => {
  it("sends you to the vantage point, not to the subject", () => {
    // The one place you cannot reproduce a photograph of a building from is inside it.
    const at = alignmentTo(photo(), SUBJECT, SUBJECT, 0);
    expect(at.advice).toBe("walk-there");
    expect(at.metresAway).toBeGreaterThan(20);
  });

  it("says hold it up once you are on the spot and facing the right way", () => {
    const result = alignmentTo(photo(), SUBJECT, VANTAGE, 0);
    expect(result.advice).toBe("hold-up");
    expect(result.score).toBeGreaterThan(0.8);
  });

  it("tells you which way to turn", () => {
    // Facing east, needing to face north: the shorter turn is to the left.
    const left = alignmentTo(photo(), SUBJECT, VANTAGE, 90);
    expect(left.advice).toBe("turn");
    expect(left.turnDeg).toBeLessThan(0);
    expect(alignmentWords(left)).toBe("Turn left");

    const right = alignmentTo(photo(), SUBJECT, VANTAGE, 270);
    expect(right.turnDeg).toBeGreaterThan(0);
    expect(alignmentWords(right)).toBe("Turn right");
  });

  it("points you at the vantage while you are still walking to it", () => {
    // Standing well east of the spot, the useful direction is *towards the spot* — not the
    // bearing the shot was taken along, which would have somebody facing a parallel wall.
    const away = east(VANTAGE, 60);
    const result = alignmentTo(photo(), SUBJECT, away, 270);
    expect(result.advice).toBe("walk-there");
    // Facing due west from east of the vantage is very nearly right.
    expect(Math.abs(result.turnDeg ?? 999)).toBeLessThan(15);
  });

  it("still helps with no bearing recorded", () => {
    const result = alignmentTo(photo({ bearingDeg: undefined }), SUBJECT, VANTAGE, 0);
    expect(result.advice).toBe("no-bearing");
    expect(result.turnDeg).toBeNull();
    expect(result.score).toBeGreaterThan(0.8);
  });

  it("still helps with no compass", () => {
    const result = alignmentTo(photo(), SUBJECT, VANTAGE, null);
    expect(result.advice).toBe("no-compass");
    expect(result.turnDeg).toBeNull();
    expect(result.score).toBeGreaterThan(0.8);
  });

  it("refuses to advise on facing when the compass is wildly unsure", () => {
    // A confident wrong answer costs more trust than an admitted unknown.
    const result = alignmentTo(photo(), SUBJECT, VANTAGE, 0, { headingAccuracyDeg: 60 });
    expect(result.advice).toBe("no-compass");
  });

  it("forgives error the compass admits to", () => {
    // Twelve degrees off with a fifteen-degree error bar is not off at all.
    const result = alignmentTo(photo(), SUBJECT, VANTAGE, 12, { headingAccuracyDeg: 15 });
    expect(result.advice).toBe("hold-up");
    expect(result.score).toBeGreaterThan(0.8);
  });

  it("falls back to the echo's own point when no vantage was recorded", () => {
    const result = alignmentTo(photo({ at: undefined }), SUBJECT, SUBJECT, 0);
    expect(result.metresAway).toBeLessThan(1);
  });

  it("scores lower the further away you are", () => {
    const near = alignmentTo(photo(), SUBJECT, north(VANTAGE, 5), 0).score;
    const far = alignmentTo(photo(), SUBJECT, north(VANTAGE, 25), 0).score;
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThanOrEqual(0);
  });

  it("describes distance coarsely, never to the metre", () => {
    const words = alignmentWords(alignmentTo(photo(), SUBJECT, north(VANTAGE, 137), 0));
    expect(words).toMatch(/^About \d+0m away$/);
  });
});
