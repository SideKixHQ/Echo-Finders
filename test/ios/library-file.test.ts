/**
 * The site's library on the phone, the pure half (`apps/ios/src/library-file.ts`): with
 * the screen locked the phone starts echoes the page's plan names, and for an echo added
 * after the build it needs the site's library (overnight item 19).
 */
import { describe, expect, it } from "vitest";
import type { Echo, LatLng, Route } from "@echofinders/core";
import type { PocketPlan } from "../../apps/prototype/src/native-bridge-protocol.js";
import {
  LIBRARY_REFRESH_MS,
  LIBRARY_RETRY_MS,
  mergeLibrary,
  missingIds,
  parseLibraryFile,
  shouldFetchLibrary,
} from "../../apps/ios/src/library-file.js";
import { PocketJudge, type PhoneFix } from "../../apps/ios/src/shell/logic.js";

const here: LatLng = { lat: 40.7049, lng: -74.0137 };

function echo(id: string, at: LatLng, title = `Echo ${id}`): Echo {
  return {
    id,
    title,
    point: { at, triggerRadiusKm: 0.05, place: "Bowling Green" },
    category: "history",
    era: "colonial",
    tone: "documentary",
    minAge: 0,
    durationS: 120,
    quality: 0.5,
    editorial: "approved",
    script: "",
    renders: [{ voiceId: "v", audioKey: `audio/${id}/v.mp3`, durationS: 120 }],
  } as unknown as Echo;
}

const route = (id: string) => ({ id, mode: "driving", origin: { name: "A" }, destination: { name: "B" } }) as unknown as Route;

function fix(at: LatLng, t: number): PhoneFix {
  return { coords: { latitude: at.lat, longitude: at.lng, accuracy: 8, speed: 0.5 }, timestamp: t };
}

describe("parseLibraryFile", () => {
  it("takes the site's file", () => {
    const file = parseLibraryFile({ v: 1, commit: "abc", echoes: [echo("a", here)], routes: [route("r")] });
    expect(file?.echoes.map((e) => e.id)).toEqual(["a"]);
    expect(file?.routes.map((r) => r.id)).toEqual(["r"]);
  });

  it("refuses anything else whole", () => {
    expect(parseLibraryFile(null)).toBeNull();
    expect(parseLibraryFile("x")).toBeNull();
    expect(parseLibraryFile({ v: 2, echoes: [echo("a", here)], routes: [] })).toBeNull();
    expect(parseLibraryFile({ v: 1, echoes: "no", routes: [] })).toBeNull();
    expect(parseLibraryFile({ v: 1, echoes: [], routes: [] })).toBeNull();
  });

  it("leaves out an echo it could not place, keeps the rest", () => {
    const bad = { id: "b", title: "B", point: { at: { lat: "x", lng: 0 }, triggerRadiusKm: 0.05 } };
    const file = parseLibraryFile({ v: 1, echoes: [echo("a", here), bad, { id: 3 }], routes: [route("r"), { id: "q" }] });
    expect(file?.echoes.map((e) => e.id)).toEqual(["a"]);
    expect(file?.routes.map((r) => r.id)).toEqual(["r"]);
  });
});

describe("mergeLibrary", () => {
  const built = { echoes: [echo("old", here, "Built telling"), echo("gone", here)], routes: [route("r1")] };

  it("is the built in library with nothing fetched (no signal, nothing kept)", () => {
    expect(mergeLibrary(built, null)).toBe(built);
  });

  it("adds echoes and routes the site has since, and the site's telling wins", () => {
    const fetched = { echoes: [echo("old", here, "Site telling"), echo("new", here)], routes: [route("r1"), route("r2")] };
    const merged = mergeLibrary(built, fetched);
    expect(merged.echoes.map((e) => e.id).sort()).toEqual(["gone", "new", "old"]);
    expect(merged.echoes.find((e) => e.id === "old")?.title).toBe("Site telling");
    expect(merged.routes.map((r) => r.id).sort()).toEqual(["r1", "r2"]);
  });
});

describe("an echo added after the build, with the screen locked", () => {
  const plan: PocketPlan = { handsFree: true, mode: "walking", plays: ["new"], captured: [], current: null, waiting: [] };
  const walk = (judge: PocketJudge) => [0, 2000, 4000, 6000].flatMap((dt) => judge.update([fix(here, 1_000_000 + dt)]).map((e) => e.id));

  it("cannot start from the built in library alone", () => {
    const built = { echoes: [echo("old", { lat: 40.8, lng: -74 })], routes: [] };
    expect(missingIds(built.echoes, plan.plays)).toEqual(["new"]);
    expect(walk(new PocketJudge(plan, mergeLibrary(built, null).echoes, "2026-11-14T00:00:00Z"))).toEqual([]);
  });

  it("starts once the site's library is in", () => {
    const built = { echoes: [echo("old", { lat: 40.8, lng: -74 })], routes: [] };
    const fetched = parseLibraryFile({ v: 1, echoes: [echo("old", { lat: 40.8, lng: -74 }), echo("new", here)], routes: [] });
    const library = mergeLibrary(built, fetched).echoes;
    expect(missingIds(library, plan.plays)).toEqual([]);
    expect(walk(new PocketJudge(plan, library, "2026-11-14T00:00:00Z"))).toEqual(["new"]);
  });
});

describe("shouldFetchLibrary", () => {
  const now = 10_000_000;
  it("fetches at first, then not again until it is stale", () => {
    expect(shouldFetchLibrary({ lastFetchMs: Number.NEGATIVE_INFINITY, inFlight: false }, now, false)).toBe(true);
    expect(shouldFetchLibrary({ lastFetchMs: now - 1000, inFlight: false }, now, false)).toBe(false);
    expect(shouldFetchLibrary({ lastFetchMs: now - LIBRARY_REFRESH_MS, inFlight: false }, now, false)).toBe(true);
  });
  it("fetches soon when a plan names an echo it lacks, at most once a minute", () => {
    expect(shouldFetchLibrary({ lastFetchMs: now - LIBRARY_RETRY_MS, inFlight: false }, now, true)).toBe(true);
    expect(shouldFetchLibrary({ lastFetchMs: now - 1000, inFlight: false }, now, true)).toBe(false);
  });
  it("never twice at once", () => {
    expect(shouldFetchLibrary({ lastFetchMs: Number.NEGATIVE_INFINITY, inFlight: true }, now, true)).toBe(false);
  });
});
