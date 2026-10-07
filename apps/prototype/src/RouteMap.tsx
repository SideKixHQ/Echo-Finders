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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORY_ICON, CATEGORY_LABEL } from "./categories";
import { EchoCharacter, characterFor } from "./Echo";
import { ClusterDot, FAN_GAP, GROUP_PX } from "./PinCluster";
import { TILE_ATTRIBUTION, TILE_URL, planTiles, toWorld } from "./tiles";
import { MODE_ICON } from "./travel";
import { useSmoothedPoint } from "./use-smoothed";
import { buildRouteGeometry, distanceKm, effectiveRadiusKm, presetFor, rarityOf, type Arriving, type Echo, type LatLng, type Position, type Route, type TravelMode,
  clusterPoints,
  fanOut,
} from "@echofinders/core";

export type PinState = "sealed" | "opening" | "captured" | "heard";

/**
 * How far the warm light reaches, by rarity.
 *
 * Board 2 draws the singular one at 92 and lets it breathe. The gaps between these three
 * numbers ARE the ranking — more of the separation than the opacities do, because a bloom
 * twice the size of another reads as twice as important at a glance, while two blooms of
 * the same size and different alpha just read as two blooms.
 *
 * Uncommon at 26 against a 13px pin is a rim rather than a bloom, which is what lets
 * sixteen of them sit on one screen without becoming a wash. Common gets nothing, because
 * something has to be the floor.
 */
const HALO_R: Record<string, number | undefined> = {
  singular: 92,
  rare: 52,
  uncommon: 26,
};

/**
 * How far, on a map label.
 *
 * Rounded to fifty metres to agree with the echo card and the sheet, which round the same
 * way. Three places on one screen reporting the same distance differently is how somebody
 * stops believing any of them.
 */
const coarse = (km: number): string =>
  km * 1000 < 950 ? `${Math.round((km * 1000) / 50) * 50} m` : `${km.toFixed(1)} km`;

interface Props {
  /** The journey, or `null` when roaming: there is no line and no corridor, only here. */
  readonly route: Route | null;
  /** How the listener is moving. Comes from the route when there is one. */
  readonly mode: TravelMode;
  readonly library: readonly Echo[];
  readonly position: Position | null;
  readonly opening: readonly Arriving[];
  readonly stateOf: (echoId: string) => PinState;
  readonly selectedId: string | null;
  readonly onSelect: (echoId: string) => void;
  /**
   * Show the whole journey instead of following the listener.
   *
   * The two are genuinely different questions — *where am I* and *what is this walk* — and
   * a map can only answer one at a time. Following is the right default once you are
   * moving; the overview is what you want before you set off, and after you have found
   * something and wonder what else is out there.
   */
  readonly overview: boolean;
  /** How far along the route, 0 to 1. Decides where the line stops being flown. */
  readonly progress?: number;
  /** Which basemap to fetch. The pins are drawn for one backdrop or the other, not both. */
  readonly theme: "dark" | "light";
  /**
   * How far in, as a multiple of the mode's own framing.
   *
   * Owned by App rather than by the map, because the control column carries the zoom
   * buttons and the pinch has to move the same number they do. Held here it moved under
   * two fingers and ignored the buttons, which is the worst of both.
   */
  readonly zoom: number;
  readonly onZoom: (next: number) => void;
  /**
   * How far the listener has dragged the view, in screen pixels.
   *
   * The map has never panned. It centres on you, or it fits the journey, and that is the
   * whole set of places it can look — so "what is two streets that way" had no answer
   * except walking there, and a drag did nothing at all, which reads as a broken map
   * rather than as a deliberate one.
   *
   * Pixels rather than a lat/lng centre, deliberately: the offset survives a zoom change
   * and a new position fix without having to be reprojected, and it keeps FOLLOWING
   * alive. The view still tracks you as you walk, just shifted by however far you dragged
   * it. Recentre puts it back.
   */
  readonly pan: { readonly x: number; readonly y: number };
  /**
   * An echo to bring to the middle of the map, or null.
   *
   * Separate from `selectedId` on purpose. Tapping a pin selects it and the map must NOT
   * move — the thing you just aimed at jumping to the centre under your thumb is
   * disorienting and it takes the ground you were reading with it. Stepping through the
   * list with the arrows is the opposite: you cannot see the next one yet, so bringing it
   * to you is the whole action.
   */
  readonly focusId?: string | null;
  /**
   * Pixels of the bottom that something else is covering, above the tab bar.
   *
   * The one bar, today, and there used to be a sheet and a guidance strip under it as
   * well — a whole fraction-of-the-screen calculation, because the sheet had three
   * detents and could be dragged between them. One fixed number replaced the lot when the
   * sheet was retired.
   *
   * It is part of the bottom chrome as far as the map is concerned, so pins, edge markers
   * and the Esri credit all have to clear it — the credit especially, because Esri's
   * licence requires it to be shown and "present in the DOM behind an opaque panel" is
   * not shown. That exact bug is why the credit was moved out from behind the sheet in
   * the first place, and putting a card over the bottom of the map put it straight back.
   */
  readonly reservedBottom?: number;
  readonly onPan: (next: { x: number; y: number }) => void;
}

/*
 * The *screen*, not the phone. `.phone` is 390×844 with 11px of bezel padding, so the
 * surface this draws on is 368×822 — the viewBox was the outer figure, which quietly scaled
 * every inset below by about three percent and put them all slightly in the wrong place.
 */
/*
 * Only a starting guess now, and the reason this comment is longer than the constants.
 *
 * These were the viewBox, fixed, on every phone. An SVG whose viewBox does not match the
 * shape of the box it is in gets letterboxed: at 430x900 the content scaled to 403 wide and
 * sat centred, so the basemap had a navy gutter down each side and every constant below was
 * rendering about ten percent larger than it says. MAPBAR_H of 119 landed at 130. That is
 * the whole reason the map read as a panel inside the app rather than as the app.
 *
 * The viewBox now tracks the element's real pixel size, so one SVG unit is one CSS pixel
 * and these numbers mean what they say. They stay as the first paint's guess, before the
 * observer has measured anything.
 */
const W = 368;
const H = 822;

/*
 * The tab bar, which is the only fixed thing left at the bottom. Everything else down
 * there arrives as `reservedBottom`.
 *
 * This comment used to be about a sheet that grew from 432px to 466px while this number
 * did not, so the bottom of every route quietly slid underneath it. That failure mode is
 * gone with the sheet: there is one number now and the caller passes it.
 */
const NAV_H = 72;
/**
 * How many echoes ripple at once.
 *
 * Four, because that is about what fits on a walking view without the arcs touching, and
 * because every one of them is three continuously animated SVG groups.
 */
/**
 * How far in and out the listener may go, as a multiple of the framing the mode chooses.
 *
 * Exported because the zoom buttons live on the control column now and App owns the
 * number. Two places clamping to two different pairs is how a button goes dead one step
 * before the limit it claims.
 */
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 8;

const RIPPLE_LIMIT = 4;

const clamp = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));

