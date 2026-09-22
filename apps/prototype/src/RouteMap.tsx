/**
 * The map.
 *
 * Drawn as vector geometry rather than over a basemap, because tile providers are
 * unreachable from this environment and because the pin states are the point — a real
 * basemap slots in underneath without changing any of this.
 *
 * Four pin states, and they have to be legible at a glance, in sunlight, while walking:
 *
 *   sealed    outline only          known about, not yet opened
 *   opening   filling ring          inside the radius, dwell running
 *   captured  solid aqua            yours, unplayed
 *   heard     solid, muted          done
 *
 * The ring is the piece that matters most. It is what makes walking the last few metres
 * feel like something, and it is driven straight from the engine's `opening` event rather
 * than a local animation timer — a ring that disagreed with the capture would be worse
 * than no ring.
 */

import { useMemo } from "react";
import { CATEGORY_ICON } from "./categories";
import {
  buildRouteGeometry,
  effectiveRadiusKm,
  type Arriving,
  type Echo,
  type LatLng,
  type Position,
  type Route,
} from "@echofinders/core";

export type PinState = "sealed" | "opening" | "captured" | "heard";

interface Props {
  readonly route: Route;
  readonly library: readonly Echo[];
  readonly position: Position | null;
  readonly opening: readonly Arriving[];
  readonly stateOf: (echoId: string) => PinState;
  readonly selectedId: string | null;
  readonly onSelect: (echoId: string) => void;
}

const W = 390;
const H = 844;

/**
 * Where the route is allowed to be drawn.
 *
 * The map fills the screen, but the sheet covers the bottom third and the status bar the
 * top — so the geometry is fitted into what is actually visible. Without this the pins at
 * either end of the walk sit underneath the sheet, which is where the first and last echoes
 * of any route would always be.
 */
const INSET = { top: 76, bottom: 392, side: 38 };

