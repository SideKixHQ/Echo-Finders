import { describe, expect, it } from "vitest";
import { COUNTRY_REACH_KM, countryAt, type CountryOutline } from "../src/index.js";

// A square country one degree a side at the equator (about 111 km), with a lake in it.
const square: CountryOutline = {
  name: "Square",
  bbox: [0, 0, 1, 1],
  polygons: [
    [
      [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]],
      [[0.4, 0.4], [0.6, 0.4], [0.6, 0.6], [0.4, 0.6], [0.4, 0.4]],
    ],
  ],
};
const east: CountryOutline = { name: "East", bbox: [2, 0, 3, 1], polygons: [[[[2, 0], [3, 0], [3, 1], [2, 1], [2, 0]]]] };

describe("which country a point is in", () => {
  it("is the outline it is inside", () => {
    expect(countryAt({ lat: 0.2, lng: 0.2 }, [square, east])).toBe("Square");
    expect(countryAt({ lat: 0.5, lng: 2.5 }, [square, east])).toBe("East");
  });

  it("is the nearest outline just off a coast the outline left out, and none past reach", () => {
    // 0.1 degree east of Square's edge is about 11 km: within reach.
    expect(countryAt({ lat: 0.5, lng: 1.1 }, [square, east])).toBe("Square");
    // Mid way between the two, 55 km from each: past reach, the open sea.
    expect(COUNTRY_REACH_KM).toBeLessThan(55);
    expect(countryAt({ lat: 0.5, lng: 1.5 }, [square, east])).toBeNull();
  });

  it("knows a lake is not the land around it, but it is still that country by reach", () => {
    expect(countryAt({ lat: 0.5, lng: 0.5 }, [square])).toBe("Square");
  });

  it("is nothing where no outline is given", () => {
    expect(countryAt({ lat: 40, lng: -75 }, [square, east])).toBeNull();
  });
});
