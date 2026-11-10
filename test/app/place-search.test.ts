import { describe, expect, it } from "vitest";
import { searchCities, searchEchoes, searchPlaces } from "../../apps/prototype/src/place-search";
import { LIBRARY } from "../../apps/prototype/src/library.generated";

const find = (q: string) => searchPlaces(q, new Map(), LIBRARY, 6);
const labels = (q: string) => find(q).map((h) => h.label);

// James, 2026-11-10: "i see more than one boston, and washington dc shows up as dc. i dont
// see new york at all."
describe("searching for a city", () => {
  it("finds New York, by name and by what people type for it", () => {
    for (const q of ["new york", "New York", "nyc", "manhattan"]) expect(labels(q)[0]).toBe("New York");
  });

  it("lists Boston once, with Fort Warren folded into it", () => {
    const towns = find("boston").filter((h) => / echoe?s?$/.test(h.detail));
    expect(towns.map((h) => h.label)).toEqual(["Boston"]);
    expect(labels("boston")).not.toContain("Boston Harbor Islands");
  });

  it("calls Washington by its name, and finds it from DC", () => {
    expect(labels("washington")[0]).toBe("Washington, DC");
    expect(labels("dc")[0]).toBe("Washington, DC");
  });

  it("does not offer Boston buildings for Washington because of the street they are on", () => {
    expect(find("washington").some((h) => /Boston/.test(h.detail))).toBe(false);
  });

  it("still finds the towns of the Cape Fear Coast by their own names", () => {
    expect(labels("wilmington")[0]).toBe("Wilmington");
    expect(labels("southport")[0]).toBe("Southport");
  });

  it("finds every City Pass city", () => {
    for (const name of ["Savannah", "Charleston", "New Orleans", "Philadelphia", "Boston"]) {
      expect(labels(name.toLowerCase())[0]).toBe(name);
    }
  });
});

// The map's search (2026-11-10): cities above, echoes under them with Go and Save.
describe("the map's search", () => {
  it("lists cities and says which have a City Pass", () => {
    const ny = searchCities("new york", new Map(), LIBRARY)[0];
    expect(ny?.label).toBe("New York");
    expect(ny?.pass).toBe(true);
    expect(searchCities("wilmington", new Map(), LIBRARY)[0]?.pass).toBe(true);
  });

  it("finds echoes by title, with the town they are in", () => {
    const echo = LIBRARY.find((e) => e.title.length > 8)!;
    const hits = searchEchoes(echo.title.slice(0, 8), LIBRARY);
    expect(hits.map((h) => h.echo.id)).toContain(echo.id);
    expect(hits.every((h) => h.town.length > 0)).toBe(true);
  });

  it("puts titles that start with what was typed first", () => {
    const hits = searchEchoes("the", LIBRARY);
    expect(hits[0]?.echo.title.toLowerCase().startsWith("the")).toBe(true);
  });

  it("offers no echoes for a ZIP code", () => {
    expect(searchEchoes("28401", LIBRARY)).toEqual([]);
  });

  it("leaves the first run's list as it was", () => {
    expect(searchPlaces("boston", new Map(), LIBRARY).map((h) => h.label)[0]).toBe("Boston");
  });
});
