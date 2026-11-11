import { describe, expect, it } from "vitest";
import { CONTINENTAL_US, countryFrame, inContinentalUS } from "../../apps/prototype/src/country-view";
import { LIBRARY } from "../../apps/prototype/src/library.generated";

const SAN_FRANCISCO = { lat: 37.7749, lng: -122.4194 };
const WILMINGTON = { lat: 34.2257, lng: -77.9447 };
const KEY_WEST = { lat: 24.5551, lng: -81.78 };
const EDINBURGH = { lat: 55.9533, lng: -3.1883 };
const LONDON = { lat: 51.5072, lng: -0.1276 };
const HONOLULU = { lat: 21.3069, lng: -157.8583 };

describe("The country view", () => {
  it("knows the lower 48 from abroad, Alaska and Hawaii", () => {
    for (const at of [SAN_FRANCISCO, WILMINGTON, KEY_WEST]) expect(inContinentalUS(at)).toBe(true);
    for (const at of [EDINBURGH, LONDON, HONOLULU, { lat: 61.2181, lng: -149.9003 }]) expect(inContinentalUS(at)).toBe(false);
  });

  it("frames the echoes in the US and leaves Edinburgh and London out of the box", () => {
    expect(countryFrame([SAN_FRANCISCO, WILMINGTON, EDINBURGH, LONDON, KEY_WEST])).toEqual({
      south: KEY_WEST.lat,
      west: SAN_FRANCISCO.lng,
      north: SAN_FRANCISCO.lat,
      east: WILMINGTON.lng,
    });
  });

  it("falls back to the whole country when there is nothing in it", () => {
    expect(countryFrame([])).toEqual(CONTINENTAL_US);
    expect(countryFrame([EDINBURGH])).toEqual(CONTINENTAL_US);
  });

  it("frames the library coast to coast, not one city", () => {
    const box = countryFrame(LIBRARY.map((e) => e.point.at));
    // San Francisco to New England: the whole width, whatever gets added in between.
    expect(box.west).toBeLessThan(-120);
    expect(box.east).toBeGreaterThan(-75);
    expect(box.north).toBeLessThanOrEqual(CONTINENTAL_US.north);
    expect(box.east).toBeLessThanOrEqual(CONTINENTAL_US.east);
  });
});
