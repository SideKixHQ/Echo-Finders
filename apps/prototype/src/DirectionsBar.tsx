/**
 * Walking to an echo, inside the app: the turn at the top, the echo at the bottom.
 *
 * James (2026-11-10): "Take me there should use in app map navigation and take the person
 * to the echo not open apple maps." So one tap on the card starts this, and nothing in it
 * leaves the app:
 *
 * - **The turn card** (this), under the top bar: how far to the next turn and what it is
 *   ("120 m, Turn right onto Chestnut Street"). Read at arm's length. With no street map it
 *   points at the echo: "Head south".
 * - **The echo bar** at the bottom, the one people already know (`EchoBar`, its directions
 *   mode): the echo's orb and title, "18 min · arrive 9:58 pm" under it, and a round ✕ that
 *   ends directions. Tapping it opens the echo's card. This is board DirC, approved by
 *   James on 2026-11-10 in place of a directions sheet that took a third of the screen and
 *   cut its own title through on his phone.
 * - **The line** on the map (`RouteMap`): along the streets where a street file was built,
 *   straight to the echo where none was, framed between this card and the bar.
 *
 * Arriving is the sync's job, as it always was: within reach the echo syncs, the beacon is
 * let go and the bar goes back to being the echo bar, with Play.
 */

import type { WalkGuidance, LatLng } from "@echofinders/core";
import { arrivalClock, routeGuidance, straightGuidance } from "@echofinders/core";
import { walkDistance, walkTime, type Directions } from "./directions";
import { WALKABLE_KM } from "./going";

/**
 * Past this the walk is not offered at all (`going.ts`). Directions that somehow reach it
 * end, and the echo's card says how far instead (`App`).
 */
export const WALKABLE_M = WALKABLE_KM * 1000;

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

/**
 * The bar's second line while walking: "18 min · arrive 9:58 pm", and on a planned or
 * guided walk "Stop 1 of 6 · 3 min · arrive 9:28 pm". No distance: the turn card has it.
 * Each part is its own string so the bar can keep them whole when the line wraps.
 */
export function directionsLine(
  g: WalkGuidance | null,
  step: { readonly at: number; readonly of: number } | undefined,
  nowMs: number,
): readonly string[] {
  const where = step ? [`Stop ${step.at} of ${step.of}`] : [];
  if (!g) return [...where, "Finding the way"];
  return [...where, walkTime(g.seconds), `arrive ${arrivalClock(nowMs, g.seconds)}`];
}

/** The turn card, under the top bar. */
export function DirectionsBar({ guidance: g }: { readonly guidance: WalkGuidance | null }) {
  return (
    <div className="dir-turn" role="status" aria-live="polite">
      <Arrow guidance={g} />
      <div className="dir-turn-say">
        {g?.inM != null && <strong className="dir-turn-in">{walkDistance(g.inM)}</strong>}
        <span className="dir-turn-what">{g ? g.say : "Finding the way…"}</span>
      </div>
    </div>
  );
}
