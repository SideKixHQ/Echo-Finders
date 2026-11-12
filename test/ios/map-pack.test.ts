/**
 * The iPhone app's map in a download pack, the pure half (`apps/ios/src/mapPack.ts`): the
 * street squares a pack covers, the files every pack shares and how they are kept once and
 * freed last, and which address the map reads each file from.
 *
 * Run from the root suite, as `packs.test.ts` is: `mapPack.ts` imports nothing but the
 * engine and the packs' own pure half.
 */
import { describe, expect, it } from "vitest";
import { CITIES, type Echo } from "@echofinders/core";
import {
  COAST_KEY,
  FALLBACK_SQUARE_BYTES,
  GLYPH_RANGES,
  KNOWN_BYTES,
  WORLD_KEY,
  chooseMapAddresses,
  fontstackAlias,
  fontstacksOf,
  glyphKey,
  glyphKeys,
  localGlyphTemplate,
  mapPartsFor,
  mapSquares,
  sharedMapKeys,
  siteUrlOf,
  squareKey,
  squareOfKey,
  squaresAround,
  squaresFor,
  tileOf,
  type MapPackKnowledge,
} from "../../apps/ios/src/mapPack.js";
import {
  AUDIO_ORIGIN,
  bytesToSave,
  fileNameForKey,
  manifestFor,
  onPartPlannersChanged,
  orphanedKeys,
  partPlannersChanged,
  partPlannersReady,
  planPack,
  registerPartPlanner,
  savedBytesOf,
  withPartSaved,
  type PackManifest,
  type PackPlan,
} from "../../apps/ios/src/packs/plan.js";
import { basemapStyle, FONT } from "../../apps/prototype/src/basemap-style.js";

const FONTS = ["Noto Sans Medium"];

function echo(id: string, at: { lat: number; lng: number }, radiusKm = 0.2): Echo {
  return {
    id,
    title: id,
    point: { at, triggerRadiusKm: radiusKm },
    editorial: "approved",
    renders: [{ voiceId: "v1", audioKey: `audio/${id}/v1.mp3`, durationS: 60, audioBytes: 1_000_000 }],
  } as unknown as Echo;
}

// Wilmington, NC, is well inside zoom 8 square 8-72-102 (x 72.5, y 102.6).
const WILMINGTON = { lat: 34.2357, lng: -77.9452 };
// x = 72 exactly at lng -78.75; a point just east of it, 2 km in, sits by the west edge.
const BY_AN_EDGE = { lat: 34.2357, lng: -78.74 };

describe("which street squares a pack covers", () => {
  it("finds the zoom 8 square under a point", () => {
    expect(tileOf(WILMINGTON)).toEqual({ x: 72, y: 102 });
    expect(tileOf({ lat: 0, lng: 0 })).toEqual({ x: 128, y: 128 });
    expect(tileOf({ lat: 89, lng: 180 })).toEqual({ x: 0, y: 0 });
  });

  it("takes only the square under an echo whose circle stays inside it", () => {
    expect(squaresAround(WILMINGTON, 0.5)).toEqual(["8-72-102"]);
  });

  it("takes the neighbour when an echo's circle crosses an edge", () => {
    expect(squaresAround(BY_AN_EDGE, 0.2)).toEqual(["8-72-102"]);
    expect(squaresAround(BY_AN_EDGE, 3)).toEqual(["8-71-102", "8-72-102"]);
  });

  it("wraps across the antimeridian", () => {
    expect(squaresAround({ lat: 0.5, lng: 179.99 }, 5)).toEqual(["8-255-127", "8-0-127"]);
  });

  it("keeps only the squares the site has, in its order, once each", () => {
    const echoes = [echo("a", WILMINGTON), echo("b", BY_AN_EDGE, 3), echo("c", { lat: 34.24, lng: -77.95 })];
    expect(squaresFor(echoes, ["8-40-98", "8-72-102", "8-71-102"])).toEqual(["8-72-102", "8-71-102"]);
    expect(squaresFor(echoes, ["8-40-98"])).toEqual([]);
  });

  it("draws a saved square the site no longer lists", () => {
    expect(mapSquares(["8-1-1"], [squareKey("8-2-2"), squareKey("8-1-1"), WORLD_KEY])).toEqual(["8-1-1", "8-2-2"]);
  });

  it("names squares by stable keys", () => {
    expect(squareKey("8-75-102")).toBe("map/echoes/8-75-102.pmtiles");
    expect(squareOfKey("map/echoes/8-75-102.pmtiles")).toBe("8-75-102");
    expect(squareOfKey(WORLD_KEY)).toBeNull();
  });
});

