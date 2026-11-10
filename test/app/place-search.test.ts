import { describe, expect, it } from "vitest";
import { searchPlaces } from "../../apps/prototype/src/place-search";
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
