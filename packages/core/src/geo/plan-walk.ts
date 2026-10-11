/**
 * Planning a walk: which echoes, and in what order.
 *
 * James (2026-10-11): "or plan a route, map it out and go." Somebody with forty-five minutes
 * wants the best of what is near them, in an order that does not double back. That is the
 * orienteering problem (most value within a time budget), solved here the usual practical
 * way: add stops one at a time by value for the minutes they cost, each into the cheapest
 * place in the order, then untangle the order with 2-opt.
 *
 * Times are estimates from straight-line distance stretched by a city's usual detour
 * (`DETOUR`). The street router (`streets.ts`) draws and times the real walk afterwards;
 * this only has to choose well, and choosing from estimates is what keeps it instant.
 */

import type { LatLng } from "../types.js";
import { distanceKm } from "./great-circle.js";
import { WALK_M_PER_S } from "./streets.js";

/** Streets are longer than the crow flies; across a city grid, by about this much. */
export const DETOUR = 1.3;

/** Echoes closer together than this are one stop: you sync them all standing in one place. */
export const SAME_PLACE_M = 40;

export interface Candidate {
  readonly id: string;
  readonly at: LatLng;
  /** How long the echo plays, seconds. Listening is part of the walk. */
  readonly listenS: number;
  /** How much it is worth walking to, 0–1 (`findEchoesNearby`'s score). */
  readonly score: number;
}

export interface PlannedWalk {
  /** In walking order, from the start. */
  readonly stops: readonly Candidate[];
  /** Estimated walking time between them, seconds, not counting listening. */
  readonly walkS: number;
  readonly listenS: number;
  /** Whether it comes back to where it started. */
  readonly loop: boolean;
}

const walkSeconds = (a: LatLng, b: LatLng) => (distanceKm(a, b) * 1000 * DETOUR) / WALK_M_PER_S;

function legs(start: LatLng, order: readonly Candidate[], loop: boolean): number {
  let s = 0;
  let from = start;
  for (const c of order) {
    s += walkSeconds(from, c.at);
    from = c.at;
  }
  if (loop && order.length) s += walkSeconds(from, start);
  return s;
}

/**
 * The best walk from `start` that fits in `budgetS` seconds, listening included.
 *
 * `loop` brings you back to the start (for somebody who parked there); otherwise the walk
 * ends at the last echo. `maxStops` keeps a long budget from turning into a list nobody
 * will finish.
 */
export function planWalk(
  start: LatLng,
  candidates: readonly Candidate[],
  budgetS: number,
  options: { readonly loop?: boolean; readonly maxStops?: number } = {},
): PlannedWalk {
  const loop = options.loop ?? false;
  const maxStops = options.maxStops ?? 6;
  let order: Candidate[] = [];
  let listen = 0;
  const left = new Set(candidates);

  while (order.length < maxStops && left.size) {
    let best = null as { c: Candidate; at: number; cost: number; ratio: number } | null;
    const now = legs(start, order, loop);
    /*
     * A walk is a string of places. A second echo where you are already stopping syncs with
     * the first and adds no walking, so on value for time alone the plan filled up with one
     * house: eight stories at the Burgwin-Wright House, Wilmington (2026-10-11), which made a
     * "walk" of one stop. So new places come first, and a second echo at a place already in
     * the walk is only added once no new place fits.
     */
    for (const sameOk of [false, true]) {
      for (const c of left) {
        const crowded = order.some((o) => distanceKm(o.at, c.at) * 1000 < SAME_PLACE_M);
        if (crowded !== sameOk) continue;
        // The cheapest place in the current order to slot it in.
        for (let i = 0; i <= order.length; i++) {
          const next = [...order.slice(0, i), c, ...order.slice(i)];
          const added = legs(start, next, loop) - now + c.listenS;
          if (now + listen + added > budgetS) continue;
          const ratio = (c.score + 0.05) / Math.max(30, added);
          if (!best || ratio > best.ratio) best = { c, at: i, cost: added, ratio };
        }
      }
      if (best) break;
    }
    if (!best) break;
    order = [...order.slice(0, best.at), best.c, ...order.slice(best.at)];
    listen += best.c.listenS;
    left.delete(best.c);
  }

  order = untangle(start, order, loop);
  return { stops: order, walkS: legs(start, order, loop), listenS: listen, loop };
}

/** 2-opt: reverse any stretch of the order that makes the walk shorter, until none does. */
function untangle(start: LatLng, order: Candidate[], loop: boolean): Candidate[] {
  let best = order;
  let bestS = legs(start, best, loop);
  for (let improved = true; improved; ) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const next = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
        const s = legs(start, next, loop);
        if (s < bestS - 1) {
          best = next;
          bestS = s;
          improved = true;
        }
      }
    }
  }
  return best;
}

/** The order for stops somebody picked themselves: shortest walk through all of them. */
export function orderStops(start: LatLng, stops: readonly Candidate[], loop = false): PlannedWalk {
  // Nearest neighbour to begin with, then untangled.
  const left = new Set(stops);
  const order: Candidate[] = [];
  let from = start;
  while (left.size) {
    let next: Candidate | null = null;
    for (const c of left) if (!next || distanceKm(from, c.at) < distanceKm(from, next.at)) next = c;
    order.push(next!);
    left.delete(next!);
    from = next!.at;
  }
  const untangled = untangle(start, order, loop);
  return {
    stops: untangled,
    walkS: legs(start, untangled, loop),
    listenS: untangled.reduce((s, c) => s + c.listenS, 0),
    loop,
  };
}