describe("the glyphs the labels need", () => {
  it("are the style's one font, in Latin, Latin Extended and punctuation", () => {
    const style = basemapStyle("pmtiles://x", "g/{fontstack}/{range}.pbf", "dark", "pmtiles://w", "pmtiles://c");
    expect(fontstacksOf(style as never)).toEqual([FONT]);
    expect(GLYPH_RANGES).toEqual(["0-255", "256-511", "8192-8447"]);
    expect(glyphKeys([FONT])).toEqual([
      "fonts/Noto Sans Medium/0-255.pbf",
      "fonts/Noto Sans Medium/256-511.pbf",
      "fonts/Noto Sans Medium/8192-8447.pbf",
    ]);
  });

  it("are fetched from the site with the space encoded", () => {
    expect(siteUrlOf(glyphKey(FONT, "0-255"))).toBe(`${AUDIO_ORIGIN}/fonts/Noto%20Sans%20Medium/0-255.pbf`);
  });

  it("are found on the phone by the local template under the stack's alias", () => {
    const dir = "file:///docs/offline/files/";
    for (const stack of [FONT, "Open Sans Bold,Arial Unicode MS Regular"]) {
      for (const range of GLYPH_RANGES) {
        const url = localGlyphTemplate(dir).replace("{fontstack}", fontstackAlias(stack)).replace("{range}", range);
        expect(url).toBe(`file:///docs/offline/files/${fileNameForKey(glyphKey(stack, range))}`);
        // Nothing MapLibre would percent encode.
        expect(encodeURIComponent(fontstackAlias(stack))).toBe(fontstackAlias(stack));
      }
    }
  });
});

describe("the map files a pack plans", () => {
  const know = (over: Partial<MapPackKnowledge> = {}): MapPackKnowledge => ({
    squares: ["8-72-102", "8-75-96"],
    fontstacks: FONTS,
    measured: () => undefined,
    ...over,
  });

  it("are its squares, then the world, the coast and the glyphs", () => {
    const parts = mapPartsFor([echo("a", WILMINGTON)], know());
    expect(parts.map((p) => p.key)).toEqual([squareKey("8-72-102"), ...sharedMapKeys(FONTS)]);
    expect(parts.every((p) => p.kind === "tiles")).toBe(true);
    expect(parts[0]).toMatchObject({ url: `${AUDIO_ORIGIN}/map/echoes/8-72-102.pmtiles`, estimatedBytes: FALLBACK_SQUARE_BYTES });
    expect(parts.find((p) => p.key === WORLD_KEY)?.estimatedBytes).toBe(KNOWN_BYTES[WORLD_KEY]);
    expect(parts.some((p) => p.libraryBytes !== undefined)).toBe(false);
  });

  it("use a measured size when there is one, and compare by it on update", () => {
    const parts = mapPartsFor([echo("a", WILMINGTON)], know({ measured: (k) => (k === COAST_KEY ? 4_000_000 : undefined) }));
    expect(parts.find((p) => p.key === COAST_KEY)).toMatchObject({ estimatedBytes: 4_000_000, libraryBytes: 4_000_000 });
  });

  it("are the shared files alone until the list of squares is known, and nothing for no echoes", () => {
    expect(mapPartsFor([echo("a", WILMINGTON)], know({ squares: null })).map((p) => p.key)).toEqual(sharedMapKeys(FONTS));
    expect(mapPartsFor([], know())).toEqual([]);
  });

  it("go into a pack's plan and size through the planner hook", () => {
    const capeFear = CITIES.find((c) => c.id === "cape-fear")!;
    const library = [echo("a", WILMINGTON)];
    let ready = false;
    const off = registerPartPlanner((_s, echoes) => mapPartsFor(echoes, know()), { ready: () => ready });
    try {
      expect(partPlannersReady()).toBe(false);
      ready = true;
      expect(partPlannersReady()).toBe(true);
      const plan = planPack({ kind: "city", city: capeFear }, library);
      expect(plan.parts.map((p) => p.kind)).toEqual(["audio", "tiles", "tiles", "tiles", "tiles", "tiles", "tiles"]);
      const shared = Object.values(KNOWN_BYTES).reduce((a, b) => a + b, 0);
      expect(plan.estimatedBytes).toBe(1_000_000 + FALLBACK_SQUARE_BYTES + shared);
    } finally {
      off();
    }
    expect(partPlannersReady()).toBe(true);
  });

  it("are planned again when a planner says it learnt something", () => {
    let heard = 0;
    const stop = onPartPlannersChanged(() => heard++);
    partPlannersChanged();
    stop();
    partPlannersChanged();
    expect(heard).toBe(1);
  });
});

