/**
 * The journey at the top of the map, and the one place to change it.
 *
 * On foot and driving it is a small chip (how you are travelling, and either "Exploring"
 * or the time left on a route) so the category chips get the rest of the row: on a walk
 * they are what you change as you go, and board 2 of the canvas draws them as a row. On
 * a flight it wraps the origin-to-destination ribbon, because a passenger cannot look out
 * of the window and the line is the orientation.
 *
 * TAP opens a small trip sheet under it: a visible Walk / Drive / Fly row, then the
 * choices for that mode — "Around here, no route" or one of its routes — and a link to the
 * full journey screen. Every comparable app keeps travel mode one visible tap away (Google
 * and Apple Maps' mode row, Strava's sport icon); none hides it behind a long press, and
 * Apple's guidelines say a gesture must never be the only way to an important action. So
 * there is no press-and-hold here.
 *
 * NOTHING COMMITS UNTIL A CONCRETE CHOICE IS MADE. Switching the Walk / Drive / Fly row only
 * changes what the sheet lists; the journey changes when you pick "Around here" or a route.
 * That is what stops "Flying" leaving the app half-switched — flying with a walking route
 * still selected — when you change your mind before picking a flight.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { distanceKm, type LatLng, type Route } from "@echofinders/core";
import { MODE_ICON } from "./travel";
import { stopWaypoints } from "./guided-walk";
import { inApp } from "./native-bridge";

export type Travel = "walking" | "driving" | "flight";

export interface JourneyChipProps {
  /** How you are travelling now. */
  readonly travel: Travel;
  readonly roaming: boolean;
  readonly route: Route;
  readonly routes: readonly Route[];
  /** Echoes along each route, by id. */
  readonly counts: Readonly<Record<string, number>>;
  /** A journey was taken from the journey screen (Choose what plays). */
  readonly kept: boolean;
  /** Short text on the chip: "Exploring", or the time left on a route. */
  readonly label: string;
  /** 0–1 along the route, drawn as the chip's fill. Null while roaming. */
  readonly progress: number | null;
  /** The accessible name, which says in full what the chip says in a word. */
  readonly name: string;
  /** The flight ribbon, drawn inside the button instead of the chip's own face. */
  readonly children?: ReactNode;
  readonly onRoam: (mode: "walking" | "driving") => void;
  readonly onRoute: (route: Route) => void;
  /** The full journey screen, opened on the mode the sheet was showing. */
  readonly onDetails: (mode: Travel) => void;
  /** Plan a walk from here: pick echoes, or a time, and get the way round them mapped. */
  readonly onPlan?: () => void;
  /** Where the listener is, if known: tours near it are offered first. */
  readonly here?: LatLng | null;
  /**
   * The whole route on the map, start to end: what the framing button on the map did
   * before the map came down to two controls (ADR-0018, amended 2026-11-10). Given on a
   * route or a planned walk only; exploring, a pinch out does the same job. The locate
   * arrow on the map is the way back.
   */
  readonly whole?: { readonly label: string; readonly on: boolean; readonly onShow: () => void };
  /**
   * On foot, the compass view: which way each echo is, and the street hum. Or, with a walk
   * under way, back to the walk. It was a button on the map that read too much like
   * "Echoes around me" to tell apart.
   */
  readonly compass?: { readonly label: string; readonly detail: string; readonly onOpen: () => void };
  /**
   * Inside the iPhone app, the card that saves this journey for no signal (D8, mock 2): on
   * the tab of the journey you are on, under its routes. Absent in a browser, which cannot
   * save.
   */
  readonly save?: { readonly title: string; readonly line: string; readonly saved: boolean; readonly onSave: () => void } | null;
  /** Routes saved on this phone: their rows end in "· saved". */
  readonly savedIds?: ReadonlySet<string>;
}

const MODES: readonly { readonly id: Travel; readonly label: string }[] = [
  { id: "walking", label: "Walk" },
  { id: "driving", label: "Drive" },
  { id: "flight", label: "Fly" },
];

/** A flight's name before the colon; a walk or drive keeps its whole name (below). */
const routeName = (r: Route) => (r.name ?? r.destination.name).split(":")[0]!.trim();