export function RouteMap({ route, library, position, opening, stateOf, selectedId, onSelect }: Props) {
  const projection = useMemo(() => {
    const geometry = buildRouteGeometry(route);
    const points = [...geometry.points, ...library.map((e) => e.point.at)];

    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    // Equirectangular, scaled by cos(latitude) so the shape is not stretched. Fine over a
    // two-kilometre walk; nobody is navigating by this projection.
    const latScale = 1;
    const lngScale = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);

    const spanLat = (maxLat - minLat) * latScale || 1e-6;
    const spanLng = (maxLng - minLng) * lngScale || 1e-6;

    const usableW = W - INSET.side * 2;
    const usableH = H - INSET.top - INSET.bottom;
    const scale = Math.min(usableW / spanLng, usableH / spanLat);

    const offsetX = INSET.side + (usableW - spanLng * scale) / 2;
    const offsetY = INSET.top + (usableH - spanLat * scale) / 2;

    return (p: LatLng) => ({
      x: offsetX + (p.lng - minLng) * lngScale * scale,
      // Screen y grows downward; latitude grows north, so the span is subtracted.
      y: offsetY + (maxLat - p.lat) * latScale * scale,
    });
  }, [route, library]);

  const path = useMemo(() => {
    const geometry = buildRouteGeometry(route);
    return geometry.points
      .map((p, i) => {
        const { x, y } = projection(p);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }, [route, projection]);

  const openingById = new Map(opening.map((a) => [a.echo.id, a]));
  const here = position ? projection(position.at) : null;

  return (
    <svg className="map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Walking route">
      <defs>
        <radialGradient id="hereGlow">
          <stop offset="0%" stopColor="var(--aqua)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="var(--aqua)" stopOpacity="0" />
        </radialGradient>

        {/*
          One contour, reused. The mark's rings are irregular topographic lines rather than
          circles, and that irregularity is most of what makes it read as a *place*. Drawn
          once and rotated per ring so the nesting survives at 22px, where genuinely
          different outlines would turn into a smudge.
        */}
        {/*
          `vectorEffect` belongs on the path itself, not on the `use` that references it:
          set on the `use` it does not reach the referenced geometry, and the outermost
          ring's stroke gets scaled fifteen-fold with everything else — three crisp contour
          lines become three fat halos, which is the opposite of the mark.
        */}
        <path id="contour" d={CONTOUR} vectorEffect="non-scaling-stroke" />

        {/*
          The route carries the mark's own gradient: its contour lines travel from aqua
          through blue to violet as they spread out from the echo. Reusing that here means
          the single longest line on the screen is saying the same thing the logo says,
          rather than being a neutral stroke that happens to sit near it.
        */}
        <linearGradient id="routeLine" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#00e5ff" />
          <stop offset="45%" stopColor="#3b6bff" />
          <stop offset="100%" stopColor="#7b3bff" />
        </linearGradient>
      </defs>

      <path d={path} className="route-casing" />
      <path d={path} className="route" />

      {library.map((echo) => {
        const { x, y } = projection(echo.point.at);
        const state = stateOf(echo.id);
        const arriving = openingById.get(echo.id);
        const selected = selectedId === echo.id;

        // The trigger radius, drawn to scale. Seeing how big "here" actually is explains
        // the whole mechanic faster than any label.
        const radiusPx = radiusToPixels(echo, projection);

        return (
          <g
            key={echo.id}
            className={`pin pin-${state} cat-${echo.category}${selected ? " pin-selected" : ""}`}
            transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
            onClick={() => onSelect(echo.id)}
            role="button"
            aria-label={echo.title}
          >
            {(state === "opening" || selected) && (
              <circle className="pin-radius" r={Math.max(radiusPx, 10)} />
            )}

            <Contours />

            {/*
              A ring in the category's colour with its glyph inside — the design's pin, not
              a dot. At 26px a colour alone cannot carry nine categories: anybody who does
              not already know the key is looking at coloured dots, and the icon is what
              makes the colour mean something before it is tapped.
            */}
            <circle className="pin-body" r="13" />
            <g className="pin-icon" transform="translate(-7 -7) scale(0.583)">
              {CATEGORY_ICON[echo.category]}
            </g>

            {arriving && <ProgressRing progress={arriving.progress} />}

            {/* The found marker sits on the rim, as it does in the design. */}
            {(state === "captured" || state === "heard") && (
              <circle className="pin-found" r="4" cx="9.5" cy="9.5" />
            )}
          </g>
        );
      })}

      {here && (
        <g className="here" transform={`translate(${here.x.toFixed(1)} ${here.y.toFixed(1)})`}>
          <circle r="26" fill="url(#hereGlow)" />
          <circle className="here-dot" r="6" />
        </g>
      )}
    </svg>
  );
}

/**
 * A closed, faintly irregular ring — a contour line, not a circle.
 *
 * Generated rather than hand-tuned: six points at uneven radii, joined by a Catmull-Rom
 * spline. The unevenness is the entire point. A perfect circle reads as a target reticle,
 * which is the wrong idea for a product about standing somewhere.
 */
const CONTOUR =
  "M0.000 -1.000C0.254 -0.998 0.602 -0.689 0.753 -0.435C0.905 -0.181 1.035 0.297 0.909 " +
  "0.525C0.784 0.752 0.305 0.929 0.000 0.930C-0.305 0.931 -0.790 0.759 -0.918 0.530C-1.046 " +
  "0.301 -0.924 -0.190 -0.771 -0.445C-0.618 -0.700 -0.254 -1.002 0.000 -1.000Z";

/**
 * The three nested contours around every pin.
 *
 * Three, because the brand notes are explicit that the full mark — five to eight contours,
 * a doorway and a figure — becomes a blue smudge below about 120px, and that the version
 * worth drawing small is three rings and the point. A map pin is 22px.
 *
 * Each ring is the same path rotated, so they nest without ever tracing each other.
 */
function Contours() {
  return (
    <>
      <use href="#contour" className="pin-contour pin-contour-2" transform="scale(17) rotate(74)" />
      <use href="#contour" className="pin-contour pin-contour-3" transform="scale(21) rotate(148)" />
    </>
  );
}

/**
 * The dwell ring.
 *
 * A stroked circle with a dash offset, so it fills clockwise from the top. `progress`
 * comes from the engine, so the ring completes at exactly the moment the echo opens.
 */
function ProgressRing({ progress }: { progress: number }) {
  const r = 16;
  const circumference = 2 * Math.PI * r;
  return (
    <circle
      className="pin-ring"
      r={r}
      strokeDasharray={circumference}
      strokeDashoffset={circumference * (1 - progress)}
      transform="rotate(-90)"
    />
  );
}

/** Trigger radius in screen pixels, honouring a contributor's earned reach. */
function radiusToPixels(echo: Echo, project: (p: LatLng) => { x: number; y: number }): number {
  const km = effectiveRadiusKm(echo);
  const centre = project(echo.point.at);
  // One degree of latitude is ~111.195km everywhere, so offsetting north by the radius and
  // measuring the projected distance gives the right number of pixels.
  const north = project({ lat: echo.point.at.lat + km / 111.195, lng: echo.point.at.lng });
  return Math.abs(centre.y - north.y);
}
