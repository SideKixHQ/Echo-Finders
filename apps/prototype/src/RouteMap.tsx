/**
 * The map.
 *
 * A tiled basemap underneath, and the route, the pins and the listener drawn over it in
 * one SVG that shares the basemap's projection — so nothing can drift between a pin and
 * the street it is meant to be on. A tile that will not load hides itself, which is what
 * lets the whole thing degrade to the dark background and the vector route rather than to
 * a page of broken images.
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
import { TILE_ATTRIBUTION, TILE_URL, planTiles, toWorld } from "./tiles";
import { MODE_ICON } from "./travel";
import {
  buildRouteGeometry,
  distanceKm,
  effectiveRadiusKm,
  presetFor,
  type Arriving,
  type Echo,
  type LatLng,
  type Position,
  type Route,
  type TravelMode,
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
  /** How much of the screen the sheet is taking, so the view centres on what is visible. */
  readonly detent: "peek" | "half" | "full";
  /**
   * Show the whole journey instead of following the listener.
   *
   * The two are genuinely different questions — *where am I* and *what is this walk* — and
   * a map can only answer one at a time. Following is the right default once you are
   * moving; the overview is what you want before you set off, and after you have found
   * something and wonder what else is out there.
   */
  readonly overview: boolean;
}

/*
 * The *screen*, not the phone. `.phone` is 390×844 with 11px of bezel padding, so the
 * surface this draws on is 368×822 — the viewBox was the outer figure, which quietly scaled
 * every inset below by about three percent and put them all slightly in the wrong place.
 */
const W = 368;
const H = 822;

/**
 * Where the route is allowed to be drawn.
 *
 * The map fills the screen, but the sheet covers the bottom third and the status bar the
 * top — so the geometry is fitted into what is actually visible. Without this the pins at
 * either end of the walk sit underneath the sheet, which is where the first and last echoes
 * of any route would always be.
 */
/*
 * These track the chrome in `theme.css`, and they are the reason this comment exists: the
 * sheet grew from 432px to 466px when the then-and-now strip landed, and this number did
 * not, so the bottom of every route quietly slid underneath it. It had in fact been wrong
 * before that too — 392 was tuned against a sheet that had already been made taller once.
 *
 * A pin you cannot see is worse than a map with less room in it, so the inset is now
 * derived from the same numbers the CSS uses rather than eyeballed. Change the sheet
 * height and change this with it.
 */
const NAV_H = 72;
/** Matches the detents in `Sheet.tsx` and in `theme.css`, as fractions of the screen. */
const SHEET_FRACTION = { peek: 0.26, half: 0.46, full: 0.86 } as const;
/** Half a pin, so a pin *centre* never lands under the chrome and no pin is half-eaten. */
const PIN_R = 16;
/** The route ribbon and the category chips, which float over the map's top edge. */
const MAPBAR_H = 119;
/**
 * The guidance bar, which floats above the sheet on every mode that can steer.
 *
 * Height plus its gap. It was not in this sum, so on a walk the bottom of the route ran
 * underneath "getting warmer" — invisible, and in the one place a walker is most likely to
 * be looking. Carried modes do not draw it and get the height back.
 */
const GUIDE_H = 56;
const insetFor = (detent: keyof typeof SHEET_FRACTION, guided: boolean) => ({
  top: MAPBAR_H + PIN_R / 2,
  bottom: NAV_H + H * SHEET_FRACTION[detent] + (guided ? GUIDE_H : 0) + PIN_R / 2,
  side: 30,
});

