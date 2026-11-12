/**
 * The iPhone app's download packs, the pure half (`apps/ios/src/packs/plan.ts`): what a pack
 * holds, what it weighs before and after, and what an update fetches and drops.
 *
 * Run from the root suite because the iPhone app sits outside the npm workspace and has no
 * test runner of its own; `plan.ts` imports nothing but the engine, so it runs here as is.
 */
import { describe, expect, it } from "vitest";
import { CITIES, type Echo, type Route } from "@echofinders/core";
import {
  AUDIO_ORIGIN,
  FALLBACK_ECHO_BYTES,
  applyDiff,
  diffPack,
  echoCount,
  fileNameForKey,
  formatBytes,
  formatMbPair,
  manifestFor,
  maySaveNow,
  orphanedKeys,
  packIdOf,
  parseManifest,
  pendingParts,
  planPack,
  progressOf,
  registerPartPlanner,
  runPool,
  savedLine,
  savedWhen,
  withPartSaved,
  type PackPartPlanner,
} from "../../apps/ios/src/packs/plan.js";

const capeFear = CITIES.find((c) => c.id === "cape-fear")!;
const newYork = CITIES.find((c) => c.id === "new-york")!;

function echo(id: string, at: { lat: number; lng: number }, opts: { bytes?: number; key?: string; status?: Echo["editorial"]; speech?: boolean } = {}): Echo {
  const audioKey = opts.speech ? `speech/${id}` : (opts.key ?? `audio/${id}/v1.mp3`);
  return {
    id,
    title: id,
    point: { at, triggerRadiusKm: 1 },
    editorial: opts.status ?? "approved",
    renders: [{ voiceId: "v1", audioKey, durationS: 60, ...(opts.bytes !== undefined ? { audioBytes: opts.bytes } : {}) }],
  } as unknown as Echo;
}

// Wilmington is inside Cape Fear; Manhattan inside New York.
const WILMINGTON = { lat: 34.2357, lng: -77.9452 };
const MANHATTAN = { lat: 40.7128, lng: -74.006 };
const library: Echo[] = [
  echo("w-one", WILMINGTON, { bytes: 1_000_000 }),
  echo("w-two", { lat: 34.24, lng: -77.95 }),
  echo("w-draft", WILMINGTON, { status: "draft", bytes: 5 }),
  echo("w-speech", WILMINGTON, { speech: true }),
  echo("nyc", MANHATTAN, { bytes: 2_000_000 }),
];

describe("planning a pack", () => {
  it("holds the approved, recorded echoes of its city, and no other", () => {
    const plan = planPack({ kind: "city", city: capeFear }, library, []);
    expect(plan.id).toBe("city-cape-fear");
    expect(plan.name).toBe("Cape Fear Coast");
    expect(plan.echoIds).toEqual(["w-one", "w-two"]);
    expect(plan.parts.map((p) => p.url)).toEqual([
      `${AUDIO_ORIGIN}/audio/w-one/v1.mp3`,
      `${AUDIO_ORIGIN}/audio/w-two/v1.mp3`,
    ]);
  });

  it("estimates from audioBytes, and 1.3 MB an echo where the library has none", () => {
    const plan = planPack({ kind: "city", city: capeFear }, library, []);
    expect(plan.parts.map((p) => p.estimatedBytes)).toEqual([1_000_000, FALLBACK_ECHO_BYTES]);
    expect(plan.estimatedBytes).toBe(1_000_000 + FALLBACK_ECHO_BYTES);
  });

  it("holds a route's corridor, in the order you pass them", () => {
    const route = {
      id: "test-drive",
      mode: "driving",
      origin: { name: "A", at: { lat: 34.2, lng: -77.95 }, timeZone: "America/New_York" },
      destination: { name: "B", at: { lat: 34.3, lng: -77.95 }, timeZone: "America/New_York" },
      waypoints: [
        { name: "A", at: { lat: 34.2, lng: -77.95 } },
        { name: "B", at: { lat: 34.3, lng: -77.95 } },
      ],
      departureAt: "2026-11-11T09:00:00-05:00",
      durationS: 3600,
    } as unknown as Route;
    const plan = planPack({ kind: "route", route }, library, []);
    expect(plan.id).toBe("route-test-drive");
    expect(plan.name).toBe("A to B");
    expect(plan.echoIds).toEqual(["w-one", "w-two"]);
  });

  it("takes extra parts from a registered planner, for the map's tiles", () => {
    const tiles: PackPartPlanner = (source) =>
      source.kind === "city" ? [{ kind: "tiles", key: "map/echoes/8-1-2.pmtiles", url: "https://x/8-1-2.pmtiles", estimatedBytes: 500 }] : [];
    const unregister = registerPartPlanner(tiles);
    try {
      const plan = planPack({ kind: "city", city: capeFear }, library);
      expect(plan.parts.at(-1)).toMatchObject({ kind: "tiles", key: "map/echoes/8-1-2.pmtiles" });
      expect(plan.estimatedBytes).toBe(1_000_000 + FALLBACK_ECHO_BYTES + 500);
    } finally {
      unregister();
    }
    expect(planPack({ kind: "city", city: capeFear }, library).parts).toHaveLength(2);
  });

  it("names packs and files safely", () => {
    expect(packIdOf({ kind: "area", area: { id: "a b/c", name: "x", centre: WILMINGTON, radiusKm: 1 } })).toBe("area-a_b_c");
    expect(fileNameForKey("audio/w-one/v1.mp3")).toBe("audio_w-one_v1.mp3");
  });
});

