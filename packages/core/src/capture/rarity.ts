/**
 * How hard is it to stand here?
 *
 * Hand picked since 2026-11-12 (docs/adr/0021-topics-and-rare.md): an echo is rare because
 * an editor chose it and wrote down one of four reasons a listener can check (inside with
 * opening hours, only at certain times, hard to reach, easy to miss).
 *
 * History: 2026-11-05 scored radius, hours, inside and remoteness (`docs/13-story-mix.md`).
 * Remoteness is still computed below and shipped with the library for anything that reads
 * it, but it no longer decides the tier.
 */

import { distanceKm } from "../geo/great-circle.js";
import type { Echo } from "../types.js";
import type { Rarity } from "./types.js";

/**
 * The tier, from the hand picked `rare` field and nothing else (James, 2026-11-12,
 * docs/adr/0021-topics-and-rare.md).
 *
 * The computed version scored radius, hours, inside and remoteness, and a reader could not
 * tell from the card why one echo was rare and the next was not. Now an editor picks the
 * few that really are, and says why in `rareReason`, which the card shows. "uncommon" stays
 * in the type so callers compile; nothing is assigned it any more.
 */
export function rarityOf(echo: Pick<Echo, "rare">): Rarity {
  if (echo.rare === "extra-rare") return "singular";
  if (echo.rare === "rare") return "rare";
  return "common";
}

/** Why an echo is rare, for the card and the collection screen: its one hand written reason. */
export function rarityReasons(echo: Pick<Echo, "rare" | "rareReason">): string[] {
  return echo.rare && echo.rareReason ? [echo.rareReason] : [];
}

/** Echoes found on foot. Wider radii are passed by car or plane, not walked to. */
const WALKED_MAX_KM = 0.15;
/** An echo is on the main walk when this many others are within `CORE_RADIUS_KM`. */
const CORE_NEIGHBOURS = 4;
const CORE_RADIUS_KM = 0.4;
/** Distance off the walk at which remoteness reaches 1. */
const FULLY_REMOTE_KM = 2;

/**
 * How far each echo sits off the walk most people take, 0 to 1, computed from the library.
 *
 * The main walk is wherever echoes crowd: a walked echo with at least four others within
 * 400 m is on it (remoteness 0). Every other walked echo is scored by its distance to the
 * nearest one that is, over 2 km and capped at 1. A walked echo with no main walk anywhere
 * is a long way from anywhere (1).
 *
 * Echoes passed by car or plane score 0: nobody walks to them, and the road or the flight
 * path is what decides whether you pass them.
 *
 * Pure and deterministic, so the library build can call it and ship the answer; `rarityOf`
 * then needs only the echo.
 */
export function remotenessOf(library: readonly Echo[]): Map<string, number> {
  const walked = library.filter((e) => e.point.triggerRadiusKm <= WALKED_MAX_KM);
  const core = walked.filter(
    (e) =>
      walked.filter((o) => o !== e && distanceKm(e.point.at, o.point.at) <= CORE_RADIUS_KM).length >=
      CORE_NEIGHBOURS,
  );
  const coreIds = new Set(core.map((e) => e.id));

  const result = new Map<string, number>();
  for (const echo of library) {
    if (echo.point.triggerRadiusKm > WALKED_MAX_KM || coreIds.has(echo.id)) {
      result.set(echo.id, 0);
      continue;
    }
    let nearest = Infinity;
    for (const c of core) nearest = Math.min(nearest, distanceKm(echo.point.at, c.point.at));
    result.set(echo.id, Number(Math.min(1, nearest / FULLY_REMOTE_KM).toFixed(2)));
  }
  return result;
}

/**
 * The library with remoteness filled in. A value written in the content file wins: it is a
 * writer saying what the geometry cannot see, such as a spot on the main street that sits
 * behind a locked gate most of the year.
 */
export function withRemoteness<T extends Echo>(library: readonly T[]): T[] {
  const computed = remotenessOf(library);
  return library.map((echo) =>
    echo.remoteness !== undefined ? echo : { ...echo, remoteness: computed.get(echo.id) ?? 0 },
  );
}
