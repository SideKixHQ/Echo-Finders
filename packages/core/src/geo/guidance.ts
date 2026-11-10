/**
 * Turn by turn: what the directions screen says while you walk to an echo.
 *
 * James (2026-11-10): "Take me there should use in app map navigation and take the person
 * to the echo not open apple maps." So the app guides the whole way itself, two ways:
 *
 * - **Along the streets** where a street file was built (`streets.ts`): the next turn, how
 *   far to it, and the street it is onto.
 * - **As the crow flies** everywhere else: which way to head and how far, with a straight
 *   line on the map. Honest about it, and never a hand-off to another app.
 *
 * Pure, so the words can be tested without a phone.
 */

import { bearingDeg, distanceKm } from "./great-circle.js";
import { WALK_M_PER_S, type Turn, type WalkingRoute } from "./streets.js";
import type { LatLng } from "../types.js";

export type WalkGlyph = Turn["direction"] | "arrive" | "bearing";

export interface WalkGuidance {
  /** The instruction: "Turn right onto Chestnut Street", "Head northeast". */
  readonly say: string;
  /** Metres to where `say` happens, or null when there is nothing to count down to. */
  readonly inM: number | null;
  readonly glyph: WalkGlyph;
  /** Compass bearing to the echo, for turning the arrow when there are no streets. */
  readonly bearingDeg: number | null;
  /** The whole of the rest of the walk. */
  readonly metres: number;
  readonly seconds: number;
  /** True when routed along streets, false when it is a straight line. */
  readonly streets: boolean;
}

/** Within this many metres, the walk is over bar the last few steps. */
export const ARRIVING_M = 40;

const COMPASS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"] as const;

/** "northeast": a compass bearing as a word, eight ways, no hyphens. */
export function compassWord(deg: number): (typeof COMPASS)[number] {
  return COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]!;
}

/** Guidance along a street route. */
export function routeGuidance(route: WalkingRoute): WalkGuidance {
  const base = { metres: route.metres, seconds: route.seconds, streets: true, bearingDeg: null };
  const turn = route.turns[0];
  if (!turn) {
    if (route.metres < ARRIVING_M) return { ...base, say: "Almost there", inM: null, glyph: "arrive" };
    const along = route.startOn ? `Continue on ${route.startOn}` : "Straight on to it";
    return { ...base, say: along, inM: route.metres, glyph: "straight" };
  }
  const how = turn.direction === "straight" ? "Carry on" : `Turn ${turn.direction}`;
  return { ...base, say: turn.onto ? `${how} onto ${turn.onto}` : how, inM: turn.fromStartM, glyph: turn.direction };
}

/** Guidance with no street file: a heading and a distance, as the crow flies. */
export function straightGuidance(from: LatLng, to: LatLng): WalkGuidance {
  const metres = distanceKm(from, to) * 1000;
  const deg = bearingDeg(from, to);
  const base = { metres, seconds: metres / WALK_M_PER_S, streets: false, bearingDeg: deg };
  if (metres < ARRIVING_M) return { ...base, say: "Almost there", inM: null, glyph: "arrive" };
  return { ...base, say: `Head ${compassWord(deg)}`, inM: metres, glyph: "bearing" };
}

/**
 * When you will get there, on the phone's clock, the way the phone says time: "7:12 pm" on
 * a twelve hour phone, "19:12" on a twenty four hour one. "arrive 5:43" on its own read as
 * either (James, 2026-11-10). The time zone and locale are the phone's unless given (tests).
 */
export function arrivalClock(nowMs: number, seconds: number, timeZone?: string, locale?: string): string {
  const at = new Date(nowMs + Math.max(0, seconds) * 1000);
  const zone = timeZone ? { timeZone } : {};
  // A twenty four hour clock is said "09:05", a twelve hour one "9:05 am".
  const cycle = new Intl.DateTimeFormat(locale, { hour: "numeric", ...zone }).resolvedOptions().hourCycle;
  const twentyFour = cycle === "h23" || cycle === "h24";
  const parts = new Intl.DateTimeFormat(locale, {
    hour: twentyFour ? "2-digit" : "numeric",
    minute: "2-digit",
    ...zone,
  }).formatToParts(at);
  // "7:12 PM" as "7:12 pm", with a space that will not break between the two.
  return parts
    .map((p) => (p.type === "dayPeriod" ? p.value.toLowerCase().replace(/\./g, "") : p.type === "literal" ? p.value.replace(/\s/g, "\u00a0") : p.value))
    .join("")
    .trim();
}
