/**
 * The map, read from one file per square (`scripts/build-map.py`).
 *
 * It was one `echoes.pmtiles`, and six cities took it to 46 MB, on its way past GitHub's
 * 100 MB limit for a file, with every rebuild adding a whole new copy to the repository.
 * The build now puts every tile in the file for the zoom-8 square it falls in (about 150 km
 * across) and lists the squares in `index.json`. This is the other half: a MapLibre
 * protocol, `echomap://`, that answers each tile from its square's file, so the style still
 * sees one source with one set of layers.
 *
 * A tile outside every square, or below the squares' zoom, is empty: the world map
 * underneath (`world.pmtiles`) is what shows there, exactly as before.
 */

import type { AddProtocolAction } from "maplibre-gl";
import { PMTiles } from "pmtiles";

interface Index {
  readonly zoom: number;
  readonly minZoom: number;
  readonly maxZoom: number;
  readonly layers: readonly string[];
  readonly squares: readonly string[];
}

const indexes = new Map<string, Promise<Index>>();
const files = new Map<string, PMTiles>();

const indexOf = (base: string) => {
  let found = indexes.get(base);
  if (!found) {
    found = fetch(`${base}/index.json`).then((r) => {
      if (!r.ok) throw new Error(`map index: ${r.status}`);
      return r.json() as Promise<Index>;
    });
    // A failed index is not kept, so the next tile tries again rather than the map staying
    // blank for the rest of the session.
    found.catch(() => indexes.delete(base));
    indexes.set(base, found);
  }
  return found;
};

const fileFor = (base: string, square: string) => {
  const url = `${base}/${square}.pmtiles`;
  let file = files.get(url);
  if (!file) {
    file = new PMTiles(url);
    files.set(url, file);
  }
  return file;
};

/** `echomap://<base>` for the style, from the folder the squares are served from. */
export const echoMapUrl = (base: string) => `echomap://${base}`;

/** The source URL a style should use for `tiles`: one file, or a folder of squares. */
export const mapSourceUrl = (tiles: string) =>
  tiles.endsWith(".pmtiles") ? `pmtiles://${tiles}` : echoMapUrl(tiles);

/**
 * MapLibre's protocol handler. The bare `echomap://<base>` asks for the source's TileJSON;
 * `echomap://<base>/<z>/<x>/<y>` asks for one tile.
 */
export const echoMapProtocol: AddProtocolAction = async (params, abort) => {
  const rest = params.url.slice("echomap://".length);
  const tile = rest.match(/^(.*)\/(\d+)\/(\d+)\/(\d+)$/);

  if (!tile) {
    const index = await indexOf(rest);
    return {
      data: {
        tilejson: "3.0.0",
        tiles: [`echomap://${rest}/{z}/{x}/{y}`],
        minzoom: index.minZoom,
        maxzoom: index.maxZoom,
        vector_layers: index.layers.map((id) => ({ id, fields: {} })),
      },
    };
  }

  const [, base, zs, xs, ys] = tile;
  const z = Number(zs);
  const x = Number(xs);
  const y = Number(ys);
  const index = await indexOf(base!);
  if (z < index.zoom) return { data: new ArrayBuffer(0) };
  const shift = z - index.zoom;
  const square = `${index.zoom}-${x >> shift}-${y >> shift}`;
  if (!index.squares.includes(square)) return { data: new ArrayBuffer(0) };
  const found = await fileFor(base!, square).getZxy(z, x, y, abort.signal);
  return { data: found ? found.data : new ArrayBuffer(0) };
};
