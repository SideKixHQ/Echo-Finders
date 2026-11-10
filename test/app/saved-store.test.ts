import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readSaved, toggleSaved, writeSaved } from "../../apps/prototype/src/saved-store";

const KEY = "echo-finders:saved";
let items: Map<string, string>;
const original = (globalThis as { localStorage?: Storage }).localStorage;

beforeEach(() => {
  items = new Map();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
  };
});
afterEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = original;
});

describe("the saved store", () => {
  it("is empty on a new device", () => {
    expect([...readSaved()]).toEqual([]);
  });

  it("keeps what was saved across a reload", () => {
    writeSaved(new Set(["cows", "manly"]));
    expect([...readSaved()]).toEqual(["cows", "manly"]);
  });

  it("saves, and unsaves what was saved", () => {
    const once = toggleSaved(new Set(), "cows");
    expect([...once]).toEqual(["cows"]);
    expect([...toggleSaved(once, "cows")]).toEqual([]);
  });

  it("does not change the set it was given", () => {
    const before = new Set(["cows"]);
    toggleSaved(before, "manly");
    expect([...before]).toEqual(["cows"]);
  });

  it("reads a corrupt or foreign value as nothing saved, and drops anything not an id", () => {
    items.set(KEY, "{not json");
    expect([...readSaved()]).toEqual([]);
    items.set(KEY, JSON.stringify({ cows: true }));
    expect([...readSaved()]).toEqual([]);
    items.set(KEY, JSON.stringify(["cows", 7, null]));
    expect([...readSaved()]).toEqual(["cows"]);
  });

  it("survives storage that throws, as private browsing does", () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect([...readSaved()]).toEqual([]);
    expect(() => writeSaved(new Set(["cows"]))).not.toThrow();
  });
});
