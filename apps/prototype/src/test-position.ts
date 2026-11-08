/**
 * Stand somewhere without going there: `?at=` on the address.
 *
 * James (2026-11-08) needed to hear an echo and use the player from home. Echoes open
 * only where they happened, so the address can say where to stand instead:
 *
 * - `?at=wilmington-ellen-bellamys-long-view` stands at that echo's pin;
 * - `?at=34.2357,-77.9452` stands at those coordinates.
 *
 * Everything else is the real app: the capture, the free ten, the paywall and a real
 * purchase all behave as they would on that street. Nothing is remembered; take `?at` off
 * the address and the phone's own location is back.
 */

import type { Echo, LatLng } from "@echofinders/core";

export interface TestPosition {
  readonly at: LatLng;
  /** What the banner calls it: the echo's title, or the coordinates. */
  readonly label: string;
}

/** The test position the address asks for, or null for the real one. */
export function testPositionFrom(search: string, library: readonly Echo[]): TestPosition | null {
  const raw = new URLSearchParams(search).get("at")?.trim();
  if (!raw) return null;
  const coords = /^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/.exec(raw);
  if (coords) {
    const lat = Number(coords[1]);
    const lng = Number(coords[2]);
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
    return { at: { lat, lng }, label: `${lat.toFixed(4)}, ${lng.toFixed(4)}` };
  }
  const echo = library.find((e) => e.id === raw);
  return echo ? { at: echo.point.at, label: echo.title } : null;
}