describe("shared files: kept once, freed last", () => {
  const NOW = 1_700_000_000_000;
  const sharedPart = (key: string) => ({ kind: "tiles" as const, key, url: siteUrlOf(key), estimatedBytes: 100 });
  const planOf = (id: string, keys: string[]): PackPlan => ({
    id,
    kind: "city",
    sourceId: id,
    name: id,
    echoIds: [],
    parts: keys.map(sharedPart),
    estimatedBytes: keys.length * 100,
  });
  const saveAll = (m: PackManifest, bytes = 90) => m.parts.reduce((acc, p) => withPartSaved(acc, p.key, bytes, NOW), m);

  const a = saveAll(manifestFor(planOf("a", [WORLD_KEY, COAST_KEY, squareKey("8-1-1")]), NOW));
  const bPlan = planOf("b", [WORLD_KEY, COAST_KEY, squareKey("8-2-2")]);

  it("are not fetched again for a second pack, nor counted in its size", () => {
    expect(savedBytesOf([a], WORLD_KEY)).toBe(90);
    expect(savedBytesOf([a], squareKey("8-2-2"))).toBeNull();
    expect(bytesToSave(bPlan, [])).toBe(300);
    expect(bytesToSave(bPlan, [a])).toBe(100);
  });

  it("do not count a pack still saving that has not got them yet", () => {
    const saving = manifestFor(planOf("c", [WORLD_KEY]), NOW);
    expect(savedBytesOf([saving], WORLD_KEY)).toBeNull();
  });

  it("stay while any pack holds them, and go with the last", () => {
    const b = saveAll(manifestFor(bPlan, NOW));
    // Remove a: only its own square goes.
    expect(orphanedKeys([b], a.parts.map((p) => p.key))).toEqual([squareKey("8-1-1")]);
    // Then remove b: everything it held goes.
    expect(orphanedKeys([], b.parts.map((p) => p.key))).toEqual([WORLD_KEY, COAST_KEY, squareKey("8-2-2")]);
  });
});

describe("where the map reads each file", () => {
  const dir = "file:///docs/offline/files";
  const saved = (keys: string[]) => (key: string) => (keys.includes(key) ? `${dir}/${fileNameForKey(key)}` : null);

  it("is the site when nothing is saved", () => {
    const m = chooseMapAddresses(FONTS, saved([]), dir);
    expect(m.square("8-72-102")).toBe(`pmtiles://${AUDIO_ORIGIN}/map/echoes/8-72-102.pmtiles`);
    expect(m.world).toBe(`pmtiles://${AUDIO_ORIGIN}/map/world.pmtiles`);
    expect(m.coast).toBe(`pmtiles://${AUDIO_ORIGIN}/map/coast.pmtiles`);
    expect(m.glyphs).toBe(`${AUDIO_ORIGIN}/fonts/{fontstack}/{range}.pbf`);
    expect(m.fontAlias).toBeNull();
  });

  it("is the phone for each file saved, file by file", () => {
    const m = chooseMapAddresses(FONTS, saved([squareKey("8-72-102"), WORLD_KEY]), dir);
    expect(m.square("8-72-102")).toBe(`pmtiles://${dir}/map_echoes_8-72-102.pmtiles`);
    expect(m.square("8-75-96")).toBe(`pmtiles://${AUDIO_ORIGIN}/map/echoes/8-75-96.pmtiles`);
    expect(m.world).toBe(`pmtiles://${dir}/map_world.pmtiles`);
    expect(m.coast).toBe(`pmtiles://${AUDIO_ORIGIN}/map/coast.pmtiles`);
  });

  it("reads the glyphs from the phone only when every range is saved", () => {
    const some = chooseMapAddresses(FONTS, saved([glyphKey(FONT, "0-255")]), dir);
    expect(some.fontAlias).toBeNull();
    const all = chooseMapAddresses(FONTS, saved(glyphKeys(FONTS)), dir);
    expect(all.glyphs).toBe(`${dir}/fonts_{fontstack}_{range}.pbf`);
    expect(all.fontAlias?.(FONT)).toBe("Noto_Sans_Medium");
    expect(chooseMapAddresses(FONTS, saved(glyphKeys(FONTS)), null).fontAlias).toBeNull();
  });
});