describe("saving", () => {
  it("counts real sizes as files land, and is saved when the last does", () => {
    const plan = planPack({ kind: "city", city: capeFear }, library, []);
    let m = manifestFor(plan, 1000);
    expect(m.state).toBe("saving");
    expect(pendingParts(m)).toHaveLength(2);
    m = withPartSaved(m, "audio/w-one/v1.mp3", 999_000, 2000);
    expect(m.state).toBe("saving");
    expect(m.bytes).toBe(999_000);
    expect(progressOf(m)).toEqual({ savedBytes: 999_000, totalBytes: 999_000 + FALLBACK_ECHO_BYTES, fraction: 999_000 / (999_000 + FALLBACK_ECHO_BYTES) });
    m = withPartSaved(m, "audio/w-two/v1.mp3", 1_200_000, 3000);
    expect(m.state).toBe("saved");
    expect(m.savedAt).toBe(3000);
    expect(m.bytes).toBe(2_199_000);
    expect(pendingParts(m)).toHaveLength(0);
  });

  it("calls a pack with nothing in it saved, rather than saving for ever", () => {
    const empty = manifestFor(planPack({ kind: "area", area: { id: "sea", name: "Open sea", centre: { lat: 0, lng: 0 }, radiusKm: 1 } }, library, []), 5);
    expect(empty.state).toBe("saved");
    expect(empty.savedAt).toBe(5);
  });

  it("reads back what it wrote, and refuses what it cannot use", () => {
    const m = withPartSaved(manifestFor(planPack({ kind: "city", city: capeFear }, library, []), 1), "audio/w-one/v1.mp3", 10, 2);
    expect(parseManifest(JSON.parse(JSON.stringify(m)))).toEqual(m);
    expect(parseManifest({ ...m, version: 99 })).toBeNull();
    expect(parseManifest("nonsense")).toBeNull();
  });

  it("saves on Wi-Fi, on cellular only when allowed, never with no connection", () => {
    expect(maySaveNow("wifi", true)).toBe(true);
    expect(maySaveNow("cellular", true)).toBe(false);
    expect(maySaveNow("cellular", false)).toBe(true);
    expect(maySaveNow("none", false)).toBe(false);
  });

  it("runs a few at a time, carries on past a failure, and stops when told", async () => {
    let running = 0;
    let peak = 0;
    const done: number[] = [];
    const { failed } = await runPool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 2));
      running--;
      if (n === 4) throw new Error("bad file");
      done.push(n);
    });
    expect(peak).toBe(3);
    expect(failed).toEqual([4]);
    expect(done.sort()).toEqual([1, 2, 3, 5, 6, 7]);

    const signal = { aborted: false };
    const started: number[] = [];
    await runPool([1, 2, 3, 4, 5], 1, async (n) => {
      started.push(n);
      if (n === 2) signal.aborted = true;
    }, signal);
    expect(started).toEqual([1, 2]);
  });
});

