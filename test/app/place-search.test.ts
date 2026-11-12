import { describe, expect, it } from "vitest";
import { searchCities, searchEchoes, searchPlaces, startsAWord } from "../../apps/prototype/src/place-search";
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

  // Houston is a City Pass city before its echoes are approved (2026-11-11), so these stand
  // in for them: one downtown, one at Space Center Houston, 35km out and still Houston.
  it("finds Houston as one city, by name and by what people type for it", () => {
    const at = (id: string, lat: number, lng: number, place: string) =>
      ({ ...LIBRARY[0]!, id, point: { ...LIBRARY[0]!.point, at: { lat, lng }, place } });
    const houston = [
      at("downtown", 29.76, -95.372, "Market Square, Houston, Texas"),
      at("nasa", 29.5519, -95.0983, "Space Center Houston, 1601 NASA Parkway, Clear Lake, Texas"),
    ];
    for (const q of ["houston", "Houston", "htx", "h-town", "houston tx", "houston, texas"]) {
      const hits = searchCities(q, new Map(), houston);
      expect(hits.map((h) => h.label)).toEqual(["Houston"]);
      expect(hits[0]?.pass).toBe(true);
      expect(hits[0]?.detail).toBe("2 echoes");
    }
  });

  it("leaves the first run's list as it was", () => {
    expect(searchPlaces("boston", new Map(), LIBRARY).map((h) => h.label)[0]).toBe("Boston");
  });
});

// "ne" found St. Augustine, because "ne" is inside "Augustine" (2026-11-10). Word starts only.
describe("matching on the start of a word", () => {
  it("matches the start of any word, and across the words after it", () => {
    expect(startsAWord("New York", "ne")).toBe(true);
    expect(startsAWord("New York", "new yo")).toBe(true);
    expect(startsAWord("St. Augustine", "aug")).toBe(true);
    expect(startsAWord("St. Augustine", "st. aug")).toBe(true);
  });

  it("does not match inside a word", () => {
    expect(startsAWord("St. Augustine", "ne")).toBe(false);
    expect(startsAWord("St. Augustine", "gustine")).toBe(false);
    expect(startsAWord("Money for nothing", "ney")).toBe(false);
  });

  it("does not offer St. Augustine for \"ne\"", () => {
    const all = [
      ...searchCities("ne", new Map(), LIBRARY, 50).map((h) => h.label),
      ...searchPlaces("ne", new Map(), LIBRARY, 50).map((h) => h.label),
    ];
    expect(all).not.toContain("St. Augustine");
    expect(all).toContain("New York");
  });

  it("offers no echo for letters from the middle of a word, however many", () => {
    expect(searchEchoes("ugustine", LIBRARY)).toEqual([]);
  });
});
