import { describe, expect, it } from "vitest";
import { countryAt } from "@echofinders/core";
import { COUNTRIES } from "../../apps/prototype/src/countries.generated";
import { LIBRARY } from "../../apps/prototype/src/library.generated";

/*
 * Picking a topic fits its echoes in the country the map is looking at (James, 2026-11-13).
 * The outlines are Natural Earth's, for the countries the library has echoes in.
 */
const US = "United States of America";
const UK = "United Kingdom";

describe("the library's countries", () => {
  it("puts every echo in a country", () => {
    const none = LIBRARY.filter((e) => !countryAt(e.point.at, COUNTRIES)).map((e) => e.id);
    expect(none).toEqual([]);
  });

  it("knows Philadelphia, Key West and Bald Head Island are in the US", () => {
    expect(countryAt({ lat: 39.9526, lng: -75.1635 }, COUNTRIES)).toBe(US);
    expect(countryAt({ lat: 24.5551, lng: -81.78 }, COUNTRIES)).toBe(US);
    expect(countryAt({ lat: 33.85, lng: -77.96 }, COUNTRIES)).toBe(US);
  });

  it("counts England and Scotland as one country, the United Kingdom", () => {
    expect(countryAt({ lat: 51.5072, lng: -0.1276 }, COUNTRIES)).toBe(UK);
    expect(countryAt({ lat: 55.9533, lng: -3.1883 }, COUNTRIES)).toBe(UK);
    const abroad = LIBRARY.filter((e) => countryAt(e.point.at, COUNTRIES) === UK).map((e) => e.id).sort();
    expect(abroad).toEqual(["the-girl-who-wanted-her-doll", "the-queen-in-the-wrong-corridor", "the-queen-who-returns"]);
  });

  it("is no country mid Atlantic, or in a country with no echoes yet", () => {
    expect(countryAt({ lat: 40, lng: -40 }, COUNTRIES)).toBeNull();
    expect(countryAt({ lat: 48.8566, lng: 2.3522 }, COUNTRIES)).toBeNull();
  });
});
