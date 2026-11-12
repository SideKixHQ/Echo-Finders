/**
 * The map in a download pack, the pure half: which map files a pack needs, what they weigh,
 * and, once saved, which address the map reads each one from.
 *
 * A pack's map is two kinds of file (`basemap.ts` explains the map):
 *
 *   - its own STREET SQUARES: the zoom 8 square under each of its echoes, and the square
 *     next door when an echo's trigger circle crosses into it, of the squares the site has
 *     (`map/echoes/index.json`). Key `map/echoes/8-75-102.pmtiles`.
 *   - the files EVERY pack needs: the world outline, the coast, and the label glyphs the
 *     style asks for. Keys `map/world.pmtiles`, `map/coast.pmtiles`,
 *     `fonts/Noto Sans Medium/0-255.pbf`.
 *
 * Both go into the pack as ordinary parts (`kind: "tiles"`). The store keeps one file per
 * key whatever number of packs list it, so a shared file is on the phone once; each pack
 * that wants it lists it, and Remove deletes a file only when no pack left lists it
 * (`orphanedKeys` in `packs/plan.ts`, recomputed on every remove).
 *
 * No Expo, no file system, no fetch: `mapPacks.ts` does the I/O, and the tests in
 * `test/ios/map-pack.test.ts` cover this.
 */
import type { Echo, LatLng } from "@echofinders/core";
import { AUDIO_ORIGIN, fileNameForKey, type PackPart } from "./packs/plan";

/** The zoom the street map is cut at (`scripts/build-map.py`, ADR-0019). */
export const SQUARE_ZOOM = 8;
export const WORLD_KEY = "map/world.pmtiles";
export const COAST_KEY = "map/coast.pmtiles";
const SQUARES_DIR = "map/echoes";

/**
 * The glyph ranges the labels need. The one font (`FONT` in the web's `basemap-style.ts`)
 * is cut for Latin (0-255), Latin Extended (256-511, the accents in Spanish, French and
 * Hawaiian names) and General Punctuation (8192-8447, curly quotes and the like in names);
 * those are the ranges the site serves (`public/fonts`), and the only ones a label asks for.
 */
export const GLYPH_RANGES = ["0-255", "256-511", "8192-8447"] as const;

/**
 * Sizes measured on the site (12 Nov 2026), used until a HEAD request says otherwise.
 * A street square averages 2.5 MB (40 squares, 98.5 MB in all, the largest 8.8 MB).
 */
export const KNOWN_BYTES: Readonly<Record<string, number>> = {
  [WORLD_KEY]: 6_753_863,
  [COAST_KEY]: 4_375_492,
  "fonts/Noto Sans Medium/0-255.pbf": 77_628,
  "fonts/Noto Sans Medium/256-511.pbf": 129_635,
  "fonts/Noto Sans Medium/8192-8447.pbf": 65_101,
};
export const FALLBACK_SQUARE_BYTES = 2_500_000;
export const FALLBACK_GLYPH_BYTES = 100_000;

// --- Keys and addresses -----------------------------------------------------------------

export function squareKey(square: string): string {
  return `${SQUARES_DIR}/${square}.pmtiles`;
}

/** `8-75-102` from `map/echoes/8-75-102.pmtiles`, or null for any other key. */
export function squareOfKey(key: string): string | null {
  const m = /^map\/echoes\/(\d+-\d+-\d+)\.pmtiles$/.exec(key);
  return m ? (m[1] ?? null) : null;
}

export function glyphKey(fontstack: string, range: string): string {
  return `fonts/${fontstack}/${range}.pbf`;
}

