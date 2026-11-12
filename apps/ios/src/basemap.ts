/**
 * The navy map on the phone: the web app's own style, over the web app's own map files.
 *
 * THE STYLE IS SHARED, NOT COPIED. `basemapStyle` is imported in place from
 * `apps/prototype/src/basemap-style.ts`, exactly as `library.ts` imports the generated
 * library, so a colour changed for the web changes here too. Metro reaches it because it
 * watches `apps/prototype/src`; its only import is `import type` from "maplibre-gl", which
 * Babel erases (and `src/types/maplibre-gl.d.ts` answers for the type checker).
 *
 * THE TILES ARE THE SAME FILES. The web app reads them from its own site; so does the
 * phone. MapLibre Native has read `pmtiles://` sources itself since iOS 6.10.0 (this app
 * has 6.31.0), so `world.pmtiles` and `coast.pmtiles` go in as they do on the web.
 *
 * The street map is the one difference. The web cuts it into one file per zoom 8 square
 * (`scripts/build-map.py`, ADR-0019) and joins them back into one source with its own
 * protocol, `echomap://` (`echo-map.ts`), a JavaScript tile handler. MapLibre Native cannot
 * run a JavaScript tile handler, so here each square is its own `pmtiles://` source, and
 * each street layer of the style is drawn once per square. The squares do not overlap, so
 * it draws the same map. A square's file says where it is, so MapLibre only asks a square
 * for tiles when it is on screen; the cost is one small header read per square when the
 * map opens. The list of squares is the web's own `index.json`, read when the map opens,
 * so a new city reaches the phone with the web's next deploy, no app update.
 *
 * OFFLINE. A download pack saves the squares under its echoes, the world, the coast and
 * the label glyphs (`mapPack.ts` plans them, `mapPacks.ts` puts them into packs). The map
 * reads a saved file as `pmtiles://file://...`, which MapLibre Native reads as readily as
 * `pmtiles://https://...`, and anything not saved from the site, file by file
 * (`chooseMapAddresses`). The list of squares is kept on the phone each time it is read,
 * so with no signal the map still knows its squares.
 */
import type { LayerSpecification, SourceSpecification, StyleSpecification } from "@maplibre/maplibre-react-native";
import { basemapStyle } from "../../prototype/src/basemap-style";
import { AUDIO_ORIGIN } from "./library";
import { chooseMapAddresses, fontstacksOf, type MapAddresses } from "./mapPack";
import { readOfflineJson, writeOfflineJson } from "./packs/store";

/** The web app's site, which serves the audio and the map alike. */
export const MAP_ORIGIN = AUDIO_ORIGIN;

/** Every file from the site: the map before anything is saved. */
export const SITE_MAP: MapAddresses = chooseMapAddresses([], () => null, null, MAP_ORIGIN);

/**
 * The credit the map needs: OpenStreetMap's data is ODbL, which requires it. The web
 * app's `VECTOR_ATTRIBUTION` (`tiles.ts`), repeated rather than imported because that
 * module reads `import.meta.env`, which is the web build's and not Metro's.
 */
export const MAP_CREDIT = "© OpenStreetMap · Overture Maps";

/**
 * The ground under the map: the middle stop of the web's `mapField` gradient. On the web
 * the style paints no land up close and the page's gradient shows through the canvas; a
 * native map has no page behind it, so the field is the style's first layer.
 */
export const MAP_FIELD = "#0D1230";

/** The web's `index.json` for the squares, as `build-map.py` writes it. */
interface SquareIndex {
  readonly squares: readonly string[];
}

/** Where the last list read is kept, under the offline folder. */
const INDEX_COPY = "map-index.json";

function squaresIn(index: unknown): string[] | null {
  const list = (index as Partial<SquareIndex> | null)?.squares;
  if (!Array.isArray(list)) return null;
  return list.filter((s): s is string => typeof s === "string" && /^\d+-\d+-\d+$/.test(s));
}

let squares: Promise<readonly string[]> | null = null;

/**
 * The squares the street map is cut into. Read once per launch, and kept on the phone; a
 * failure is not kept, so the next time the map opens it tries again.
 */
export function streetSquares(): Promise<readonly string[]> {
  squares ??= fetch(`${MAP_ORIGIN}/map/echoes/index.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`map index: ${r.status}`);
      return r.json() as Promise<unknown>;
    })
    .then((index) => {
      const list = squaresIn(index);
      if (!list) throw new Error("map index: no squares");
      writeOfflineJson(INDEX_COPY, { squares: list });
      return list;
    });
  squares.catch(() => {
    squares = null;
  });
  return squares;
}

/** The list as last read, from the phone: what the map uses with no signal. */
export function savedStreetSquares(): readonly string[] | null {
  return squaresIn(readOfflineJson(INDEX_COPY));
}

/** Placeholder for the one street source the web style names; replaced per square below. */
const STREETS = "base";

/**
 * The web's dark style, with the street source split into one source per square, each
 * read from the address `files` gives it, and the map field painted underneath.
 */
export function nativeBasemapStyle(squareIds: readonly string[], files: MapAddresses = SITE_MAP): StyleSpecification {
  const web = basemapStyle(`pmtiles://${MAP_ORIGIN}/map/echoes`, files.glyphs, "dark", files.world, files.coast) as unknown as StyleSpecification;

  const { [STREETS]: street, ...otherSources } = web.sources;
  const sources: Record<string, SourceSpecification> = { ...otherSources };
  if (street) {
    for (const square of squareIds) {
      sources[`${STREETS}-${square}`] = { ...street, url: files.square(square) } as SourceSpecification;
    }
  }

  // Glyphs from the phone: each stack goes by the name its saved files are under.
  const alias = files.fontAlias;
  const named = (layer: LayerSpecification): LayerSpecification => {
    if (!alias || layer.type !== "symbol") return layer;
    const font = layer.layout?.["text-font"];
    if (!Array.isArray(font) || !font.every((f) => typeof f === "string")) return layer;
    return { ...layer, layout: { ...layer.layout, "text-font": [alias(font.join(","))] } } as LayerSpecification;
  };

  // Layer by layer, square by square: every square's water under every square's roads,
  // and every name over every road, as the web style orders them.
  const layers: LayerSpecification[] = [
    { id: "field", type: "background", paint: { "background-color": MAP_FIELD } },
  ];
  for (const layer of web.layers.map(named)) {
    if (!("source" in layer) || layer.source !== STREETS) {
      layers.push(layer);
      continue;
    }
    for (const square of squareIds) {
      layers.push({ ...layer, id: `${layer.id}-${square}`, source: `${STREETS}-${square}` } as LayerSpecification);
    }
  }

  return { ...web, sources, layers };
}

/** The font stacks the style's labels use: the glyphs a pack saves. */
export const MAP_FONTSTACKS: readonly string[] = fontstacksOf(nativeBasemapStyle([]));
