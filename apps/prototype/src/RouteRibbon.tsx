/**
 * Where you are on the journey, in one line.
 *
 * The design puts this above everything, and it is doing more than decoration: on a flight
 * it is the only orientation there is. A passenger cannot look out of the window and know
 * they are over Cape Hatteras, so "SFO ●———— JFK · 5h 19m" is the entire answer to where
 * am I and how long is left.
 *
 * Origin and destination are the short codes when a route has them and the place names
 * otherwise, because "SFO" and "Battery Park" are both the shortest true thing.
 */

import type { Route } from "@echofinders/core";

export interface RouteRibbonProps {
  readonly route: Route;
  /** 0–1 along the route. */
  readonly progress: number;
  /** Seconds left, at the route's own pace. */
  readonly remainingS: number;
}

export function RouteRibbon({ route, progress, remainingS }: RouteRibbonProps) {
  const pct = Math.max(0, Math.min(1, progress)) * 100;

  return (
    <div className="ribbon">
      <b>{short(route.origin)}</b>
      <span className="ribbon-bar">
        <i style={{ width: `${pct}%` }} />
        <u style={{ left: `${pct}%` }} />
      </span>
      <b>{short(route.destination)}</b>
      <small>{left(remainingS)}</small>
      {/*
        The tap target says so inside the pill, as the roaming chip already did.

        Route mode carried it as a separate centred line of uppercase aqua UNDER the pill —
        a whole row of chrome to say the row above it is a button, on the screen with the
        least room to spare. The chevron is the same promise in eleven pixels, and the
        button's own label already names it for anything that is not an eye.
      */}
      <svg className="ribbon-more" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 5l7 7-7 7" />
      </svg>
    </div>
  );
}

const short = (place: { code?: string; name: string }) =>
  place.code ?? place.name.split(",")[0]!;

function left(seconds: number): string {
  if (seconds <= 30) return "arrived";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}
