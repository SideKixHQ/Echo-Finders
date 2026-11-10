import { describe, expect, it } from "vitest";
import { farAway, listenLength, tooFarToWalk, WALKABLE_KM } from "../../apps/prototype/src/going";

describe("too far to walk", () => {
  it("is past the walkable cap, the same one the directions use", () => {
    expect(WALKABLE_KM).toBe(20);
    expect(tooFarToWalk(1083)).toBe(true);
    expect(tooFarToWalk(20.5)).toBe(true);
    expect(tooFarToWalk(20)).toBe(false);
    expect(tooFarToWalk(0.4)).toBe(false);
  });

  it("is not decided without a fix", () => {
    expect(tooFarToWalk(null)).toBe(false);
  });

  it("says the distance plainly", () => {
    expect(farAway(1083.4)).toBe("1,083 km away");
    expect(farAway(21.6)).toBe("22 km away");
  });
});

describe("listening length", () => {
  it("says it is a listen, never a clock that reads like travel time", () => {
    expect(listenLength(59)).toBe("1 min listen");
    expect(listenLength(10)).toBe("1 min listen");
    expect(listenLength(185)).toBe("3 min listen");
    expect(listenLength(59)).not.toMatch(/\d:\d\d/);
  });
});
