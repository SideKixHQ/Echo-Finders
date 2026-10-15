/**
 * The map itself: MapLibre, taking the gestures.
 *
 * James (2026-10-11): "Zooming in and out doesnt really work … what does it look like when
 * you are walking on the street. it should be very close and detailed."
 *
 * The map used to be an SVG that did its own pan and pinch, and those gestures were the
 * weakest thing in it: the pinch zoomed about the middle of the screen rather than between
 * your fingers, nothing carried on moving when you let go, the scale drifted by itself as
 * you walked, and "back to where I am" zoomed out to the whole journey. MapLibre's handlers
 * are what every phone map feels like, so they do the moving now, and the SVG over the top
 * (pins, route, you) reads its positions from this camera on every frame.
 *
 * The basemap is the navy style over the app's own map file (`scripts/build-map.py`,
 * `DEPLOY.md` The map), and Esri's raster only if there is no file at all. If MapLibre
 * cannot start (no WebGL), `onReady` never fires and `RouteMap` keeps its own projection
 * and gestures, so the map still works as it did.
 */

import { useEffect, useRef } from "react";
import type { Map as MapLibre } from "maplibre-gl";
import { WORLD_TILES_URL } from "./tiles";
import { mapSourceUrl } from "./echo-map";
import { basemapStyle, rasterStyle, type MapTheme } from "./basemap-style";
import { glyphs, loadMapLibre } from "./VectorBasemap";

interface Props {
  /** The map file (PMTiles), or null for the Esri stopgap. */
  readonly tiles: string | null;
  readonly theme: MapTheme;
  /** Where to start, before the first fix: roughly the whole US. */
  readonly start: { readonly lat: number; readonly lng: number; readonly zoom: number };
  /** Hidden above this many pixels from the top, where the chips sit. */
  readonly clipTop: number;
  readonly onReady: (map: MapLibre) => void;
  /** Every frame the camera moves, for whatever it was moved by. */
  readonly onMove: () => void;
  /**
   * A person started any gesture: a drag, a pinch, a wheel, a double tap. Every one of
   * them stops the map following you.
   *
   * It used to be only a drag, on the idea that a pinch means "closer", not "somewhere
   * else", so the map should zoom and stay on you. On a phone it meant the map fought you:
   * pinch in on the echoes down the street and the next GPS fix, about a second later,
   * pulled the map back to your dot and off the echoes you were zooming in on (James,
   * 2026-10-12). A pinch zooms between your fingers, and the map stays where you put it
   * until "Back to where I am".
   */
  readonly onUserGesture: () => void;
  /** The camera came to rest, whoever moved it, at this MapLibre zoom. */
  readonly onSettle: (zoom: number) => void;
  /**
   * A tap on the map itself, not on a pin (pins are in the SVG inside it and take their
   * own taps). Closes whatever card is open, as tapping away does on every phone map.
   */
  readonly onMapTap: () => void;
}

const styleFor = (tiles: string | null, theme: MapTheme) =>
  tiles ? basemapStyle(mapSourceUrl(tiles), glyphs(), theme, WORLD_TILES_URL && `pmtiles://${WORLD_TILES_URL}`) : rasterStyle(theme);

export function MapCanvas({ tiles, theme, start, clipTop, onReady, onMove, onUserGesture, onSettle, onMapTap }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre | null>(null);
  // The handlers change identity every render; the map is made once and calls the latest.
  const handlers = useRef({ onReady, onMove, onUserGesture, onSettle, onMapTap });
  handlers.current = { onReady, onMove, onUserGesture, onSettle, onMapTap };
  const firstTheme = useRef(theme);
  const firstStart = useRef(start);

  useEffect(() => {
    let live = true;
    let created: MapLibre | null = null;
    loadMapLibre()
      .then((maplibre) => {
        if (!live || !host.current) return;
        const at = firstStart.current;
        created = new maplibre.Map({
          container: host.current,
          style: styleFor(tiles, firstTheme.current),
          center: [at.lng, at.lat],
          zoom: at.zoom,
          minZoom: 2,
          maxZoom: 19.5,
          attributionControl: false,
          // North stays up. The pins, the route and your heading cone are drawn by the SVG
          // in north-up terms, and a map that turns under a phone held at a slight angle is
          // one more thing to lose your bearings by.
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          fadeDuration: 0,
        });
        created.touchZoomRotate.disableRotation();
        created.keyboard.disableRotation();
        created.on("error", (e) => console.warn("map:", e.error?.message ?? e));
        // An ease the app started has no `originalEvent`; anything a finger or a wheel
        // started does.
        created.on("movestart", (e) => {
          if ((e as { originalEvent?: Event }).originalEvent) handlers.current.onUserGesture();
        });
        created.on("moveend", () => handlers.current.onSettle(created!.getZoom()));
        // The pins are inside the map's layer, so MapLibre hears their taps too; only a
        // tap on the map itself is "tap away".
        created.on("click", (e) => {
          if (e.originalEvent.target === created!.getCanvas()) handlers.current.onMapTap();
        });
        let frame = 0;
        created.on("move", () => {
          if (frame) return;
          frame = requestAnimationFrame(() => {
            frame = 0;
            handlers.current.onMove();
          });
        });
        created.once("load", () => {
          if (!live) return;
          map.current = created;
          handlers.current.onReady(created!);
        });
      })
      .catch((e) => console.warn("map:", e instanceof Error ? e.message : e));
    return () => {
      live = false;
      created?.remove();
      map.current = null;
    };
  }, [tiles]);

  useEffect(() => {
    if (theme !== firstTheme.current) map.current?.setStyle(styleFor(tiles, theme));
    firstTheme.current = theme;
  }, [theme, tiles]);

  return (
    <div className="map-canvas" style={{ clipPath: `inset(${clipTop}px 0 0 0)` }}>
      <div ref={host} className="map-canvas-gl" />
    </div>
  );
}
