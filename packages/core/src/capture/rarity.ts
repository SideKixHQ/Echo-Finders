/**
 * How hard is it to stand here?
 *
 * Every input is a fact about the world rather than a dial: whether the place is off the
 * walk most people take, whether it is reachable at all hours, whether you have to go inside
 * somewhere, and whether the spot itself is hard to find. Nothing here is tunable for
 * pacing, deliberately: the moment rarity is assigned rather than earned, a collection of
 * places you stood stops meaning anything.
 *
 * Rewritten 2026-11-05 (`docs/13-story-mix.md`, approved by James). The first version scored
 * the trigger radius, and the standard walking radius (40 m) counted as "find the exact
 * spot" on its own, so 318 of 329 echoes came out uncommon and the tier said nothing. A
 * standard radius is the default, not a difficulty. Only a radius set tighter than the
 * default on purpose still scores, because then the spot really is the point.
 */

import { distanceKm } from "../geo/great-circle.js";
import type { Echo } from "../types.js";
import type { Rarity } from "./types.js";

/** A radius at or below this was set on purpose: a plaque, a mark on a wall, one grave. */
const TIGHT_SPOT_KM = 0.03;

/**
 * Remoteness thresholds, on the 0 to 1 scale `remotenessOf` writes: distance from the
 * main walk over 2 km, capped at 1. So 0.2 is 400 m off it and 0.75 is 1.5 km.
 */
const REMOTE = 0.75;
const OFF_THE_BEATEN_TRACK = 0.2;

export function rarityOf(echo: Echo): Rarity {
  let difficulty = 0;

  // A spot you have to find: tighter than the standard radius on purpose.
  if (echo.point.triggerRadiusKm <= TIGHT_SPOT_KM) difficulty += 1;

  // Availability: an echo you can only open after dark, or in one season.
  if (echo.hours) difficulty += 1;

  // Somewhere you have to walk into: a church, a museum, a bar, a gated cemetery.
  if (echo.inside) difficulty += 1;

  // Remoteness: how far off the walk most people take.
  const remoteness = echo.remoteness ?? 0;
  if (remoteness >= REMOTE) difficulty += 2;
  else if (remoteness >= OFF_THE_BEATEN_TRACK) difficulty += 1;

  if (difficulty >= 3) return "singular";
  if (difficulty >= 2) return "rare";
  if (difficulty >= 1) return "uncommon";
  return "common";
}

/** Human-readable reason an echo is hard to reach, for the collection screen. */
export function rarityReasons(echo: Echo): string[] {
  const reasons: string[] = [];

  if (echo.point.triggerRadiusKm <= TIGHT_SPOT_KM) reasons.push("You have to find the exact spot");
  if (echo.hours) reasons.push("Only open at certain hours");
  if (echo.inside) reasons.push("You have to go inside");

  const remoteness = echo.remoteness ?? 0;
  if (remoteness >= REMOTE) reasons.push("A long way from anywhere");
  else if (remoteness >= OFF_THE_BEATEN_TRACK) reasons.push("Off the beaten track");

  return reasons;
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