/**
 * How far a creature at `from` has to swing its eyes to look at `to`, in degrees.
 *
 * Screen space rather than bearings, deliberately: the eyes are drawn on the screen, and
 * a true bearing would have them looking at where something IS rather than at where it
 * appears once the map has been rotated, zoomed and dragged. Zero is straight ahead, and
 * the component clamps the result well before it stops reading as a look.
 */
function gazeToward(from: { x: number; y: number }, to: { x: number; y: number }): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI / 6;
}

/** An echo that has gone off the edge, and which edge it went off. */
interface EdgeMark {
  readonly echo: Echo;
  readonly km: number;
  readonly y: number;
  readonly rarity: string;
  readonly side: "left" | "right";
}
/** Half a pin, so a pin *centre* never lands under the chrome and no pin is half-eaten. */
const PIN_R = 16;
/**
 * The route ribbon and the category chips, which float over the map's top edge.
 *
 * A FALLBACK, not the number. This was hardcoded at 119 and the bar actually renders 151
 * tall, because the category chips grew a coloured icon and nobody came back to this
 * line. The gap was 32 pixels of map that pins were allowed to sit in, and the pin
 * sitting in it was the fifteen-echo cluster for the whole of lower Manhattan: measured,
 * `elementFromPoint` at its centre returned `BUTTON.chip`, so the most important object
 * on the screen was behind a filter chip and could not be tapped at all.
 *
 * So the real height is measured off the real element below, and this is only what gets
 * used before the first measurement lands.
 */
const MAPBAR_FALLBACK = 119;
/**
 * How tall the control column is, so a marker can be kept out from behind it.
 *
 * Five objects at 8px apart, of which the zoom pair is a double-height pill: 44*4 + 88,
 * plus four gaps. It tracks `.rail` and `.fab` in `theme.css`; change the column and
 * change this, exactly as with the two heights above.
 */
const RAIL_H = 44 * 4 + 88 + 8 * 4;
/**
 * Where the route and the pins are allowed to be drawn.
 *
 * The map fills the screen; the map bar covers the top and the tab bar plus whatever the
 * caller reserved covers the bottom. A pin you cannot see is worse than a map with less
 * room in it, so this is derived from measured heights rather than eyeballed.
 */
const insetFor = (barH: number, reservedBottom: number) => ({
  top: barH + PIN_R / 2,
  bottom: NAV_H + reservedBottom + PIN_R / 2,
  side: 30,
});

