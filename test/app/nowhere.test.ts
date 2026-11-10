import { describe, expect, it } from "vitest";
import { coarse, reach, townOf, widenTo } from "../../apps/prototype/src/Nowhere";

const NBSP = " ";

describe("Nothing within: the words", () => {
  it("writes a distance as the app does, with a space that does not break", () => {
    expect(reach(2.4)).toBe(`2.4${NBSP}km`);
    expect(reach(5)).toBe(`5${NBSP}km`);
    expect(reach(0.5)).toBe(`500${NBSP}m`);
    expect(reach(16)).toBe(`16${NBSP}km`);
    expect(coarse(4.83)).toBe(`4.8${NBSP}km`);
    expect(coarse(150.4)).toBe(`150${NBSP}km`);
    expect(coarse(1083)).toBe(`1,080${NBSP}km`);
  });

  it("names the town, never the street address", () => {
    expect(
      townOf("North end of Wrightsville Beach, near public Beach Access 2, 2698 North Lumina Avenue, Wrightsville Beach, North Carolina"),
    ).toBe("Wrightsville Beach");
    expect(townOf("Crescent Avenue, Charlotte, North Carolina")).toBe("Charlotte");
    expect(townOf("African Burial Ground, Duane Street, Manhattan")).toBe("Manhattan");
    expect(townOf("Kitty Hawk")).toBe("Kitty Hawk");
    expect(townOf("Seabreeze, on Myrtle Grove Sound north of Carolina Beach, North Carolina")).toBe("Carolina Beach");
    expect(townOf("Carolina Beach oceanfront by the fishing pier, North Carolina")).toBe("Carolina Beach");
    expect(townOf("Mississippi River bluff, Front Street, downtown Memphis, Tennessee")).toBe("downtown Memphis");
    expect(townOf("San Francisco National Cemetery, Lincoln Boulevard, Presidio of San Francisco, California")).toBe("Presidio of San Francisco");
  });
});

describe("Look out to: far enough for the nearest echo, and no further", () => {
  it("reaches just past it", () => {
    // James, 2026-11-10: "Look out to 16km" with the nearest echo 4.8 km off.
    expect(widenTo(4.8)).toBe(5);
    expect(widenTo(4.97)).toBe(6);
    expect(widenTo(2.6)).toBe(3);
    expect(widenTo(12.3)).toBe(15);
    for (const km of [2.5, 4.8, 7.1, 9.99, 15.9]) expect(widenTo(km)).toBeGreaterThan(km);
  });
});