export function RouteMap({ route, library, position, opening, stateOf, selectedId, onSelect, detent, overview }: Props) {
  /**
   * The view follows the listener, rather than fitting the whole journey.
   *
   * Fitting the route is the obvious thing and it gets worse the better the library gets:
   * a walk with twelve echoes on it squeezes all twelve into whatever height is left over
   * after the sheet, and they collide into a knot. On a phone that left about a hundred
   * pixels of map and a clump — the route was there and unreadable, which is the same as
   * not being there.
   *
   * So it is a window a few hundred metres across, centred on where you are, like every
   * map anybody has ever navigated with. The scale comes from the mode's own corridor, so
   * a walk shows a couple of streets and a flight shows a couple of hundred kilometres —
   * the same number that already decides what counts as "near" on that mode.
   *
   * Until there is a fix it still fits the route, because before you set off the useful
   * question is what the whole journey looks like.
   */
  const projection = useMemo(() => {
    const INSET = insetFor(detent, presetFor(route.mode).selfDirected);
    const geometry = buildRouteGeometry(route);

    // The band actually visible between the chips and the sheet. The listener belongs in
    // the middle of *that*, not the middle of a box that is half covered.
    const usableW = W - INSET.side * 2;
    const usableH = H - INSET.top - INSET.bottom;
    const centreX = INSET.side + usableW / 2;
    const centreY = INSET.top + usableH / 2;

    let centre: LatLng;
    /** How wide the view is on the ground, km, measured across its width. */
    let spanKm: number;

    if (position && !overview) {
      centre = position.at;
      // Twice the corridor: on foot a couple of streets, in the air a couple of hundred
      // kilometres. The same number that already decides what counts as near on this mode.
      spanKm = presetFor(route.mode).corridorKm * 2;
    } else {
      const points = [...geometry.points, ...library.map((e) => e.point.at)];
      const lats = points.map((p) => p.lat);
      const lngs = points.map((p) => p.lng);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      centre = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
      const lngScale = Math.max(Math.cos((centre.lat * Math.PI) / 180), 0.01);
      // Whichever axis needs more room, plus a tenth so nothing sits against an edge.
      const acrossKm = ((maxLng - minLng) || 1e-6) * lngScale * 111.32 * 1.1;
      const downKm = ((maxLat - minLat) || 1e-6) * 111.32 * 1.1;
      spanKm = Math.max(acrossKm, (downKm * usableW) / usableH);
    }

    // Web Mercator, because the basemap underneath is tiled in it. The old
    // equirectangular projection was fine on its own and would drift against a tile — a pin
    // and the street it is meant to be on would sit a few metres apart at the top of the
    // view and agree at the bottom, which is the sort of wrongness people feel before they
    // can name it.
    const plan = planTiles(centre, spanKm, usableW, usableH);
    const world = (p: LatLng) => toWorld(p.lat, p.lng, plan.zoom);
    const origin = world(centre);

    const project = (p: LatLng) => {
      const w = world(p);
      return {
        x: centreX + (w.x - origin.x) * plan.scale,
        y: centreY + (w.y - origin.y) * plan.scale,
      };
    };
    // The tile plan is expressed in the same offsets, so it rides along rather than being
    // computed twice and drifting.
    project.plan = plan;
    project.viewport = { left: INSET.side, top: INSET.top, usableW, usableH };
    return project;
  }, [route, library, position, detent, overview]);

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
  const standingAt = position?.at ?? null;

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
          One wave front, as the mark draws it.
          
          The logo's ripples are not rings. They are open arcs leaving the glowing point —
          a pair of crescents either side, wrapping but never closing, which is what makes
          them read as *sound leaving a place* rather than as a target reticle or a radar
          sweep. Closed contours were the first thing I drew here and they were wrong for
          exactly that reason: the contour lines say "this is a place", and the ripples say
          "it is calling". Two different ideas that the mark keeps separate, so the map
          should too.
        */}
        <g id="wave">
          <path d="M8 -13.9A16 16 0 0 1 8 13.9" vectorEffect="non-scaling-stroke" />
          <path d="M-8 -13.9A16 16 0 0 0 -8 13.9" vectorEffect="non-scaling-stroke" />
        </g>

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

      {/*
        The basemap. Each tile is a plain `<image>`, positioned by the same projection the
        pins use, so nothing can drift between them.

        `onError` hides a tile that will not load instead of leaving a broken-image mark,
        which is what makes this degrade to the previous design rather than to a mess: with
        every tile hidden you get the dark background and the vector route, exactly as
        before. That matters more than it sounds — the build environment cannot reach a tile
        server at all, so this ships without ever having been seen working here.
      */}
      <g clipPath="url(#mapBand)">
        {projection.plan.tiles.map((t) => (
          <image
            key={`${projection.plan.zoom}/${t.x}/${t.y}`}
            href={TILE_URL(t.x, t.y, projection.plan.zoom)}
            x={t.px + projection.viewport.left}
            y={t.py + projection.viewport.top}
            width={256 * projection.plan.scale}
            height={256 * projection.plan.scale}
            className="map-tile"
            onError={(e) => {
              (e.currentTarget as SVGImageElement).style.display = "none";
            }}
          />
        ))}
      </g>

      <clipPath id="mapBand">
        {/* Pins outside the map's own band used to draw straight over the route ribbon and
            the category chips, which float above it with no background of their own. The
            sheet covers the bottom edge already; this is the top. */}
        <rect x="0" y={MAPBAR_H} width={W} height={H - MAPBAR_H} />
      </clipPath>
      <g clipPath="url(#mapBand)">
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

            {/*
              The echo, echoing.
              
              This is the product's own metaphor and the map was not using it: pins sat
              there as dots with a logo behind them, and the contour rings only moved during
              the twelve seconds of a capture. An echo should be *calling* — rings going out
              from it, over and over, the way a sound leaves a place.

              Two things fall out of that, and both are meaning rather than decoration.
              It only happens while the echo is sealed: the ripple is the unanswered call,
              so finding one is what makes it go quiet, and a map of a finished walk is
              still. And it quickens as you close, from four seconds a ring down to one and
              a half, which is the same proximity model the haptic and the tone already
              run on — three channels saying one thing rather than three.
            */}
            {state === "sealed" && (
              <g className="echo-ripples" style={{ animationDuration: `${ripplePeriod(standingAt, echo)}s` }}>
                <g className="ripple-ring">
                  <use href="#wave" />
                </g>
                <g className="ripple-ring ripple-ring-2">
                  <use href="#wave" />
                </g>
                <g className="ripple-ring ripple-ring-3">
                  <use href="#wave" />
                </g>
              </g>
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

      </g>
      <text className="map-credit" x={W - 8} y={H - NAV_H - 8} textAnchor="end">
        {TILE_ATTRIBUTION}
      </text>
      {here && <Here x={here.x} y={here.y} mode={route.mode} headingDeg={position?.headingDeg ?? null} />}
    </svg>
  );
}

