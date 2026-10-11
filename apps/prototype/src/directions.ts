/**
 * Walking directions, as the app uses them: which street file covers where you are, and a
 * route from you to an echo along it (`packages/core/src/geo/streets.ts` does the routing).
 *
 * Files are fetched only for the area you are in and kept for the session. Outside every
 * area there is no route, and the caller falls back to the compass and distance it always
 * had, plus a hand-off to the phone's own maps app (`mapsLink`).
 */

import { useEffect, useRef, useState } from "react";
import {
  streetsCover,
  decodeStreets,
  distanceKm,
  walkingRoute,
  type LatLng,
  type StreetFile,
  type StreetGraph,
  type WalkingRoute,
} from "@echofinders/core";

interface Index {
  readonly areas: readonly { readonly area: string; readonly bbox: readonly [number, number, number, number]; readonly file: string }[];
}

const base = () => `${import.meta.env.BASE_URL}streets/`;
let index: Promise<Index | null> | null = null;
const graphs = new Map<string, Promise<StreetGraph | null>>();

function loadIndex(): Promise<Index | null> {
  index ??= fetch(`${base()}index.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Index>) : null))
    .catch(() => null);
  return index;
}

/** The street graph covering this position, or null where none was built. */
export async function streetsAt(p: LatLng): Promise<StreetGraph | null> {
  const ix = await loadIndex();
  const hit = ix?.areas.find((a) => streetsCover(a, p));
  if (!hit) return null;
  let graph = graphs.get(hit.file);
  if (!graph) {
    graph = fetch(base() + hit.file)
      .then((r) => (r.ok ? (r.json() as Promise<StreetFile>) : null))
      .then((file) => (file ? decodeStreets(file) : null))
      .catch(() => null);
    graphs.set(hit.file, graph);
  }
  return graph;
}

export type Directions =
  | { readonly kind: "none" }
  | { readonly kind: "loading" }
  /** No street file here, or no way through it: the compass is all there is. */
  | { readonly kind: "unrouted"; readonly metres: number }
  | { readonly kind: "route"; readonly route: WalkingRoute };

/**
 * A route from `from` to `to`, kept up to date as you walk.
 *
 * Worked out again every time you have moved ten metres, rather than tracked along the old
 * line: routing a downtown takes a few milliseconds, and a fresh route is right even when
 * somebody takes a different street from the one they were told.
 */
export function useDirections(from: LatLng | null, to: LatLng | null): Directions {
  const [out, setOut] = useState<Directions>({ kind: "none" });
  const last = useRef<{ from: LatLng; to: LatLng } | null>(null);
  const asked = useRef(0);

  useEffect(() => {
    if (!from || !to) {
      last.current = null;
      asked.current++;
      setOut({ kind: "none" });
      return;
    }
    const prev = last.current;
    const moved = !prev || distanceKm(prev.from, from) * 1000 >= 10 || prev.to.lat !== to.lat || prev.to.lng !== to.lng;
    if (!moved) return;
    const fresh = !prev || prev.to.lat !== to.lat || prev.to.lng !== to.lng;
    last.current = { from, to };
    if (fresh) setOut({ kind: "loading" });
    // Only the latest request may answer. Not an effect cleanup: most fixes move less than
    // ten metres and start nothing, and cancelling on every one of them would cancel the
    // request that is still on its way.
    const ticket = ++asked.current;
    void streetsAt(from).then((graph) => {
      if (ticket !== asked.current) return;
      const route = graph && streetsCover(graph, to) ? walkingRoute(graph, from, to) : null;
      setOut(route ? { kind: "route", route } : { kind: "unrouted", metres: distanceKm(from, to) * 1000 });
    });
  }, [from?.lat, from?.lng, to?.lat, to?.lng]);

  return out;
}

/**
 * Walking directions in the phone's own maps app: Apple Maps on an iPhone or iPad, Google
 * Maps everywhere else. For when there is no street file here, or somebody simply prefers
 * the app they know.
 */
export function mapsLink(to: LatLng, label: string): string {
  const apple = typeof navigator !== "undefined" && /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
  const ll = `${to.lat.toFixed(6)},${to.lng.toFixed(6)}`;
  return apple
    ? `https://maps.apple.com/?daddr=${ll}&dirflg=w&q=${encodeURIComponent(label)}`
    : `https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=walking`;
}

/** "4 min", "25 min", "1 hr 10 min": walking time as people say it. */
export function walkTime(seconds: number): string {
  const min = Math.max(1, Math.round(seconds / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/** "80 m", "1.2 km". */
export function walkDistance(metres: number): string {
  if (metres < 950) return `${Math.max(10, Math.round(metres / 10) * 10)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

export interface WalkLine {
  readonly line: readonly LatLng[];
  readonly metres: number;
  readonly seconds: number;
}

/**
 * The whole planned walk along the streets, leg by leg: from the start, through every
 * stop in order. A leg with no street route is drawn straight, which is honest about it.
 */
export function useWalkLine(start: LatLng | null, stops: readonly LatLng[], loop: boolean): WalkLine | null {
  const [out, setOut] = useState<WalkLine | null>(null);
  const key = start ? [start, ...stops].map((p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join(";") + (loop ? "@" : "") : "";
  useEffect(() => {
    if (!start || stops.length === 0) {
      setOut(null);
      return;
    }
    let live = true;
    void streetsAt(start).then((graph) => {
      if (!live) return;
      const points = loop ? [start, ...stops, start] : [start, ...stops];
      const line: LatLng[] = [];
      let metres = 0;
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i]!;
        const b = points[i + 1]!;
        const leg = graph && streetsCover(graph, a) && streetsCover(graph, b) ? walkingRoute(graph, a, b) : null;
        const pts = leg ? leg.line : [a, b];
        line.push(...(line.length ? pts.slice(1) : pts));
        metres += leg ? leg.metres : distanceKm(a, b) * 1000;
      }
      setOut({ line, metres, seconds: metres / 1.25 });
    });
    return () => {
      live = false;
    };
    // `key` is the content of start and stops; their array identities change every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return out;
}
