/**
 * Walking to an echo, inside the app: the turn at the top, the walk at the bottom.
 *
 * James (2026-11-10): "Take me there should use in app map navigation and take the person
 * to the echo not open apple maps. You also do not need another step. take me there should
 * take you there not open another window you have to tap to open another app."
 *
 * So one tap on the card starts this, and nothing in it leaves the app:
 *
 * - **The turn banner**, under the top bar: how far to the next turn and what it is
 *   ("120 m, Turn right onto Chestnut Street"). Read at arm's length.
 * - **The sheet**, at the bottom: minutes, distance, arrival time, which echo, what happens
 *   when you get there, and the one way to stop.
 * - **The line** on the map (`RouteMap`): along the streets where a street file was built,
 *   straight to the echo where none was. Where it is straight, the banner says "Head
 *   northeast" and the sheet says so, rather than handing you to another maps app, which is
 *   what this used to do there ("Directions in Maps").
 *
 * Arriving is the sync's job, as it always was: within reach the echo syncs, the beacon is
 * let go and the sync card takes over (`App`).
 */

import { useLayoutEffect, useRef } from "react";
import type { Echo, WalkGuidance, LatLng } from "@echofinders/core";
import { arrivalClock, routeGuidance, straightGuidance } from "@echofinders/core";
import { walkDistance, walkTime, type Directions } from "./directions";
import { startLine } from "./guided-walk";
import { WALKABLE_KM } from "./going";

interface Props {
  readonly echo: Echo;
  readonly directions: Directions;
  /** Where you are, for the straight line where there is no street route. */
  readonly from: LatLng | null;
  readonly onEnd: () => void;
  /** On a planned walk: which stop this is, of how many. */
  readonly step?: { readonly at: number; readonly of: number };
  /** The first leg of a guided walk: "Walk to the start · 6 min". */
  readonly toStart?: boolean;
  /** The sheet's real height, each time it changes, for the map to keep clear of it. */
  readonly onHeight?: (px: number) => void;
}

/**
 * How tall the sheet is before it has been measured: the first paint's guess.
 *
 * It used to BE the sheet's height, fixed, and the sheet's content outgrew it: "Stop 1 of
 * 8 · to <title>" on its own line, a two line title, and a note on two lines made it
 * taller than 196px, so on James's phone the title was cut through by the line under it
 * (2026-11-10). The sheet now fits its content and says how tall it came out (`onHeight`,
 * and `--step-h` on the screen for the control column), so nothing has to agree with it.
 */
export const DIRSHEET_H = 196;

/**
 * Past this, a walking time and an arrival clock stop meaning anything. The card asks the
 * same question (`going.ts`) and does not offer a walk past it.
 */
const WALKABLE_M = WALKABLE_KM * 1000;

/** The guidance for what the router answered, or null while it is still working. */
export function guidanceFor(directions: Directions, from: LatLng | null, to: LatLng): WalkGuidance | null {
  if (directions.kind === "route") return routeGuidance(directions.route);
  if (directions.kind === "unrouted" && from) return straightGuidance(from, to);
  return null;
}

/** The turn as an arrow, so a glance is enough. With no streets, it points at the echo. */
function Arrow({ guidance }: { guidance: WalkGuidance | null }) {
  const glyph = guidance?.glyph ?? "bearing";
  const d: Record<WalkGuidance["glyph"], string> = {
    straight: "M12 20V5M7 10l5-5 5 5",
    left: "M17 20v-7a3 3 0 0 0-3-3H6M10 6l-4 4 4 4",
    right: "M7 20v-7a3 3 0 0 1 3-3h8M14 6l4 4-4 4",
    "slight left": "M15 20v-6L8 7M8 13V7h6",
    "slight right": "M9 20v-6l7-7M16 13V7h-6",
    arrive: "M12 21s6-5.4 6-10a6 6 0 1 0-12 0c0 4.6 6 10 6 10zM12 9.5v.01",
    bearing: "M12 20V5M7 10l5-5 5 5",
  };
  const turn = glyph === "bearing" && guidance?.bearingDeg != null ? guidance.bearingDeg : 0;
  return (
    <svg
      className={`dir-turn-arrow dir-turn-arrow-${glyph.replace(" ", "-")}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={turn ? { transform: `rotate(${turn.toFixed(0)}deg)` } : undefined}
    >
      <path d={d[glyph]} />
    </svg>
  );
}

export function DirectionsBar({ echo, directions, from, onEnd, step, toStart = false, onHeight }: Props) {
  const g = guidanceFor(directions, from, echo.point.at);
  const walkable = g !== null && g.metres <= WALKABLE_M;
  /*
    Measured, not declared: the map keeps its pins, its credit and the way there above
    this, and the control column reads `--step-h` to stay above it too.
  */
  const sheet = useRef<HTMLElement>(null);
  const heightTo = useRef(onHeight);
  heightTo.current = onHeight;
  useLayoutEffect(() => {
    const el = sheet.current;
    const screen = el?.closest<HTMLElement>(".screen");
    if (!el) return;
    let last = -1;
    const measure = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      if (h < 1 || h === last) return;
      last = h;
      screen?.style.setProperty("--step-h", `${h}px`);
      heightTo.current?.(h);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return () => screen?.style.removeProperty("--step-h");
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      observer.disconnect();
      screen?.style.removeProperty("--step-h");
    };
  }, []);
  return (
    <>
      <div className="dir-turn" role="status" aria-live="polite">
        <Arrow guidance={g} />
        <div className="dir-turn-say">
          {g?.inM != null && <strong className="dir-turn-in">{walkDistance(g.inM)}</strong>}
          <span className="dir-turn-what">{g ? g.say : "Finding the way…"}</span>
        </div>
      </div>

      <section className="dir-sheet" ref={sheet} aria-label={`Directions to ${echo.title}`}>
        {/* How long and when, on one row where it fits: the sheet is kept short. */}
        <div className="dir-sheet-head">
          <p className={toStart ? "dir-sheet-big dir-sheet-start" : "dir-sheet-big"}>
            {g ? (walkable ? (toStart ? startLine(walkTime(g.seconds)) : walkTime(g.seconds)) : walkDistance(g.metres)) : "\u00a0"}
          </p>
          <p className="dir-sheet-how">
            {g
              ? walkable
                ? `${walkDistance(g.metres)} · arrive ${arrivalClock(Date.now(), g.seconds)}`
                : "Too far to walk"
              : ""}
          </p>
        </div>
        <p className="dir-sheet-to">
          {step ? `Stop ${step.at} of ${step.of} · ` : ""}to {echo.title}
        </p>
        <p className="dir-sheet-note">
          {/* With no street file the turn card already says which way ("Head south"). */}
          {g && !g.streets ? "As the crow flies. When you arrive it unlocks. Tap Play." : "When you arrive it unlocks. Tap Play."}
        </p>
        <button className="dir-end" onClick={onEnd}>
          {step ? "End the walk" : "End directions"}
        </button>
      </section>
    </>
  );
}
