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

import type { Echo, WalkGuidance, LatLng } from "@echofinders/core";
import { arrivalClock, routeGuidance, straightGuidance } from "@echofinders/core";
import { walkDistance, walkTime, type Directions } from "./directions";

interface Props {
  readonly echo: Echo;
  readonly directions: Directions;
  /** Where you are, for the straight line where there is no street route. */
  readonly from: LatLng | null;
  readonly onEnd: () => void;
  /** On a planned walk: which stop this is, of how many. */
  readonly step?: { readonly at: number; readonly of: number };
}

/**
 * How tall the sheet is, for the map to keep you and the line clear of it. Matches
 * `.dir-sheet` in theme.css, which also hands it to the control column as `--step-h`.
 */
export const DIRSHEET_H = 196;

/** Past this, a walking time and an arrival clock stop meaning anything. */
const WALKABLE_M = 20_000;

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

export function DirectionsBar({ echo, directions, from, onEnd, step }: Props) {
  const g = guidanceFor(directions, from, echo.point.at);
  const walkable = g !== null && g.metres <= WALKABLE_M;
  return (
    <>
      <div className="dir-turn" role="status" aria-live="polite">
        <Arrow guidance={g} />
        <div className="dir-turn-say">
          {g?.inM != null && <strong className="dir-turn-in">{walkDistance(g.inM)}</strong>}
          <span className="dir-turn-what">{g ? g.say : "Finding the way…"}</span>
        </div>
      </div>

      <section className="dir-sheet" aria-label={`Directions to ${echo.title}`}>
        <p className="dir-sheet-big">{g ? (walkable ? walkTime(g.seconds) : walkDistance(g.metres)) : "\u00a0"}</p>
        <p className="dir-sheet-meta">
          <span className="dir-sheet-how">
            {g
              ? walkable
                ? `${walkDistance(g.metres)} · arrive ${arrivalClock(Date.now(), g.seconds)}`
                : "Too far to walk"
              : ""}
          </span>
          <span className="dir-sheet-to">
            {step ? `Stop ${step.at} of ${step.of} · ` : ""}to {echo.title}
          </span>
        </p>
        <p className="dir-sheet-note">
          {g && !g.streets
            ? "No street map here yet, so the line is straight. When you arrive it unlocks. Tap Play."
            : "When you arrive it unlocks. Tap Play."}
        </p>
        <button className="dir-end" onClick={onEnd}>
          {step ? "End the walk" : "End directions"}
        </button>
      </section>
    </>
  );
}
