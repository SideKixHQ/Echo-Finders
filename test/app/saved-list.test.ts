import { describe, expect, it } from "vitest";
import type { Echo } from "@echofinders/core";
import { savedList } from "../../apps/prototype/src/saved-list";

const echo = (id: string, lat: number, lng: number) => ({ id, point: { at: { lat, lng } } }) as unknown as Echo;
const WILMINGTON = { lat: 34.2257, lng: -77.9447 };
const near = echo("manly", 34.2335, -77.9485);
const boston = echo("cows", 42.355, -71.0656);
const byId = new Map([near, boston].map((e) => [e.id, e]));

describe("the saved list in My Echoes", () => {
  it("holds every saved echo, a city away as well as on the journey", () => {
    expect(savedList(["cows", "manly"], byId, WILMINGTON).map((e) => e.id)).toEqual(["manly", "cows"]);
  });

  it("puts the nearest first", () => {
    expect(savedList(["manly", "cows"], byId, { lat: 42.36, lng: -71.06 }).map((e) => e.id)).toEqual(["cows", "manly"]);
  });

  it("keeps the order saved without a fix, and drops ids no longer in the library", () => {
    expect(savedList(["cows", "gone", "manly"], byId, null).map((e) => e.id)).toEqual(["cows", "manly"]);
  });
});
