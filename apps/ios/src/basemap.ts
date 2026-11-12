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
 * OFFLINE LATER. Every address comes from `MapFiles`, and MapLibre Native reads
 * `pmtiles://file://...` as readily as `pmtiles://https://...`. Bundling or downloading
 * the squares is a change of addresses, not of this file.
 */
import type { LayerSpecification, SourceSpecification, StyleSpecification } from "@maplibre/maplibre-react-native";
import { basemapStyle } from "../../prototype/src/basemap-style";
import { AUDIO_ORIGIN } from "./library";

/** Where the map's files are. The web app's site today; a folder on the phone later. */
export interface MapFiles {
  /** The folder of squares: `index.json` and one `<square>.pmtiles` each. */
  readonly streets: string;
  /** Coastlines, borders and towns, everywhere, zoomed out. */
  readonly world: string;
  /** The real shore around the echoes. */
  readonly coast: string;
  /** Label glyphs, with `{fontstack}` and `{range}`. */
  readonly glyphs: string;
}

/** The web app's site, which serves the audio and the map alike. */
export const MAP_ORIGIN = AUDIO_ORIGIN;

export const SITE_MAP: MapFiles = {
  streets: `${MAP_ORIGIN}/map/echoes`,
  world: `${MAP_ORIGIN}/map/world.pmtiles`,
  coast: `${MAP_ORIGIN}/map/coast.pmtiles`,
  glyphs: `${MAP_ORIGIN}/fonts/{fontstack}/{range}.pbf`,
};

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

let squares: Promise<readonly string[]> | null = null;

/**
 * The squares the street map is cut into. Read once per launch; a failure is not kept, so
 * the next time the map opens it tries again, and until then the map is the world outline.
 */
export function streetSquares(files: MapFiles = SITE_MAP): Promise<readonly string[]> {
  squares ??= fetch(`${files.streets}/index.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`map index: ${r.status}`);
      return r.json() as Promise<SquareIndex>;
    })
    .then((index) => index.squares.filter((s) => /^\d+-\d+-\d+$/.test(s)));
  squares.catch(() => {
    squares = null;
  });
  return squares;
}

/** Placeholder for the one street source the web style names; replaced per square below. */
const STREETS = "base";

/**
 * The web's dark style, with the street source split into one source per square and the
 * map field painted underneath.
 */
export function nativeBasemapStyle(squareIds: readonly string[], files: MapFiles = SITE_MAP): StyleSpecification {
  const web = basemapStyle(
    `pmtiles://${files.streets}`,
    files.glyphs,
    "dark",
    `pmtiles://${files.world}`,
    `pmtiles://${files.coast}`,
  ) as unknown as StyleSpecification;

  const { [STREETS]: street, ...otherSources } = web.sources;
  const sources: Record<string, SourceSpecification> = { ...otherSources };
  if (street) {
    for (const square of squareIds) {
      sources[`${STREETS}-${square}`] = { ...street, url: `pmtiles://${files.streets}/${square}.pmtiles` } as SourceSpecification;
    }
  }

  // Layer by layer, square by square: every square's water under every square's roads,
  // and every name over every road, as the web style orders them.
  const layers: LayerSpecification[] = [
    { id: "field", type: "background", paint: { "background-color": MAP_FIELD } },
  ];
  for (const layer of web.layers) {
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
