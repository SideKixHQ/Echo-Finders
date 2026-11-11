import { describe, expect, it } from "vitest";
import type { WalkGuidance } from "@echofinders/core";
import { directionsLine } from "../../apps/prototype/src/DirectionsBar";

const g = (seconds: number) =>
  ({ metres: 1400, seconds, streets: true, say: "Head west", inM: 1400, glyph: "straight" }) as unknown as WalkGuidance;
const NOW = Date.UTC(2026, 10, 10, 22, 40, 0);

describe("the echo bar's line while walking (board DirC)", () => {
  it("is how long and when, with no distance: the turn card has that", () => {
    const line = directionsLine(g(18 * 60), undefined, NOW);
    expect(line[0]).toBe("18 min");
    expect(line[1]).toMatch(/^arrive \d{1,2}:\d\d/);
    expect(line.join(" · ")).not.toMatch(/km|\bm\b/);
  });

  it("says which stop and how long on a planned or guided walk, with no clock", () => {
    expect(directionsLine(g(3 * 60), { at: 1, of: 6 }, NOW)).toEqual(["Stop 1 of 6", "3 min"]);
  });

  it("while the way is being found, says so", () => {
    expect(directionsLine(null, undefined, NOW)).toEqual(["Finding the way"]);
  });

  it("has no dashes", () => {
    expect(directionsLine(g(65 * 60), { at: 2, of: 8 }, NOW).join(" · ")).not.toMatch(/[-–—]/);
  });
});
