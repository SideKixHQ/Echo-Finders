/**
 * The vector basemap: a MapLibre canvas under the SVG, following the SVG's projection.
 *
 * The pins, the route and every ripple stay in the SVG, projected by `tiles.ts` exactly as
 * before. This canvas only draws the streets, and is told where to look: the camera comes
 * from the same tile plan the pins use (`cameraFor`), so a pin and its street cannot drift
 * apart. It never takes input; the SVG over it does.
 *
 * MapLibre is about 250KB gzipped, so it is loaded only when there are tiles to draw, and
 * after first paint. It must fail as quietly as the raster tiles did: no WebGL, a blocked
 * network or a missing archive all leave the app's own field showing, which is the map
 * without streets rather than a broken one.
 */

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibre } from "maplibre-gl";
import { basemapStyle, type MapTheme } from "./basemap-style";

export interface Camera {
  readonly lat: number;
  readonly lng: number;
  readonly zoom: number;
}

interface Props {
  /** The archive, as an https URL. */
  readonly tiles: string;
  readonly camera: Camera | null;
  readonly theme: MapTheme;
  /** The canvas's own size, in the SVG's units. */
  readonly width: number;
  readonly height: number;
  /**
   * Where the SVG's own box sits in CSS pixels, for an SVG drawn into a fixed viewBox and
   * scaled to fit (the city view). The map's SVG is drawn 1:1 and needs neither.
   */
  readonly scale?: number;
  readonly left?: number;
  readonly top?: number;
  /** Hidden above this many SVG units from the top, where the chrome sits. */
  readonly clipTop?: number;
  readonly clipBottom?: number;
  readonly className?: string;
}

/** Glyphs ship with the app (`public/fonts`): one less host to depend on. */
const glyphs = () =>
  `${window.location.origin}${import.meta.env.BASE_URL}fonts/{fontstack}/{range}.pbf`;

let loading: Promise<typeof import("maplibre-gl")> | null = null;

/** MapLibre and the PMTiles protocol, loaded once, on first use. */
function loadMapLibre() {
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
    return maplibre;
  });
  return loading;
}

export function VectorBasemap({
  tiles,
  camera,
  theme,
  width,
  height,
  scale = 1,
  left = 0,
  top = 0,
  clipTop = 0,
  clipBottom = 0,
  className,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibre | null>(null);
  // The latest camera, for the moment the map finishes loading: it is created once and
  // then only ever moved.
  // A view with nothing in it yet (no fix, no echoes) projects to NaN, and MapLibre throws
  // on a NaN camera rather than ignoring it.
  const usable =
    camera && Number.isFinite(camera.lat) && Number.isFinite(camera.lng) && Number.isFinite(camera.zoom)
      ? camera
      : null;
  const latest = useRef(usable);
  latest.current = usable;

  useEffect(() => {
    let live = true;
    let created: MapLibre | null = null;
    loadMapLibre()
      .then((maplibre) => {
        if (!live || !host.current) return;
        const at = latest.current;
        created = new maplibre.Map({
          container: host.current,
          style: basemapStyle(`pmtiles://${tiles}`, glyphs(), theme),
          center: at ? [at.lng, at.lat] : [-98.5, 39.8],
          zoom: at?.zoom ?? 3,
          interactive: false,
          attributionControl: false,
          // The app moves the camera several times a second while you walk. Fading every
          // new tile in reads as the map flickering.
          fadeDuration: 0,
        });
        // A failed tile is logged and otherwise ignored: the field underneath is the
        // fallback, and an error thrown here would take the whole map with it.
        created.on("error", (e) => console.warn("basemap:", e.error?.message ?? e));
        setMap(created);
      })
      .catch((e) => {
        // No WebGL, or the chunk did not load. The field stays, and that is the design.
        console.warn("basemap:", e instanceof Error ? e.message : e);
      });
    return () => {
      live = false;
      created?.remove();
      setMap(null);
    };
    // The theme is applied below without rebuilding the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiles]);

  useEffect(() => {
    map?.setStyle(basemapStyle(`pmtiles://${tiles}`, glyphs(), theme));
  }, [map, theme, tiles]);

  useEffect(() => {
    if (map && usable) map.jumpTo({ center: [usable.lng, usable.lat], zoom: usable.zoom });
  }, [map, usable?.lat, usable?.lng, usable?.zoom]);

  // A size change is a resize, not a new map.
  useEffect(() => {
    map?.resize();
  }, [map, width, height]);

  return (
    <div
      className={className ? `vector-base ${className}` : "vector-base"}
      aria-hidden="true"
      style={{
        width,
        height,
        left,
        top,
        transform: scale === 1 ? undefined : `scale(${scale})`,
        clipPath: `inset(${clipTop}px 0 ${clipBottom}px 0)`,
      }}
    >
      <div ref={host} className="vector-base-canvas" />
    </div>
  );
}
