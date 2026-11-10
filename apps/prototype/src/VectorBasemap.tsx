/**
 * MapLibre, loaded once and on first use, and the glyphs it draws labels with.
 *
 * This file also held a second MapLibre canvas that followed an SVG's projection, for the
 * city heatmap. The heatmap is gone (ADR-0018, amended 2026-11-10) and the street map is
 * MapLibre's own camera (`MapCanvas.tsx`), so only the loader is left.
 */

import { echoMapProtocol } from "./echo-map";

/** Glyphs ship with the app (`public/fonts`): one less host to depend on. */
export const glyphs = () =>
  `${window.location.origin}${import.meta.env.BASE_URL}fonts/{fontstack}/{range}.pbf`;

let loading: Promise<typeof import("maplibre-gl")> | null = null;

/** MapLibre and the PMTiles protocol, loaded once, on first use. */
export function loadMapLibre() {
  loading ??= Promise.all([
    import("maplibre-gl"),
    import("pmtiles"),
    // MapLibre 6 parses tiles in a worker it loads from its own package folder, which a
    // bundled app does not have. Vite builds the worker, with what it imports, into one
    // file and hands back its address.
    import("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"),
    import("maplibre-gl/dist/maplibre-gl.css"),
  ]).then(([maplibre, pmtiles, worker]) => {
    maplibre.setWorkerUrl(worker.default);
    const protocol = new pmtiles.Protocol();
    maplibre.addProtocol("pmtiles", protocol.tile);
    // The map, one file per square (`echo-map.ts`).
    maplibre.addProtocol("echomap", echoMapProtocol);
    return maplibre;
  });
  return loading;
}
