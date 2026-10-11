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
 * The basemap is the navy Protomaps style once its file is on R2 (`DEPLOY.md`, The map),
 * and Esri's raster until then. If MapLibre cannot start (no WebGL), `onReady` never fires
 * and `RouteMap` keeps its own projection and gestures, so the map still works as it did.
 */

import { useEffect, useRef } from "react";
import type { Map as MapLibre } from "maplibre-gl";
import { basemapStyle, rasterStyle, type MapTheme } from "./basemap-style";
import { glyphs, loadMapLibre } from "./VectorBasemap";

interface Props {
  /** The Protomaps archive, or null for the Esri stopgap. */
  readonly tiles: string | null;
  readonly theme: MapTheme;
  /** Where to start, before the first fix: roughly the whole US. */
  readonly start: { readonly lat: number; readonly lng: number; readonly zoom: number };
  /** Hidden above this many pixels from the top, where the chips sit. */
  readonly clipTop: number;
  readonly onReady: (map: MapLibre) => void;
  /** Every frame the camera moves, for whatever it was moved by. */
  readonly onMove: () => void;
  /** A person started any gesture: a drag, a pinch, a wheel, a double tap. */
  readonly onUserGesture: () => void;
  /** The camera came to rest, whoever moved it. */
  readonly onSettle: () => void;
  /**
   * A person dragged it. Only a drag stops the map following you: a pinch or a double tap
   * is "closer" or "further", not "show me somewhere else", so the map zooms and stays on you.
   */
  readonly onUserDrag: () => void;
  /** A person changed the zoom, with the zoom it settled on. */
  readonly onUserZoom: (zoom: number) => void;
}

const styleFor = (tiles: string | null, theme: MapTheme) =>
  tiles ? basemapStyle(`pmtiles://${tiles}`, glyphs(), theme) : rasterStyle(theme);

export function MapCanvas({ tiles, theme, start, clipTop, onReady, onMove, onUserGesture, onSettle, onUserDrag, onUserZoom }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre | null>(null);
  // The handlers change identity every render; the map is made once and calls the latest.
  const handlers = useRef({ onReady, onMove, onUserGesture, onSettle, onUserDrag, onUserZoom });
  handlers.current = { onReady, onMove, onUserGesture, onSettle, onUserDrag, onUserZoom };
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
        created.on("dragstart", () => handlers.current.onUserDrag());
        created.on("moveend", () => handlers.current.onSettle());
        created.on("zoomend", (e) => {
          if ((e as { originalEvent?: Event }).originalEvent) handlers.current.onUserZoom(created!.getZoom());
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
