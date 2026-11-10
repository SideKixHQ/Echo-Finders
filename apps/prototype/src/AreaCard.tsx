/**
 * What is on the map when you have zoomed out: "Around Wilmington · 172 echoes".
 *
 * James (2026-11-10), on the zoomed-out map: "No map details and some of these are in the
 * water." The design that answered it (`ZoomedOut` on the design canvas) has the coast,
 * the towns and the roads, a numbered dot per town, and one card saying what you are
 * looking at and how much is there. Zoomed out, the map draws every echo rather than only
 * the ones in reach (`App`, `farOut`), and this is the count of those on screen.
 *
 * Above the bar, not instead of it: the bar is how you step through what is on the map,
 * and at this scale that is still the quickest way to the nearest one (see `EchoBar`).
 *
 * Named from the echoes' own places, since the library has no regions: the town most of
 * them are in when one town holds most of them, otherwise the state most are in, otherwise
 * just how many places.
 */

import type { Echo } from "@echofinders/core";

/** The card's height and the gap above it, for what has to clear it. */
export const AREACARD_H = 80;
/**
 * The gap between the top of the bar and the card. `ECHOBAR_H` (99) already
 * holds the bar's own float gap, so this is only the air above it.
 */
export const AREACARD_OVER_BAR = 8;

const parts = (e: Echo): string[] =>
  e.point.place
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/** "Wilmington" from "Thalian Hall, 310 Chestnut Street, Wilmington, North Carolina". */
const townOf = (e: Echo) => {
  const p = parts(e);
  return p.length >= 2 ? p[p.length - 2]! : p[0] ?? "";
};
const stateOf = (e: Echo) => parts(e).at(-1) ?? "";

/** What to call what is on screen. */
export function areaName(echoes: readonly Echo[]): string {
  if (echoes.length === 0) return "";
  const towns = new Map<string, number>();
  for (const e of echoes) towns.set(townOf(e), (towns.get(townOf(e)) ?? 0) + 1);
  const [top, n] = [...towns].sort((a, b) => b[1] - a[1])[0]!;
  if (n * 2 >= echoes.length) return `Around ${top}`;
  const states = new Map<string, number>();
  for (const e of echoes) states.set(stateOf(e), (states.get(stateOf(e)) ?? 0) + 1);
  const [state, m] = [...states].sort((a, b) => b[1] - a[1])[0]!;
  if (m * 2 >= echoes.length) return state;
  return `${towns.size} places`;
}

export function AreaCard({ echoes, above }: { echoes: readonly Echo[]; above: number }) {
  const n = echoes.length;
  return (
    <div className="area-card" role="status" style={{ "--above": `${above}px` } as React.CSSProperties}>
      <span className="area-card-title">
        {n === 0 ? "No echoes in view" : `${areaName(echoes)} · ${n} ${n === 1 ? "echo" : "echoes"}`}
      </span>
      <span className="area-card-hint">{n === 0 ? "Pinch out to find the nearest." : "Tap a number to zoom in."}</span>
    </div>
  );
}
