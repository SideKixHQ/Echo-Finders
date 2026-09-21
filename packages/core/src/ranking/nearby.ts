/**
 * Free-roam discovery: what is around me, right now, with no route at all.
 *
 * Everything else in this engine assumes a line through the world — you are going from
 * here to there, and the question is what to say along the way. Standing still is a
 * different question, and the corridor machinery cannot answer it: there is no path to
 * project onto and no arrival time to schedule against.
 *
 * This is the mode for wandering a city, arriving somewhere with an afternoon free, or
 * simply looking up from a bench and wondering what happened here. It is also the mode a
 * discovery or collection feature would be built on.
 */

import type { Echo, LatLng, ListenerProfile, TravelMode } from "../types.js";
import { distanceKm } from "../geo/great-circle.js";
import { checkEligibility, scoreEcho } from "./score.js";
import { presetFor } from "../modes.js";

export interface NearbyEcho {
  readonly echo: Echo;
  /** Straight-line distance from the listener, km. */
  readonly distanceKm: number;
  /** Bearing from the listener to the echo, degrees from north. */
  readonly score: number;
  /**
   * True when the listener is inside the echo's own trigger radius — close enough that
   * it would have surfaced on its own during a route.
   */
  readonly inRange: boolean;
}

export interface NearbyOptions {
  /** How far to look, km. Defaults to a generous multiple of the mode's corridor. */
  readonly radiusKm?: number;
  /** Most results to return. */
  readonly limit?: number;
  /** When the listener is here, for the day/night and opening-hours rules. */
  readonly atMs?: number;
  /** How they are moving. Governs which echoes are worth surfacing at all. */
  readonly mode?: TravelMode;
  /** Require rendered audio. */
  readonly requireAudio?: boolean;
}

const DEFAULT_LIMIT = 30;

/**
 * Echoes near a point, nearest-and-best first.
 *
 * Ranking blends distance with quality rather than sorting on distance alone. Pure
 * proximity produces a list led by whatever happens to be underfoot, which in a city
 * centre means the least interesting thing within twenty metres outranks something
 * remarkable two streets away. Someone choosing what to walk towards wants the opposite.
 */
export function findEchoesNearby(
  at: LatLng,
  library: readonly Echo[],
  listener: ListenerProfile,
  options: NearbyOptions = {},
): NearbyEcho[] {
  const mode = options.mode ?? "walking";
  // Look further than a route corridor would: on a route you pass things whether you like
  // it or not, whereas here the listener is deciding where to go next.
  const radiusKm = options.radiusKm ?? presetFor(mode).corridorKm * 8;
  const atMs = options.atMs ?? Date.now();

  const found: NearbyEcho[] = [];

  for (const echo of library) {
    const km = distanceKm(at, echo.point.at);
    if (km > radiusKm) continue;

    const eligibility = checkEligibility(echo, {
      profile: listener,
      playAtMs: atMs,
      requireAudio: options.requireAudio,
    });
    if (!eligibility.eligible) continue;

    // Reuse the route scorer for quality, interest and visibility, but supply proximity
    // ourselves: its notion of "off the track" has no meaning when there is no track.
    const base = scoreEcho(
      { echo, crossTrackKm: 0, alongTrackKm: 0, nearestPoint: echo.point.at },
      { profile: listener, playAtMs: atMs, mode },
    );

    const closeness = 1 - Math.min(1, km / radiusKm) ** 0.5;
    const score = base.total * 0.65 + closeness * 0.35;

    found.push({
      echo,
      distanceKm: km,
      score,
      inRange: km <= echo.point.triggerRadiusKm,
    });
  }

  found.sort((a, b) => b.score - a.score);
  return found.slice(0, options.limit ?? DEFAULT_LIMIT);
}

/**
 * The single echo worth surfacing unprompted, if any.
 *
 * Used for the "you are standing somewhere interesting" moment. Deliberately strict: it
 * only fires when the listener is genuinely inside an echo's trigger radius, because an
 * unprompted interruption that turns out to be about somewhere half a mile away teaches
 * people to ignore the next one.
 */
export function echoUnderfoot(
  at: LatLng,
  library: readonly Echo[],
  listener: ListenerProfile,
  options: NearbyOptions = {},
): NearbyEcho | null {
  const candidates = findEchoesNearby(at, library, listener, {
    ...options,
    radiusKm: options.radiusKm ?? 2,
  }).filter((n) => n.inRange);

  if (candidates.length === 0) return null;

  // Closest wins here, not best: if you are standing inside two trigger radii, the one you
  // are actually on top of is the one you are looking at.
  return candidates.reduce((best, n) => (n.distanceKm < best.distanceKm ? n : best));
}