describe("updating a saved pack", () => {
  const saved = () => {
    const plan = planPack({ kind: "city", city: capeFear }, library, []);
    let m = manifestFor(plan, 1);
    m = withPartSaved(m, "audio/w-one/v1.mp3", 1_000_000, 2);
    return withPartSaved(m, "audio/w-two/v1.mp3", 1_250_000, 3);
  };

  it("finds nothing to do when the library has not moved", () => {
    const m = saved();
    const diff = diffPack(m, planPack({ kind: "city", city: capeFear }, library, []));
    expect(diff).toEqual({ added: [], removed: [], changed: [], unchanged: 2 });
  });

  it("adds a new echo, drops a retired one, and refetches a re-voiced one", () => {
    const m = saved();
    const next = [
      echo("w-one", WILMINGTON, { bytes: 1_000_000, key: "audio/w-one/v2.mp3" }), // new voice
      echo("w-two", { lat: 34.24, lng: -77.95 }, { status: "retired" }), // retired
      echo("w-three", WILMINGTON, { bytes: 700_000 }), // new
    ];
    const plan = planPack({ kind: "city", city: capeFear }, next, []);
    const diff = diffPack(m, plan);
    expect(diff.added.map((p) => p.key)).toEqual(["audio/w-one/v2.mp3", "audio/w-three/v1.mp3"]);
    expect(diff.removed).toEqual(["audio/w-one/v1.mp3", "audio/w-two/v1.mp3"]);

    const updated = applyDiff(m, plan, diff, 10);
    expect(updated.state).toBe("saving");
    expect(updated.echoIds).toEqual(["w-one", "w-three"]);
    expect(updated.savedAt).toBe(3);
    expect(pendingParts(updated).map((p) => p.key)).toEqual(["audio/w-one/v2.mp3", "audio/w-three/v1.mp3"]);
  });

  it("refetches a file re-rendered in the same voice, by its measured size", () => {
    const m = saved();
    const next = [echo("w-one", WILMINGTON, { bytes: 1_100_000 }), echo("w-two", { lat: 34.24, lng: -77.95 })];
    const diff = diffPack(m, planPack({ kind: "city", city: capeFear }, next, []));
    expect(diff.changed.map((p) => p.key)).toEqual(["audio/w-one/v1.mp3"]);
    expect(diff.unchanged).toBe(1); // w-two has no measured size, so only its key counts
  });

  it("keeps a file another pack still holds", () => {
    const city = saved();
    const nyc = manifestFor(planPack({ kind: "city", city: newYork }, library, []), 1);
    expect(orphanedKeys([nyc], city.parts.map((p) => p.key))).toEqual(["audio/w-one/v1.mp3", "audio/w-two/v1.mp3"]);
    expect(orphanedKeys([nyc, city], ["audio/w-one/v1.mp3", "audio/gone/v1.mp3"])).toEqual(["audio/gone/v1.mp3"]);
  });
});

describe("the words on screen", () => {
  it("says sizes as iPhone Storage does", () => {
    expect(formatBytes(0)).toBe("0 MB");
    expect(formatBytes(1_300_000)).toBe("1.3 MB");
    expect(formatBytes(85_400_000)).toBe("85 MB");
    expect(formatBytes(41_000_000_000)).toBe("41 GB");
    expect(formatBytes(1_500_000_000)).toBe("1.5 GB");
    expect(formatMbPair(41_200_000, 85_000_000)).toBe("41 of 85 MB");
    expect(formatMbPair(400_000_000, 1_200_000_000)).toBe("0.4 of 1.2 GB");
  });

  it("says when, and how many echoes", () => {
    const now = new Date(2026, 10, 11, 15).getTime();
    expect(savedWhen(new Date(2026, 10, 11, 1).getTime(), now)).toBe("saved today");
    expect(savedWhen(new Date(2026, 10, 10, 23).getTime(), now)).toBe("saved yesterday");
    expect(savedWhen(new Date(2026, 10, 3, 12).getTime(), now)).toBe("saved 3 Nov");
    expect(echoCount(1)).toBe("1 echo");
    expect(echoCount(216)).toBe("216 echoes");
  });

  it("writes the saved line with no dashes", () => {
    const plan = planPack({ kind: "city", city: capeFear }, library, []);
    const m = withPartSaved(withPartSaved(manifestFor(plan, 1), "audio/w-one/v1.mp3", 150_000_000, 2), "audio/w-two/v1.mp3", 150_000_000, Date.now());
    const line = savedLine(m, Date.now());
    expect(line).toBe("2 echoes · 300 MB · saved today");
    expect(line).not.toMatch(/[–—]|\s-\s/);
  });
});