/**
 * You, and how you are travelling.
 *
 * It was a dot, and a dot says *you are here* — which the map already implies by drawing a
 * route under it. The figure says *you are here, on foot*, and that second half is not
 * decoration on this product: the mode decides the corridor width, the timing tolerance and
 * whether guidance is offered at all, so a listener who has switched from the walk to the
 * flight and not noticed is looking at a map that behaves nothing like the one they think
 * they are reading. One glyph, glanced at, is cheaper than a label nobody reads.
 *
 * Heading is drawn two ways, and the split is about what view the glyph is in rather than
 * about which modes matter. A plane is drawn from above — the same view the map is in — so
 * it can simply point where it is going, which is how every flight tracker ever made draws
 * it. A person, a car and a bicycle are drawn from the side, and rotating a side view is
 * how you get a pedestrian lying down at the top of the screen. Those keep their feet and
 * get a pip on the rim instead.
 *
 * `headingDeg` is course over ground, not compass facing: it is which way you are moving,
 * not which way you are pointing. Standing still it is meaningless, and the route profile
 * reports zero at the end of a journey, so the pip goes away rather than confidently
 * pointing north at somebody who has stopped.
 */
function Here({
  x,
  y,
  mode,
  headingDeg,
}: {
  x: number;
  y: number;
  mode: TravelMode;
  headingDeg: number | null;
}) {
  // Drawn from above, so the glyph itself can carry the heading.
  const planView = mode === "flight";
  const spin = headingDeg !== null ? `rotate(${headingDeg.toFixed(1)})` : undefined;

  return (
    <g className={`here here-${mode}`} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
      <circle r="26" fill="url(#hereGlow)" />
      {spin && !planView && <path className="here-pip" d="M0 -25.5L5.4 -16.5H-5.4Z" transform={spin} />}
      <circle className="here-disc" r="13" />
      <g className="here-figure" transform={`${planView && spin ? spin : ""} translate(-7.5 -7.5) scale(0.625)`}>
        {MODE_ICON[mode] ?? MODE_ICON.walking}
      </g>
    </g>
  );
}

/**
 * How long one ring takes to go out, in seconds.
 *
 * Four seconds when an echo is somewhere over there, a second and a half when you are
 * nearly on it. Keyed to the same trigger radius the capture uses, so the quickening is
 * telling the truth about how close "close" is for *this* echo rather than applying one
 * distance to a doorway and a neighbourhood alike.
 */
function ripplePeriod(from: LatLng | null, echo: Echo): number {
  if (!from) return 4;
  const reach = echo.point.triggerRadiusKm * 8;
  const nearness = Math.max(0, Math.min(1, 1 - distanceKm(from, echo.point.at) / reach));
  return 4 - nearness * 2.5;
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