export function RouteMap({
  route,
  mode,
  library,
  position,
  opening,
  stateOf,
  selectedId,
  onSelect,
  overview,
  progress = 0,
  theme,
  zoom,
  onZoom,
  pan,
  onPan,
  focusId = null,
  reservedBottom = 0,
}: Props) {
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
  /*
   * The drawn position, steadied. The engine keeps the raw fix; see `use-smoothed`.
   */
  const at = useSmoothedPoint(position?.at ?? null);

  /**
   * How far in the listener has zoomed, as a multiple of the view the mode chooses.
   *
   * The map has never been zoomable. The mode picked a span — two streets on foot, a
   * couple of hundred kilometres in the air — and that was the only view there was, which
   * is fine for glancing and useless for the two things people actually do with a map:
   * look closer at where they are standing, and pull back to see what is around the
   * corner.
   *
   * A multiplier on `spanKm` rather than a tile zoom level, because the projection already
   * derives everything from the span: one number moves the tiles, the route, the pins and
   * the trigger radii together, and they cannot drift apart. Clamped so it stays within a
   * couple of steps either side of the mode's own framing; past that the corridor stops
   * making sense and the tiles run out.
   */
  /**
   * Which group of piled-up pins is currently fanned open, by the id of its first member.
   *
   * View state, so it lives here rather than in `App` with the rest: nothing above this
   * component needs to know, and a group that is open is a thing about this map at this
   * moment rather than a thing about the walk.
   */
  const [openCluster, setOpenCluster] = useState<string | null>(null);

  const setZoom = useCallback(
    (next: number | ((z: number) => number)) => {
      // A fan drawn around a point that has just moved three streets is worse than none.
      setOpenCluster(null);
      onZoom(clamp(typeof next === "function" ? next(zoom) : next));
    },
    [onZoom, zoom],
  );

  /** Two fingers. Tracked here rather than with a library: it is a distance and a ratio. */
  const pinch = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchFrom = useRef<{ gap: number; zoom: number } | null>(null);
  const lastTap = useRef(0);

  const gap = () => {
    const [a, b] = [...pinch.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  /** Where a one-finger drag started, and the pan it started from. */
  const dragFrom = useRef<{ x: number; y: number; pan: { x: number; y: number } } | null>(null);
  /** Whether this gesture has moved far enough to be a drag rather than a tap. */
  const dragged = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current.size === 2) { pinchFrom.current = { gap: gap(), zoom }; dragFrom.current = null; }
    else if (pinch.current.size === 1) {
      dragFrom.current = { x: e.clientX, y: e.clientY, pan };
      dragged.current = false;
      /*
       * NO POINTER CAPTURE HERE. It used to be taken on every pointerdown, and that is
       * why tapping a pin did nothing at all.
       *
       * While a pointer is captured, the `click` that follows is dispatched at the
       * CAPTURING element rather than at what was under the finger. Instrumented in a
       * browser: pointerdown landed on `circle.pin-body` inside the pin, and both
       * pointerup and click were delivered to `svg.map`. So the pin's own onClick never
       * ran, on any pin, ever — the most basic interaction on the map was dead, and it
       * looked like a hit-target problem, which is what sent the last round after a 44px
       * invisible circle that was already there and already working.
       *
       * Capture is only needed to keep receiving moves once a finger has slid off the
       * element, which cannot happen before the drag has started. So it is taken at the
       * moment the drag threshold is crossed, in `onPointerMove`, and a tap never
       * involves capture at all.
       */
    }
    // Double tap to step in, and to step back out once there is nowhere further in worth
    // going. One finger, which is the gesture somebody uses while holding a coffee.
    if (pinch.current.size === 1) {
      const now = e.timeStamp;
      if (now - lastTap.current < 300) {
        setZoom((z) => clamp(z >= MAX_ZOOM ? 1 : z * 2));
        lastTap.current = 0;
      } else {
        lastTap.current = now;
      }
    }
  }, [zoom, setZoom, pan]);

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!pinch.current.has(e.pointerId)) return;
    pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const from = pinchFrom.current;
    if (pinch.current.size === 2 && from && from.gap !== 0) {
      setZoom(clamp(from.zoom * (gap() / from.gap)));
      return;
    }
    /*
     * One finger drags the map.
     *
     * Six pixels of slop before it counts, because a pin is a 44px target and a thumb
     * moves two or three pixels on the way down. Under the threshold this is still a tap
     * and the pin under it still opens; over it, the gesture becomes a drag and the tap
     * is cancelled, which is the behaviour of every map anybody has used.
     */
    const d = dragFrom.current;
    if (pinch.current.size !== 1 || !d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!dragged.current && Math.hypot(dx, dy) < 6) return;
    if (!dragged.current) {
      dragged.current = true;
      // Now, and not before. See the note in `onPointerDown`.
      e.currentTarget.setPointerCapture(e.pointerId);
      setOpenCluster(null);
    }
    onPan({ x: d.pan.x + dx, y: d.pan.y + dy });
  }, [setZoom, onPan]);

  const onPointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    pinch.current.delete(e.pointerId);
    if (pinch.current.size < 2) pinchFrom.current = null;
    if (pinch.current.size === 0) dragFrom.current = null;
  }, []);

  /**
   * The wheel, on a listener the browser will let us cancel.
   *
   * React attaches `onWheel` passively, so `preventDefault` inside it does nothing and the
   * page scrolls away underneath while you are trying to zoom the map. Scrolling *down*
   * was the visible half of that: the first notch moved the page instead of the map and
   * every notch after it landed somewhere else entirely, so zooming in worked and zooming
   * out appeared completely dead.
   *
   * A native listener registered with `passive: false` is the only way to claim the
   * gesture. Desktop-only in practice, since a phone pinches, but the desktop is where
   * this is built and reviewed.
   */
  const svg = useRef<SVGSVGElement | null>(null);

  /**
   * The map's own size, in CSS pixels, so the viewBox can be it.
   *
   * See the note on `W`/`H`. Without this the map is the one element in the app that does
   * not fit its container, and it fails in the way that is hardest to name: everything is
   * there, slightly too big, with a margin nobody asked for.
   */
  const [box, setBox] = useState({ w: W, h: H });
  useEffect(() => {
    const el = svg.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width < 1 || rect.height < 1) return;
      setBox((current) =>
        Math.abs(current.w - rect.width) < 0.5 && Math.abs(current.h - rect.height) < 0.5
          ? current
          : { w: Math.round(rect.width), h: Math.round(rect.height) },
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /**
   * How much of the top the chrome is actually taking, measured rather than declared.
   *
   * See `MAPBAR_FALLBACK`. A constant that has to agree with a stylesheet is a constant
   * that will disagree with it, and this one had drifted by 32 pixels — enough to hide a
   * cluster of fifteen echoes behind a filter chip.
   *
   * It reaches out of the component for the element, which is not lovely, and the
   * alternative is threading a measured height down from `App` purely so this can be
   * told a fact it is standing next to. The bar is part of the same screen and its
   * bottom edge is the map's top edge; that relationship is what is being measured.
   */
  const [barH, setBarH] = useState(MAPBAR_FALLBACK);
  useEffect(() => {
    const el = svg.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const bar = el.closest(".screen")?.querySelector(".mapbar");
    if (!bar) return;
    const measure = () => {
      const b = bar.getBoundingClientRect();
      const s = el.getBoundingClientRect();
      if (b.height < 1) return;
      // Plus six, so a pin rides just clear of the chips rather than touching them.
      const next = Math.round(b.bottom - s.top + 6);
      setBarH((cur) => (Math.abs(cur - next) < 1 ? cur : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => clamp(z * Math.exp(-e.deltaY / 400)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setZoom]);

  /*
   * Built once per route. It was built twice for every position fix — once in the
   * projection and once for the path — which at four fixes a second is eight route
   * geometries a second, on a flight with a few hundred track points.
   */
  const geometry = useMemo(() => (route ? buildRouteGeometry(route) : null), [route]);

  const projection = useMemo(() => {
    const INSET = insetFor(barH, reservedBottom);

    // The band actually visible between the chips and the sheet. The listener belongs in
    // the middle of *that*, not the middle of a box that is half covered.
    const usableW = box.w - INSET.side * 2;
    const usableH = box.h - INSET.top - INSET.bottom;
    // The listener's drag, applied to where the centre lands on screen. Everything —
    // tiles, route, pins, radii — is projected from this one pair, so the whole map moves
    // together and nothing can drift out of register with the basemap.
    const centreX = INSET.side + usableW / 2 + pan.x;
    const centreY = INSET.top + usableH / 2 + pan.y;

    let centre: LatLng;
    /** How wide the view is on the ground, km, measured across its width. */
    let spanKm: number;

    if (at && !overview) {
      centre = at;
      // Twice the corridor: on foot a couple of streets, in the air a couple of hundred
      // kilometres. The same number that already decides what counts as near on this mode.
      const base = presetFor(mode).corridorKm * 2;
      /*
       * And far enough to actually contain something.
       *
       * The corridor is how wide a route's catchment is, not how far ahead you can see, and
       * on a flight those are nothing like each other: the corridor is 80km, so the view
       * spanned 160km, while the next echo was 149km ahead and the one after it 537km. The
       * result was a plane alone on an empty map with nothing to tap, at the one moment the
       * whole map is supposed to be showing you what is coming. Reaching out to the third
       * nearest echo, with room around it, means there is always something on screen.
       *
       * Only ever widens. A walk whose next echo is round the corner keeps the street view
       * it should have.
       */
      const reach = library
        .map((echo) => distanceKm(at, echo.point.at))
        .sort((a, b) => a - b)[Math.min(2, Math.max(0, library.length - 1))];
      spanKm = Math.max(base, (reach ?? 0) * 2.4) / zoom;
    } else {
      const points = [...(geometry?.points ?? []), ...library.map((e) => e.point.at)];
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
      spanKm = Math.max(acrossKm, (downKm * usableW) / usableH) / zoom;
    }

    // Web Mercator, because the basemap underneath is tiled in it. The old
    // equirectangular projection was fine on its own and would drift against a tile — a pin
    // and the street it is meant to be on would sit a few metres apart at the top of the
    // view and agree at the bottom, which is the sort of wrongness people feel before they
    // can name it.
    /*
     * The zoom comes from the fitted band; the grid covers the whole strip of map that is
     * actually on screen — from under the map bar down to the top of the tab bar.
     */
    const bandTop = barH;
    const bandBottom = box.h - NAV_H;
    const plan = planTiles(
      centre,
      spanKm,
      usableW,
      usableH,
      { x: 0, y: bandTop, w: box.w, h: Math.max(0, bandBottom - bandTop) },
      { x: centreX, y: centreY },
    );
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
    return project;
  }, [mode, geometry, library, at, overview, zoom, box, pan, barH, reservedBottom]);

  const path = useMemo(() => {
    if (!geometry) return "";
    return geometry.points
      .map((p, i) => {
        const { x, y } = projection(p);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }, [geometry, projection]);

  /**
   * Which echoes are allowed to call.
   *
   * Not all of them. The ripple is the unanswered call and it was drawn on every sealed
   * pin, which is right when four are on screen and wrong when twelve are: at the whole-
   * journey zoom the arcs overlap into a haze and the map stops saying anything at all.
   * Worse, thirty-six animated groups is most of a mid-range phone's frame budget.
   *
   * The nearest few, then — the ones somebody could actually walk to from here. In the
   * follow view that is usually everything on screen, so nothing changes; in the overview
   * it turns a haze into four things worth looking at. Rendered rather than hidden in CSS,
   * because a display:none animation still costs a phone.
   */
  const calling = useMemo(() => {
    const sealed = library.filter((echo) => stateOf(echo.id) === "sealed");
    if (!at) return new Set(sealed.slice(0, RIPPLE_LIMIT).map((e) => e.id));
    return new Set(
      sealed
        .map((echo) => ({ id: echo.id, km: distanceKm(at, echo.point.at) }))
        .sort((a, b) => a.km - b.km)
        .slice(0, RIPPLE_LIMIT)
        .map((e) => e.id),
    );
  }, [library, at, stateOf]);

  /*
   * And it closes the moment the map moves. A fan drawn around a point that has slid
   * three streets away is worse than no fan, and "tap the backdrop" is not a thing
   * anybody thinks to do while dragging.
   */
  /*
   * It closes when the map moves UNDER A FINGER, not whenever `pan` changes.
   *
   * The obvious version was an effect on `[zoom, pan]`, and it made the stepper
   * impossible: focusing an echo pans the map to it, the effect fired on the new pan, and
   * the fan it had just opened shut in the same frame. So the two gesture handlers say so
   * themselves, which is also more honest about what is being detected.
   *
   * AND IT WATCHES WHAT IS IN THE LIBRARY, NOT WHICH ARRAY IT IS.
   *
   * This was `[library]`, and on a phone that meant the fan could never stay open for
   * more than a quarter of a second: reported as "you tap on a number, it expands and
   * closes really quickly". `library` comes from a memo that depends on the engine's
   * nearby list, which is a fresh array on every position fix — so on a device with
   * `watchPosition` running, the identity changes four times a second and this effect
   * fired with it. Instrumented, the log was a wall of `CLOSE (library changed)` at 250ms
   * intervals.
   *
   * It survived every test here because a headless browser has a fixed position and stops
   * emitting fixes, which is the one condition under which the bug does not happen.
   *
   * A signature of the ids costs one join over a few dozen strings and fires only when
   * the set of echoes on the map actually changes: a category turned off, or something
   * coming into range. That is the case this was for.
   */
  const librarySignature = useMemo(() => library.map((e) => e.id).join(","), [library]);
  useEffect(() => setOpenCluster(null), [librarySignature]);

  /**
   * The pins, grouped by what landed on top of what.
   *
   * See `pin-clusters.ts` in the engine for why this is greedy rather than single link,
   * and for the measurements that made it necessary. The grouping is in screen pixels, so
   * it loosens by itself as somebody zooms in: two echoes a hundred metres apart are one
   * dot at city scale and two pins in a street.
   */
  const groups = useMemo(
    () =>
      clusterPoints(
        library.map((echo) => {
          const { x, y } = projection(echo.point.at);
          return { item: echo, x, y };
        }),
        GROUP_PX,
      ),
    [library, projection],
  );

  /**
   * Bring the stepper's echo to the middle, and open its group if it is in one.
   *
   * The pan is worked out from where the echo IS on screen rather than from latitudes:
   * `projection` already knows, `pan` is a straight pixel offset on the centre, so the
   * move is the difference between where the thing is and where the middle of the visible
   * band is. No second copy of the projection maths to fall out of step with the first.
   *
   * "The middle of the visible band" and not the middle of the screen. The chips cover
   * the top and the sheet covers the bottom, and centring into a box that is half hidden
   * puts the echo you just asked for behind the sheet — which `insetFor` exists to
   * prevent and which every other part of this component already respects.
   *
   * And it opens the group, because a stepper that says "3 of 26" and then centres on a
   * dot labelled 15 has answered a different question. Clustering and stepping only work
   * together.
   */
  const lastFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!focusId || focusId === lastFocus.current) {
      lastFocus.current = focusId;
      return;
    }
    lastFocus.current = focusId;
    const echo = library.find((e) => e.id === focusId);
    if (!echo) return;
    const inset = insetFor(barH, reservedBottom);
    const wantX = inset.side + (box.w - inset.side * 2) / 2;
    const wantY = inset.top + (box.h - inset.top - inset.bottom) / 2;
    const now = projection(echo.point.at);
    // A move of a couple of pixels is not a move, and calling onPan for it would churn
    // the projection for nothing.
    if (Math.hypot(wantX - now.x, wantY - now.y) > 2) {
      onPan({ x: pan.x + (wantX - now.x), y: pan.y + (wantY - now.y) });
    }
    const group = groups.find((g) => g.members.some((m) => m.item.id === focusId));
    setOpenCluster(group && group.members.length > 1 ? group.members[0]!.item.id : null);
  }, [focusId, library, projection, groups, pan, onPan, box, barH, reservedBottom]);

  const openingById = new Map(opening.map((a) => [a.echo.id, a]));
  const here = at ? projection(at) : null;
  const standingAt = at;

  /**
   * The best thing you cannot see, and which way it is.
   *
   * A map only shows what fits, and the one echo most worth walking to is routinely the one
   * just off the edge. Without this the screen quietly says "nothing much here" when the
   * truth is "the good one is two streets that way".
   *
   * Rare and singular only, and only while sealed — the same restraint as the pin labels,
   * for the same reason. Nearest wins among equals, because a marker pointing four hundred
   * metres away when there is one at ninety is pointing at the wrong thing.
   */
  const edge = useMemo(() => {
    if (!at || overview) return null;
    const off: EdgeMark[] = [];
    for (const echo of library) {
      const state = stateOf(echo.id);
      if (state !== "sealed" && state !== "opening") continue;
      const p = projection(echo.point.at);
      // On screen already: the pin speaks for itself.
      const onScreen =
        p.x >= -PIN_R && p.x <= box.w + PIN_R && p.y >= barH && p.y <= box.h - NAV_H;
      if (onScreen) continue;
      const rarity = rarityOf(echo);
      off.push({
        echo,
        km: distanceKm(at, echo.point.at),
        // Clamped into the band, so a marker rides the edge rather than leaving with it.
        y: Math.max(barH + 40, Math.min(box.h - NAV_H - 80, p.y)),
        rarity,
        // Which side it went out of. A marker on the right pointing at something behind
        // your left shoulder is worse than no marker.
        side: p.x < box.w / 2 ? ("left" as const) : ("right" as const),
      });
    }
    /*
     * Rare and singular first, then nearest. The warm ones are what the board's marker is
     * for, and the rest are here because the map can now be zoomed: at 4x most of what is
     * around you is off the edge, and a map that silently hides two thirds of its content
     * the moment you look closer is not a map you can navigate with.
     */
    const rank = (m: EdgeMark) => (m.rarity === "singular" ? 0 : m.rarity === "rare" ? 1 : 2);
    off.sort((a, b) => rank(a) - rank(b) || a.km - b.km);
    /*
     * How many, and it depends on whether the listener asked to look closer.
     *
     * At the mode's own framing the map shows a couple of streets while "nearby" reaches
     * much further, so almost everything in the list is off the edge by definition. Three
     * markers there is not help, it is permanent furniture: a rendered walk had pointers
     * to 900 m, 1.1 km and 1.4 km sitting over the pins that were actually on screen,
     * every second of every walk, saying nothing the bar below was not already saying
     * in full. So at or below the default framing this behaves like board 2 and shows the
     * one marker the board shows, for the echo actually worth the walk.
     *
     * Zoomed IN, they earn their place: the listener has narrowed the frame themselves,
     * and things leaving it is a consequence of that rather than the resting state.
     */
    const shown = zoom > 1.05
      ? off.slice(0, 3)
      : off.filter((m) => m.rarity === "singular" || m.rarity === "rare").slice(0, 1);

    /*
     * Out from under the control column, and out from under each other.
     *
     * The column lives on the right, bottom-anchored, and a marker is drawn at the height
     * of the echo it points at — so a marker and a fab want the same pixels often enough
     * that the first render had one sitting squarely behind the zoom buttons, tappable by
     * neither. Right-hand markers are pushed above the column's top; then every marker is
     * separated downward so two echoes at a similar bearing do not stack into one
     * unreadable pill with only the top one reachable.
     */
    const railBottom = box.h - (NAV_H + reservedBottom + 12);
    const railTop = railBottom - RAIL_H;
    const floor = barH + 40;
    let lastY = -Infinity;
    return shown.map((mark) => {
      let y = mark.y;
      if (mark.side === "right" && y > railTop - 18 && y < railBottom + 18) {
        y = railTop - 26;
      }
      if (y - lastY < 40) y = lastY + 40;
      y = Math.max(floor, y);
      lastY = y;
      return { ...mark, y };
    });
  }, [at, overview, library, stateOf, projection, box, zoom, barH, reservedBottom]);

  /**
   * One pin, drawn wherever it has been put.
   *
   * Split out of the `library.map` it used to live inside, because a pin no longer
   * necessarily sits at its own projected position: when a group is fanned open, its
   * members are drawn out around the group's centre. Everything else about it is
   * unchanged.
   */
  const renderPin = (echo: Echo, x: number, y: number) => {
      const state = stateOf(echo.id);
      const arriving = openingById.get(echo.id);
      const selected = selectedId === echo.id;

      // The trigger radius, drawn to scale. Seeing how big "here" actually is explains
      // the whole mechanic faster than any label.
      const radiusPx = radiusToPixels(echo, projection);

      return (
        <g
          key={echo.id}
          className={`pin pin-${state} cat-${echo.category}${selected ? " pin-selected" : ""}${
            echo.id === focusId ? " pin-focus" : ""
          }`}
          transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
          data-echo={echo.id}
          onClick={() => onSelect(echo.id)}
          role="button"
          aria-label={echo.title}
        >
          {/*
            Something to actually hit.
            A `<g>` has no geometry of its own, so an SVG tap only lands if it hits a
            child — and the only solid child here is a 13px circle. Tapping a pin
            therefore worked when you were accurate to about six pixels and silently did
            nothing otherwise, which is most taps on a pavement and, it turns out, every
            synthetic one: the bounding box includes the ripple rings, so its centre is
            not the pin. This is a 44px target, invisible, concentric with the pin.
          */}
          <circle className="pin-hit" r="22" />

          {/* The bloom, on the one the arrows are on. */}
          {echo.id === focusId && <circle className="pin-focus-ring" r="16" />}

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
          {state === "sealed" && calling.has(echo.id) && (
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

          {/* Rarity, in front of the ground and behind the pin. */}
          {(state === "sealed" || state === "opening") &&
            (() => {
              const rarity = rarityOf(echo);
              const r = HALO_R[rarity];
              if (!r) return null;
              return <circle className={`pin-halo pin-halo-${rarity}`} r={r} />;
            })()}

          <Contours />

          {/*
            A ring in the category's colour with its glyph inside — the design's pin, not
            a dot. At 26px a colour alone cannot carry nine categories: anybody who does
            not already know the key is looking at coloured dots, and the icon is what
            makes the colour mean something before it is tapped.
          */}
          {/*
            THE TWO RARITIES ARE CREATURES; everything else is a ring with its glyph.

            A face cannot carry a category — there is no drawing of a sphere that means
            "food and drink" — so the glyph is doing a job the creature cannot take
            over, and nine faces on one map is a crowd with no standout in it. The
            creature is spent on exactly the pins the rest of this screen is built to
            make you walk towards.

            Its eyes are a pause button, which is the whole idea: a sealed echo is a
            story that has been PAUSED at this corner, in some cases for a century.
          */}
          {(() => {
            const face = characterFor(rarityOf(echo), state);
            return face ? (
              <EchoCharacter
                face={face}
                r={rarityOf(echo) === "singular" ? 15 : 13}
                uid={echo.id}
                /* It looks at you. The bearing is already computed for the walk. */
                gazeDeg={standingAt ? gazeToward({ x, y }, projection(standingAt)) : 0}
              />
            ) : (
              <>
                <circle className="pin-body" r="13" />
                <g className="pin-icon" transform="translate(-7 -7) scale(0.583)">
                  {CATEGORY_ICON[echo.category]}
                </g>
              </>
            );
          })()}

          {arriving && <ProgressRing progress={arriving.progress} />}

          {/* The found marker sits on the rim, as it does in the design. */}
          {(state === "captured" || state === "heard") && (
            <circle className="pin-found" r="4" cx="9.5" cy="9.5" />
          )}

          {/*
            WHAT IT IS WORTH, AND HOW FAR, under the pin.

            Only on the rare and singular ones, and only while they are still sealed.
            That restraint is the point rather than a saving: a label under every pin is
            a map of labels, and the whole reason this line exists is to make two pins on
            a screen of nine pull you towards them. Once an echo is yours it has nothing
            left to advertise.

            The board also put "4 people have stood here" here. That needs a backend
            counting syncs across everybody, and there isn't one.
          */}
          {(state === "sealed" || state === "opening") &&
            (() => {
              const rarity = rarityOf(echo);
              if (rarity !== "rare" && rarity !== "singular") return null;
              const away = at ? distanceKm(at, echo.point.at) : null;
              return (
                <text className={`pin-tag pin-tag-${rarity}`} y="27" textAnchor="middle">
                  {rarity === "singular" ? "Singular" : "Rare"}
                  {away !== null && ` · ${coarse(away)}`}
                </text>
              );
            })()}
        </g>
      );
  };

  return (
    <svg
      /* `map-focusing` dims everything that is not the echo the arrows are on. The
         bloom alone is not enough on a map of twenty six pins: it says "this one is
         special" where the job is to say "this one, and you can ignore the rest". */
      className={focusId ? "map map-focusing" : "map"}
      viewBox={`0 0 ${box.w} ${box.h}`}
      role="img"
      aria-label="Walking route"
      /* Exposed so a test can assert the gesture actually moved it, rather than
         inferring zoom from the distance between two pins. */
      data-zoom={zoom.toFixed(3)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      ref={svg}
    >
      <defs>
        {/*
          The cone fades out with distance rather than ending in a hard arc, because what
          it is drawing is confidence and confidence does not have an edge. Flat fill read
          as a solid wedge of teal laid over the streets.
        */}
        <radialGradient id="coneFade" gradientUnits="objectBoundingBox" r="0.7" cx="0.5" cy="1">
          <stop offset="0%" stopColor="var(--aqua)" stopOpacity="0.34" />
          <stop offset="55%" stopColor="var(--aqua)" stopOpacity="0.12" />
          <stop offset="100%" stopColor="var(--aqua)" stopOpacity="0" />
        </radialGradient>

        {/*
          THE INK. What turns a grey street map into the design's night map.

          Board 2 does not have a basemap at all: its "map" is a drawn navy field with
          soft roads and building blocks over it, and that deep indigo is most of why the
          board reads as this app rather than as a map with our pins on it. The app loads
          Esri's grey canvas, which is a fine map and the wrong colour — grey ends up the
          largest thing on screen and competes with the cool pins that are supposed to BE
          the content. Dropping the tiles to 38% opacity made it dimmer, not navier.

          So the grey is remapped rather than faded. Desaturate, then push luminance
          through the board's own three colours: its darkest field at the black end, its
          road ink in the middle, its building outline at the white end. Esri's land goes
          to deep navy and Esri's roads go to the lighter indigo the board draws roads in,
          because that is the same luminance relationship the board already has.

          A colour matrix is per-pixel with no spatial term, so tiles cannot seam.

          Dark only. A light map should stay a light map, and the board is a night screen.
        */}
        <filter id="mapInk" colorInterpolationFilters="sRGB">
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            {/*
              Five stops, not three, and the reason is Esri rather than taste: its dark
              canvas spends its whole range between about 0.1 and 0.5 luminance, so a ramp
              spread evenly over 0 to 1 squeezed every street and every building into the
              bottom fifth of it and the map came out a flat navy sheet. These put the
              board's three colours in the first half, where the tiles actually live, and
              leave two lighter stops above for the pale things Esri reserves for labels
              and motorways.

              #080B1E → #111737 → #1C2450 → #26306A → #303C80.
            */}
            <feFuncR type="table" tableValues="0.031 0.067 0.110 0.149 0.188" />
            <feFuncG type="table" tableValues="0.043 0.090 0.141 0.188 0.235" />
            <feFuncB type="table" tableValues="0.118 0.216 0.314 0.416 0.502" />
          </feComponentTransfer>
        </filter>

        {/*
          The field the board paints under everything, in its own numbers: lit at the top
          where the chrome is, falling away to almost black at the bottom corners. It sits
          under the tiles rather than over them, so a tile that fails to load degrades to
          this rather than to a flat slab.
        */}
        <radialGradient id="mapField" cx="50%" cy="4%" r="108%">
          <stop offset="0%" stopColor="#141A3D" />
          <stop offset="46%" stopColor="#0D1230" />
          <stop offset="100%" stopColor="#080B1E" />
        </radialGradient>

        {/* Transparent in the middle, dark at the corners. See `.map-vignette`. */}
        <radialGradient id="mapEdge" cx="50%" cy="44%" r="76%">
          <stop offset="38%" stopColor="#04060f" stopOpacity="0" />
          <stop offset="100%" stopColor="#04060f" stopOpacity="0.62" />
        </radialGradient>

        {/*
          YOU, AND THE LIGHT YOU THROW.
          
          Two stops became three, and the fall-off moved. A straight ramp from 0.5 to
          nothing is a smudge: at every radius it is a bit transparent, so it reads as a
          blurred dot rather than as light coming off something. Holding most of the
          strength through the first third and then dropping fast is how a light source
          behaves, and it is what makes the middle look bright rather than merely large.
        */}
        <radialGradient id="hereGlow">
          <stop offset="0%" stopColor="var(--aqua)" stopOpacity="0.72" />
          <stop offset="34%" stopColor="var(--aqua)" stopOpacity="0.34" />
          <stop offset="68%" stopColor="var(--aqua)" stopOpacity="0.1" />
          <stop offset="100%" stopColor="var(--aqua)" stopOpacity="0" />
        </radialGradient>

        {/*
          THREE STRENGTHS OF THE SAME WARM LIGHT, and the gaps between them are the ranking.

          It used to be two, with common AND uncommon getting nothing, under the argument
          that a glow on everything is a glow on nothing. The argument is right and the
          line was drawn in the wrong place: counted against the real library, 16 of 26
          echoes are uncommon, so "uncommon" was a tier the map never showed at all, and
          the one rare echo had to carry the entire warm channel on its own.

          So uncommon gets a light, and it is deliberately TIGHT rather than faint — 26
          against a 13px pin, which is a rim on the pin itself rather than a bloom around
          it. Sixteen rims read as a warm speckle across a neighbourhood; sixteen blooms
          would be a wash, which is the thing the old argument was actually about. Radius
          is doing the separating here, not just opacity.

          Rare and singular went up hard. At 0.24 the rare halo was a slightly warmer patch
          of navy and the listener could not see it, which is the whole report.
        */}
        <radialGradient id="raritySingular">
          <stop offset="0%" stopColor="var(--ember)" stopOpacity="0.62" />
          <stop offset="30%" stopColor="var(--ember)" stopOpacity="0.3" />
          <stop offset="64%" stopColor="var(--ember)" stopOpacity="0.1" />
          <stop offset="100%" stopColor="var(--ember)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="rarityRare">
          <stop offset="0%" stopColor="var(--ember)" stopOpacity="0.5" />
          <stop offset="34%" stopColor="var(--ember)" stopOpacity="0.22" />
          <stop offset="70%" stopColor="var(--ember)" stopOpacity="0.06" />
          <stop offset="100%" stopColor="var(--ember)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="rarityUncommon">
          <stop offset="0%" stopColor="var(--ember)" stopOpacity="0.4" />
          <stop offset="52%" stopColor="var(--ember)" stopOpacity="0.16" />
          <stop offset="100%" stopColor="var(--ember)" stopOpacity="0" />
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
      <rect className="map-field" x="0" y="0" width={box.w} height={box.h} />

      <g clipPath="url(#mapBand)">
        {projection.plan.tiles.map((t) => (
          <image
            key={`${theme}/${projection.plan.zoom}/${t.x}/${t.y}`}
            href={TILE_URL(t.x, t.y, projection.plan.zoom, theme)}
            x={t.px}
            y={t.py}
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
            the category filter, which float above it with no background of their own. The
            bar and the tab bar cover the bottom edge already; this is the top. */}
        <rect x="0" y={barH} width={box.w} height={box.h - barH} />
      </clipPath>
      <g clipPath="url(#mapBand)">
      {/* No line when roaming. A route drawn through echoes somebody has not agreed to
          walk is a suggestion pretending to be a plan. */}
      {/*
        The route, in the design's three passes rather than one.

        It was a single line in an indigo-to-violet gradient, which looked like a route on a
        transit map and said nothing. The design draws it three times in one aqua: a wide
        soft casing so it reads against any basemap, the whole path dotted, and the part you
        have already covered solid over the top. That last one is the point. The line tells
        you where you are on the journey without a number, and the dots ahead are the part
        that has not happened yet.

        `pathLength="1"` normalises the path to a length of one, so the dash pattern is just
        the progress fraction and no arc-length maths is needed.
      */}
      {path && <path d={path} className="route-casing" />}
      {path && <path d={path} className="route-ahead" />}
      {path && (
        <path
          d={path}
          className="route-flown"
          pathLength="1"
          strokeDasharray={`${Math.max(0, Math.min(1, progress))} 1`}
        />
      )}

      {/*
        PINS, GROUPED BY WHAT LANDED ON TOP OF WHAT.

        Measured on the Manhattan map: twenty six pins drawn, and fifteen of them within
        one pixel of (317.7, 143.2). Seventeen of the twenty six had a nearest neighbour
        at a distance of zero, and zooming in twice did not change that — coincident
        points stay coincident however you scale them. Whatever was on top won every tap
        and fourteen stories were unreachable.

        So anything that lands within a thumb of a group's centre joins the group and the
        group draws as one numbered dot. Tapping it fans the members out onto rings at
        hittable spacing, with a line back to where they really are, and tapping the
        backdrop or moving the map puts them away.
      */}
      {groups.map((group) => {
        const first = group.members[0]!.item;
        if (group.members.length === 1) return renderPin(first, group.x, group.y);
        /*
         * Whether a group is open is answered at render time from the group that is
         * actually here, rather than trusted from state. Grouping is recomputed every
         * time the map moves, so an id held in state can stop naming a group at any
         * moment; asking each group whether it is the open one means a stale id simply
         * draws nothing instead of needing an effect to chase it.
         */
        if (openCluster !== first.id) {
          return (
            <ClusterDot
              key={first.id}
              x={group.x}
              y={group.y}
              members={group.members.map((m) => m.item)}
              onOpen={() => setOpenCluster(first.id)}
            />
          );
        }
        const spokes = fanOut(group.members.length, FAN_GAP);
        /*
         * Keep the fan on the glass. A group near an edge would otherwise throw half its
         * members off the side, which is the bug it exists to fix, inside out. The whole
         * ring is shifted rather than individual pins, so the spokes stay straight and
         * the shape still reads as one group.
         */
        const reach = Math.max(...spokes.map((s) => Math.hypot(s.x, s.y))) + PIN_R;
        const bandBottom = box.h - NAV_H - reservedBottom;
        /*
         * And clear of the control column, which is drawn over the map on the right.
         *
         * Rendered, three of the fifteen fanned pins came out behind the zoom buttons —
         * separated from each other by a full thumb and then covered by something else,
         * which is the same echo unreachable for a different reason. 58 is the column
         * plus its margin. Ignored when the fan is too wide for what is left, because a
         * fan pushed off the left edge is worse than one under the fabs.
         */
        const gutter = 58;
        const right = box.w - reach - gutter;
        const cx = right > reach ? Math.max(reach, Math.min(right, group.x)) : box.w / 2;
        const cy = Math.max(barH + reach, Math.min(bandBottom - reach, group.y));
        return (
          <g key={first.id} className="fan">
            {/* Under the fan and over everything else: anywhere else is a way out. */}
            <rect
              className="fan-backdrop"
              x="0"
              y={barH}
              width={box.w}
              height={box.h - barH}
              onClick={() => setOpenCluster(null)}
            />
            {/* Where they actually are, and a line from it to each one. Without this the
                fan is just pins in the wrong places. */}
            <circle className="fan-anchor" cx={group.x} cy={group.y} r="4" />
            {spokes.map((s, i) => (
              <line
                key={i}
                className="fan-spoke"
                x1={group.x}
                y1={group.y}
                x2={cx + s.x}
                y2={cy + s.y}
              />
            ))}
            {group.members.map((m, i) => (
              <g
                key={m.item.id}
                className="fan-pop"
                /* Staggered, so the ring opens rather than blinking on. Ten milliseconds
                   apart: fifteen of them is a fifth of a second end to end. */
                style={{ animationDelay: `${i * 0.01}s` }}
                /* Bubbles up from the pin's own onClick, so picking one both selects it
                   and puts the fan away. */
                onClick={() => setOpenCluster(null)}
              >
                {renderPin(m.item, cx + (spokes[i]?.x ?? 0), cy + (spokes[i]?.y ?? 0))}
              </g>
            ))}
          </g>
        );
      })}


      </g>
      {/*
        The attribution, where it can actually be read.
        
        It was placed eight pixels above the tab bar — which was a couple of hundred pixels
        *behind* the sheet at every detent, so it went a long time without once being
        visible. Esri's licence requires it to be shown, and a credit line that is present
        in the DOM and covered by an opaque panel is not shown. It now sits at the bottom
        of whatever strip of map is on screen, above the bar, which is where every map on
        the web puts it.
      */}
      {/* Left, not right: the control column lives on the right and the credit was being
          drawn straight through it, one unreadable line over three buttons. */}
      <text
        className="map-credit"
        x={16}
        y={box.h - insetFor(barH, reservedBottom).bottom - 6}
        textAnchor="start"
      >
        {TILE_ATTRIBUTION}
      </text>
      {here && <Here x={here.x} y={here.y} mode={mode} headingDeg={position?.headingDeg ?? null} />}

      {/*
        THE VIGNETTE, and it is most of why the board looks like night and the app looked
        washed out.

        Esri's grey canvas is a light basemap however dark its name is, and at 85% over a
        deep blue ground the result is a pale rectangle with the app's furniture floating on
        it. The design does not darken the tiles — it darkens the EDGES, which pushes the
        streets back without flattening the middle, and leaves the lit things (the pins, the
        walker, a halo) sitting in the one part that is still bright.

        `pointer-events: none` in CSS, or it would eat every tap meant for a pin under it.
      */}
      <rect className="map-vignette" x="0" y={barH} width={box.w} height={box.h - barH} />

      {/*
        The best thing you cannot see, riding the right edge. Tapping it selects the echo,
        which is the whole offer: here is the good one, and it is that way.

        Above the vignette, because a marker the vignette dims is a marker at the darkest
        part of the screen.
      */}
      {edge?.map((mark) => {
        const warm = mark.rarity === "singular" || mark.rarity === "rare";
        const right = mark.side === "right";
        /*
          The plate holds a glyph and a distance, and nothing else.

          It carried the category NAME first, and "FOOD & DRINK · 450 M" ran straight off
          the screen: a fixed-width plate on an SVG cannot grow to its text, and the two
          longest category names are half again as long as the shortest. The glyph is the
          same mark the pin draws and the chip carries, so the name was saying in eleven
          characters what the map already says in a symbol, while the one piece of
          information you actually navigate by got pushed off the edge.
        */
        const label = warm ? (mark.rarity === "singular" ? "Singular" : "Rare") : coarse(mark.km);
        const name = warm
          ? `${mark.rarity === "singular" ? "Singular" : "Rare"} ${CATEGORY_LABEL[mark.echo.category]}`
          : CATEGORY_LABEL[mark.echo.category];
        return (
          <g
            key={mark.echo.id}
            className={warm ? "map-edge map-edge-warm" : "map-edge"}
            transform={`translate(${right ? box.w : 0} ${mark.y.toFixed(1)})`}
            onPointerDown={(e) => {
              e.stopPropagation();
              onSelect(mark.echo.id);
            }}
            role="button"
            aria-label={`${name} echo, ${coarse(mark.km)} away, off the ${mark.side} edge of the map. Open it.`}
          >
            {/* Mirrored for the left edge, so the plate hangs INTO the screen either way. */}
            <g transform={right ? undefined : "scale(-1 1)"}>
              <rect className="map-edge-plate" x="-118" y="-17" width="124" height="34" rx="14" />
            </g>
            <g
              className="map-edge-glyph"
              transform={`translate(${right ? -104 : 104} 0) scale(0.6) translate(-12 -12)`}
            >
              {CATEGORY_ICON[mark.echo.category]}
            </g>
            <text
              className="map-edge-text"
              x={right ? -88 : 88}
              y="4"
              textAnchor={right ? "start" : "end"}
            >
              {label}
            </text>
            <path
              className="map-edge-arrow"
              d={right ? "M-20 -5 L-14 0 L-20 5" : "M20 -5 L14 0 L20 5"}
            />
          </g>
        );
      })}
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
 * **In the air this is the design's own aeroplane**, and it is worth saying what that
 * changes, because the version before it shared nothing with the design but the word: a
 * 15px aqua outline sitting inside a dark disc with a ring round it. The design's is a
 * 32px glyph, *filled white*, with an aqua glow thrown behind it, standing on nothing at
 * all — and the difference is not fussiness. A disc is a pin, and a pin says *a thing is
 * here*; the whole point of the aircraft mark is that it is not a place, it is you, moving.
 * Path and treatment are lifted verbatim from `design/SPEC.md`.
 *
 * Heading is drawn two ways, and the split is about what view the glyph is in rather than
 * about which modes matter. A plane is drawn from above — the same view the map is in — so
 * it simply points where it is going, which is how the design does it and how every flight
 * tracker ever made does it. A person, a car and a bicycle are drawn from the side, and
 * rotating a side view is how you get a pedestrian lying down at the top of the screen.
 * Those keep their feet, keep the disc that makes them legible over streets, and get a pip
 * on the rim instead.
 *
 * `headingDeg` is course over ground, not compass facing: it is which way you are moving,
 * not which way you are pointing. Standing still it is meaningless, and the route profile
 * reports zero at the end of a journey, so the pip goes away rather than confidently
 * pointing north at somebody who has stopped.
 */
/**
 * A 66 degree wedge reaching 96px ahead, pointing up before it is rotated.
 *
 * The angle is the honest one rather than a pretty one: a phone's course over ground on
 * foot is routinely thirty degrees out either way, so a cone narrower than this would
 * claim a precision the number does not have.
 */
/*
 * WHICH WAY YOU ARE POINTED, and the board's wedge is bigger and brighter than mine was.
 *
 * 96px at plus or minus 33 degrees, against board 2's 110 at a little over 28 either side
 * of a wider sweep. Asked for "bright and wide", so: 124px, plus or minus 42 degrees, and
 * the gradient's inner stop lifted from 0.22 to 0.34. It is still a cone rather than a
 * beam because what it draws is course over ground, which is meaningless below walking
 * pace and wobbles hard at it; a narrow bright ray would claim a precision the sensor has
 * not got. Wide and soft is the honest shape, and now it is a wide soft shape you can
 * actually see from a hand at waist height.
 *
 * 124 * sin(42°) = 82.98, 124 * cos(42°) = 92.15.
 */
const CONE = "M0 0 L-82.98 -92.15 A124 124 0 0 1 82.98 -92.15 Z";

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
  const spin = headingDeg !== null ? `rotate(${headingDeg.toFixed(1)})` : "";

  // In the air, the design's mark exactly: 32 across, filled, glowing, on nothing.
  if (mode === "flight") {
    return (
      <g
        className="here here-flight"
        transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) ${spin}`}
      >
        <g transform="translate(-16 -16) scale(1.3333)">
          <path className="here-plane" d={PLANE} />
        </g>
      </g>
    );
  }

  return (
    <g className={`here here-${mode}`} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
      {/*
        WHICH WAY YOU ARE POINTED, as a cone rather than only a pip.

        A 5px triangle on the rim says the direction and nothing about how sure we are of
        it, and the answer is "not very": this is course over ground, which is meaningless
        below walking pace and wobbles hard at it. A wide soft cone is the honest shape for
        a bearing with that much slop in it, and it is legible from a hand at waist height
        where the pip is not.

        Only when there is a heading at all. Drawn from the same rotation as the pip, so
        the two can never disagree.
      */}
      {spin && <path className="here-cone" d={CONE} transform={spin} />}
      {/*
        The light you throw, 26 to 40.
        
        It is the only aqua bloom on the map and it was smaller than a rare echo's ember
        one, which had the screen quietly saying that a story two streets away matters more
        than where you are standing.
      */}
      <circle r="40" fill="url(#hereGlow)" />
      {/*
        ON FOOT, YOU ARE A DOT. No figure inside it.

        The walking glyph was mine, not the board's: board 2 draws a plain bright aqua
        disc with a soft halo and a ring breathing out of it, and nothing in the middle.
        Asked whether the figure could be a picture instead, and the board's answer is
        better than either — the mark says "you are here" and the cone in front of it says
        which way you face, so a figure inside is a third thing saying what the other two
        already said, at 8 pixels, where it reads as a smudge.

        The other ground modes keep their glyph. A car and a bicycle are genuinely
        different things to be, the board does not cover them, and dropping the
        distinction because one screen did not need it would be overreading it.
      */}
      {mode === "walking" ? (
        <>
          {/*
            Two rings rather than one, half a beat apart. One ring leaving a dot is a
            pulse; two is a source that keeps sending, which is what the mark means and
            what the pins' own ripples already do.
          */}
          <circle className="here-ring" r="13" />
          <circle className="here-ring here-ring-2" r="13" />
          <circle className="here-dot" r="11" />
        </>
      ) : (
        <>
          {spin && <path className="here-pip" d="M0 -25.5L5.4 -16.5H-5.4Z" transform={spin} />}
          <circle className="here-disc" r="13" />
          <g className="here-figure" transform="translate(-7.5 -7.5) scale(0.625)">
            {MODE_ICON[mode] ?? MODE_ICON.walking}
          </g>
        </>
      )}
    </g>
  );
}

/**
 * The design's aeroplane, verbatim.
 *
 * Drawn in a 24 box and scaled to the 32 the design renders it at. Do not redraw it: the
 * last two attempts to approximate this from memory produced something that read as a
 * different product.
 */
const PLANE =
  "M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V18l-2 1.5V21l3.5-1 3.5 1v-1.5L13 18v-4.5L21 16z";

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