/**
 * A tour you could start from here: any of its stops within this distance. Sixty km, as the
 * journey screen uses (`Preflight.tsx`), so a Cape Fear visitor sees the Wilmington walks
 * and the Southport drive, and nobody in Wilmington is offered Lower Manhattan.
 */
const NEARBY_KM = 60;

/** Along the route, stop to stop: the length a person will actually walk or drive. */
function lengthKm(r: Route): number {
  const pts = r.path ?? r.waypoints.map((w) => w.at);
  let km = 0;
  for (let i = 1; i < pts.length; i++) km += distanceKm(pts[i - 1]!, pts[i]!);
  return km;
}

/** "1.2 km · about 40 min", or for a drive "60 km · about 2 hr". */
function lengthAndTime(r: Route): string {
  const km = lengthKm(r);
  const min = Math.round(r.durationS / 60 / 5) * 5;
  const time = min >= 90 ? `about ${Math.round((min / 60) * 2) / 2} hr` : `about ${Math.max(5, min)} min`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km · ${time}`;
}

export function JourneyChip(props: JourneyChipProps) {
  const { travel, roaming, route, routes, counts, label, progress, name, children } = props;
  const [open, setOpen] = useState(false);
  /** The mode the sheet is showing, which is not a commitment. */
  const [tab, setTab] = useState<Travel>(travel);
  const wrap = useRef<HTMLDivElement | null>(null);
  const chip = useRef<HTMLButtonElement | null>(null);
  const current = useRef<HTMLButtonElement | null>(null);

  // Opening always starts on how you are travelling now.
  useEffect(() => {
    if (open) setTab(travel);
  }, [open, travel]);

  /*
   * Focus goes into the sheet when it opens and back to the chip when it closes, so a
   * keyboard or screen-reader user is never dropped at the top of the page when the
   * sheet they were in disappears (WCAG 2.4.3).
   */
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) chip.current?.focus();
  };
  useEffect(() => {
    if (open) current.current?.focus();
  }, [open]);

  // A tap anywhere else, or Escape, closes it.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      // The scrim closes it on its own click, so the tap is swallowed rather than landing
      // on the pin under it (see `.menu-scrim`).
      if ((e.target as Element).classList?.contains("menu-scrim")) return;
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const done = (fn: () => void) => () => {
    close(true);
    fn();
  };

  const forTab = routes.filter((r) => r.mode === tab);
  const pct = progress === null ? null : Math.max(0, Math.min(1, progress)) * 100;

  return (
    <div className={children ? "jchip-wrap jchip-wrap-wide" : "jchip-wrap"} ref={wrap}>
      {open && <div className="menu-scrim" aria-hidden="true" onClick={() => setOpen(false)} />}
      <button
        ref={chip}
        className={children ? "journey-tap" : "jchip"}
        aria-label={name}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {children ?? (
          <>
            {pct !== null && <span className="jchip-fill" style={{ width: `${pct}%` }} aria-hidden="true" />}
            <svg className="jchip-mode" viewBox="0 0 24 24" aria-hidden="true">
              {MODE_ICON[travel]}
            </svg>
            <span className="jchip-label">{label}</span>
            {/* The ▾: this opens something. */}
            <svg className="jchip-caret" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 9.5l6 6 6-6" />
            </svg>
          </>
        )}
      </button>

      {open && (
        <div className="jmenu" role="dialog" aria-labelledby="jmenu-title">
          {/* The trip board of 2026-11-10: a sheet with its name and a ✕, Walk / Drive / Fly,
              then the choices as cards and the tours as a list. Search was this menu's first
              row; it is the map's own first row now (`MapSearch`). */}
          <div className="jmenu-top">
            <h2 id="jmenu-title">Your trip</h2>
            <button className="jmenu-close" onClick={() => close(true)} aria-label="Close">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <div className="jmenu-modes" role="group" aria-label="How are you travelling?">
            {MODES.map((m) => (
              <button
                key={m.id}
                ref={m.id === travel ? current : undefined}
                className={tab === m.id ? "jmenu-mode on" : "jmenu-mode"}
                aria-pressed={tab === m.id}
                onClick={() => setTab(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>

          {props.whole && tab === travel && (
            <button
              className={props.whole.on ? "jmenu-card on" : "jmenu-card"}
              aria-current={props.whole.on ? "true" : undefined}
              onClick={done(props.whole.onShow)}
            >
              <span>
                <b>{props.whole.label}</b>
                <small>All of it on the map. The arrow on the map brings you back.</small>
              </span>
              {props.whole.on ? <Tick /> : <Chev />}
            </button>
          )}

          {/* Roaming exists on the ground only: a flight is somebody else's route. */}
          {tab !== "flight" && (
            <button
              className={roaming && travel === tab ? "jmenu-card on" : "jmenu-card"}
              aria-current={roaming && travel === tab ? "true" : undefined}
              onClick={done(() => props.onRoam(tab as "walking" | "driving"))}
            >
              <span>
                <b>Around here</b>
                <small>No route. Echoes near you as you go.</small>
              </span>
              {roaming && travel === tab && <Tick />}
            </button>
          )}
          {tab === "walking" && travel === "walking" && props.compass && (
            <button className="jmenu-card" onClick={done(props.compass.onOpen)}>
              <span>
                <b>{props.compass.label}</b>
                <small>{props.compass.detail}</small>
              </span>
              <Chev />
            </button>
          )}
          {tab === "walking" && props.onPlan && (
            <button className="jmenu-card" onClick={done(props.onPlan)}>
              <span>
                <b>Plan a walk</b>
                <small>Say how long you have. We map the walk.</small>
              </span>
              <Chev />
            </button>
          )}
          {tab !== "flight" && forTab.length > 0 && (
            <GuidedRoutes
              // One per tab: "open when nothing is near" is decided as it mounts, and the
              // walks' closed list was being kept for road trips, which then showed none.
              key={tab}
              routes={forTab}
              here={props.here ?? null}
              heading={tab === "walking" ? "Guided walks" : "Road trips"}
              // A walk is listed by its stops, the echoes it walks you to. A road trip has
              // no stops to walk to: it plays what it passes, so it says how many that is,
              // the same count its journey screen gives ("25 echoes", not "3").
              countOf={tab === "walking" ? stopsOf : (r) => counts[r.id] ?? 0}
              savedIds={props.savedIds}
              current={roaming ? null : route.id}
              onPick={(r) => done(() => props.onRoute(r))()}
            />
          )}
          {tab === "flight" && forTab.length > 0 && (
            <div className="jmenu-routes">
              <p className="jmenu-head mono">Flights</p>
              {forTab.map((r) => {
                const on = !roaming && r.id === route.id;
                return (
                  <button
                    key={r.id}
                    className={on ? "jmenu-item on" : "jmenu-item"}
                    aria-current={on ? "true" : undefined}
                    onClick={done(() => props.onRoute(r))}
                  >
                    <span>
                      <b>{routeName(r)}</b>
                      <small>
                        {counts[r.id] ?? 0} {(counts[r.id] ?? 0) === 1 ? "echo" : "echoes"}
                        {r.mode === "flight" && r.origin.code && r.destination.code
                          ? ` · ${r.origin.code} to ${r.destination.code}`
                          : ""}
                        {props.savedIds?.has(r.id) ? " · saved" : ""}
                      </small>
                    </span>
                    {on ? <Tick /> : <Chev />}
                  </button>
                );
              })}
            </div>
          )}
          {tab === "flight" && forTab.length === 0 && (
            <p className="jmenu-empty">No flights with echoes yet.</p>
          )}

          {props.save && !roaming && tab === travel && (
            <button className={props.save.saved ? "jmenu-card on" : "jmenu-card"} onClick={props.save.onSave}>
              <span>
                <b>{props.save.title}</b>
                <small>{props.save.line}</small>
              </span>
              {props.save.saved ? <Tick /> : <Chev />}
            </button>
          )}

          <button className="jmenu-link" onClick={done(() => props.onDetails(tab))}>
            {tab === "flight" ? (
              "Find a flight by airport"
            ) : (
              <span>
                Journey details
                {/* True only once the iPhone app has saved it (F7, mock 5); a browser cannot. */}
                {inApp() && !roaming && props.savedIds?.has(route.id) ? (
                  <small>On this device, plays with no signal</small>
                ) : (
                  inApp() && props.kept && <small>Needs signal until it is saved</small>
                )}
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

const Tick = () => (
  <svg className="jmenu-tick" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 12.5 L10 17.5 L19 7" />
  </svg>
);

/** The ›: this goes somewhere. */
const Chev = () => (
  <svg className="jmenu-chev" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 6l6 6-6 6" />
  </svg>
);

/**
 * The stops a tour makes: the places it stands still (`dwellS`), and where it ends. Each is
 * an echo told there; every echo within reach of the line would be the fifty a downtown
 * walk passes, not what forty minutes plays.
 */
/** The same stops a guided walk walks you to (`guided-walk.ts`). */
const stopsOf = (r: Route) => stopWaypoints(r).length;

/**
 * The guided walks or road trips, as a person would want them listed.
 *
 * James (2026-11-09), of the flat list: "is this list correct? it seems confusing". It was
 * every tour in the country, New York and Miami Beach among the Wilmington walks, named by
 * the half before a colon ("1898") and counted by every echo within 300 m of the line, which
 * is not what a 40 minute walk plays. Now: the tours you could start from here first, each
 * with its full name, where it is, and how long it takes; the rest behind "Tours in other
 * cities", grouped by city. With no location there is no "here", so they are all grouped.
 */
function GuidedRoutes({
  routes,
  here,
  heading,
  countOf,
  savedIds,
  current,
  onPick,
}: {
  readonly routes: readonly Route[];
  readonly here: LatLng | null;
  readonly heading: string;
  /** How many echoes each route is listed with. */
  readonly countOf: (r: Route) => number;
  readonly savedIds?: ReadonlySet<string> | undefined;
  readonly current: string | null;
  readonly onPick: (r: Route) => void;
}) {
  const near = here ? routes.filter((r) => r.waypoints.some((w) => distanceKm(here, w.at) <= NEARBY_KM)) : [];
  const far = routes.filter((r) => !near.includes(r));
  // Open by default when nothing is near, or when we do not know where "near" is.
  const [showFar, setShowFar] = useState(near.length === 0);
  const byArea = new Map<string, Route[]>();
  for (const r of far) {
    const a = r.area ?? "Elsewhere";
    byArea.set(a, [...(byArea.get(a) ?? []), r]);
  }
  const item = (r: Route, withArea: boolean) => {
    const on = r.id === current;
    return (
      <button
        key={r.id}
        className={on ? "jmenu-item on" : "jmenu-item"}
        aria-current={on ? "true" : undefined}
        onClick={() => onPick(r)}
      >
        <span>
          <b>{r.name ?? r.destination.name}</b>
          <small>
            {withArea && r.area ? `${r.area} · ` : ""}
            {lengthAndTime(r)} · {countOf(r)} {countOf(r) === 1 ? "echo" : "echoes"}
            {savedIds?.has(r.id) ? " · saved" : ""}
          </small>
        </span>
        {on ? <Tick /> : <Chev />}
      </button>
    );
  };
  return (
    <div className="jmenu-routes">
      <p className="jmenu-head mono">{near.length > 0 ? `${heading} near you` : heading}</p>
      {near.map((r) => item(r, false))}
      {near.length > 0 && far.length > 0 && (
        <button className="jmenu-link jmenu-far" aria-expanded={showFar} onClick={() => setShowFar((v) => !v)}>
          {showFar ? `Hide ${heading.toLowerCase()} in other cities` : `${heading} in other cities (${far.length})`}
        </button>
      )}
      {showFar &&
        [...byArea.entries()].map(([area, rs]) => (
          <div key={area} className="jmenu-area">
            {(near.length > 0 || byArea.size > 1) && <p className="jmenu-area-name">{area}</p>}
            {rs.map((r) => item(r, false))}
          </div>
        ))}
    </div>
  );
}