/** A key's address on the site, each path segment encoded (`Noto%20Sans%20Medium`). */
export function siteUrlOf(key: string, origin: string = AUDIO_ORIGIN): string {
  return `${origin}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

// --- Which squares --------------------------------------------------------------------

/** The slippy map tile at `zoom` holding a point. */
export function tileOf(at: LatLng, zoom: number = SQUARE_ZOOM): { x: number; y: number } {
  const n = 2 ** zoom;
  const lat = Math.max(-85.05112878, Math.min(85.05112878, at.lat));
  const rad = (lat * Math.PI) / 180;
  const x = Math.floor(((at.lng + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  const clamp = (v: number) => Math.max(0, Math.min(n - 1, v));
  return { x: ((x % n) + n) % n, y: clamp(y) };
}

/**
 * The squares a circle touches: the one under its centre, and its neighbours when the
 * circle crosses an edge. Worked from the circle's bounding box, so a corner square can
 * come in that the circle only nearly reaches; at a few kilometres that costs nothing.
 */
export function squaresAround(at: LatLng, radiusKm: number, zoom: number = SQUARE_ZOOM): string[] {
  const r = Math.max(0, radiusKm);
  const dLat = r / 110.574;
  const dLng = r / (111.32 * Math.max(0.01, Math.cos((at.lat * Math.PI) / 180)));
  const nw = tileOf({ lat: at.lat + dLat, lng: at.lng - dLng }, zoom);
  const se = tileOf({ lat: at.lat - dLat, lng: at.lng + dLng }, zoom);
  const n = 2 ** zoom;
  // Across the antimeridian the west edge has a larger x than the east.
  const xs: number[] = [];
  for (let x = nw.x; ; x = (x + 1) % n) {
    xs.push(x);
    if (x === se.x || xs.length >= n) break;
  }
  const out: string[] = [];
  for (const x of xs) for (let y = nw.y; y <= se.y; y++) out.push(`${zoom}-${x}-${y}`);
  return out;
}

/** The squares a pack's echoes need, of the squares the site has, in the site's order. */
export function squaresFor(echoes: readonly Echo[], available: readonly string[]): string[] {
  const wanted = new Set<string>();
  for (const echo of echoes) for (const s of squaresAround(echo.point.at, echo.point.triggerRadiusKm)) wanted.add(s);
  return available.filter((s) => wanted.has(s));
}

/** The squares the map draws: the site's list, and any saved square it no longer lists. */
export function mapSquares(index: readonly string[], savedKeys: readonly string[]): string[] {
  const out = [...index];
  const have = new Set(index);
  for (const key of savedKeys) {
    const square = squareOfKey(key);
    if (square && !have.has(square)) {
      have.add(square);
      out.push(square);
    }
  }
  return out;
}

// --- Glyphs ---------------------------------------------------------------------------

/**
 * The font stacks a style's labels use, as MapLibre names them in a glyph request (the
 * fonts joined with commas). Only literal `text-font` lists: the style has no other kind.
 */
export function fontstacksOf(style: { readonly layers: readonly unknown[] }): string[] {
  const stacks = new Set<string>();
  for (const layer of style.layers) {
    const font = (layer as { layout?: Record<string, unknown> }).layout?.["text-font"];
    if (Array.isArray(font) && font.length > 0 && font.every((f) => typeof f === "string")) {
      stacks.add(font.join(","));
    }
  }
  return [...stacks];
}

export function glyphKeys(fontstacks: readonly string[]): string[] {
  return fontstacks.flatMap((stack) => GLYPH_RANGES.map((range) => glyphKey(stack, range)));
}

/** Every file every pack needs once: the world, the coast and the glyphs. */
export function sharedMapKeys(fontstacks: readonly string[]): string[] {
  return [WORLD_KEY, COAST_KEY, ...glyphKeys(fontstacks)];
}

/**
 * The name a font stack goes by when its glyphs are read from the phone. The store keeps
 * files flat, named by `fileNameForKey`, so `fonts/Noto Sans Medium/0-255.pbf` is
 * `fonts_Noto_Sans_Medium_0-255.pbf`; with the stack renamed `Noto_Sans_Medium` in the
 * style, `fonts_{fontstack}_{range}.pbf` finds it, with nothing in it to percent encode.
 */
export function fontstackAlias(fontstack: string): string {
  return fileNameForKey(fontstack);
}

/** The glyph address template over the folder the store keeps its files in. */
export function localGlyphTemplate(filesDirUri: string): string {
  return `${filesDirUri.replace(/\/+$/, "")}/fonts_{fontstack}_{range}.pbf`;
}

// --- Planning -------------------------------------------------------------------------

export interface MapPackKnowledge {
  /** The squares the site has, or null until the list has been read. */
  readonly squares: readonly string[] | null;
  readonly fontstacks: readonly string[];
  /** A size measured this launch (HEAD), when there is one. */
  readonly measured: (key: string) => number | undefined;
}

function tilesPart(key: string, measured: number | undefined, fallback: number): PackPart {
  return {
    kind: "tiles",
    key,
    url: siteUrlOf(key),
    estimatedBytes: measured ?? KNOWN_BYTES[key] ?? fallback,
    ...(measured !== undefined ? { libraryBytes: measured } : {}),
  };
}

/**
 * The map files a pack needs: its squares, then the shared files. A pack with no echoes
 * needs no map. Until the list of squares is known, only the shared files.
 */
export function mapPartsFor(echoes: readonly Echo[], know: MapPackKnowledge): PackPart[] {
  if (echoes.length === 0) return [];
  const squares = know.squares ? squaresFor(echoes, know.squares) : [];
  return [
    ...squares.map((s) => tilesPart(squareKey(s), know.measured(squareKey(s)), FALLBACK_SQUARE_BYTES)),
    ...sharedMapKeys(know.fontstacks).map((key) => tilesPart(key, know.measured(key), FALLBACK_GLYPH_BYTES)),
  ];
}

// --- Reading: saved file or network -----------------------------------------------------

export interface MapAddresses {
  /** `pmtiles://` address of a street square. */
  readonly square: (square: string) => string;
  readonly world: string;
  readonly coast: string;
  /** Glyph template, with `{fontstack}` and `{range}`. */
  readonly glyphs: string;
  /** When the glyphs are read from the phone, the name each stack must go by in the style. */
  readonly fontAlias: ((fontstack: string) => string) | null;
}

/**
 * Where the map reads each file: the saved copy when there is one (`local` gives its
 * `file://` URI), the site when not. File by file, so a saved square is read from the
 * phone and the next one along from the network. The glyphs are all or nothing: from the
 * phone only when every range of every stack is saved, since a label can need any of them.
 */
export function chooseMapAddresses(
  fontstacks: readonly string[],
  local: (key: string) => string | null,
  filesDirUri: string | null,
  origin: string = AUDIO_ORIGIN,
): MapAddresses {
  const pmtiles = (key: string) => `pmtiles://${local(key) ?? siteUrlOf(key, origin)}`;
  const glyphsSaved = filesDirUri !== null && fontstacks.length > 0 && glyphKeys(fontstacks).every((k) => local(k) !== null);
  return {
    square: (square) => pmtiles(squareKey(square)),
    world: pmtiles(WORLD_KEY),
    coast: pmtiles(COAST_KEY),
    glyphs: glyphsSaved ? localGlyphTemplate(filesDirUri) : `${origin}/fonts/{fontstack}/{range}.pbf`,
    fontAlias: glyphsSaved ? fontstackAlias : null,
  };
}
