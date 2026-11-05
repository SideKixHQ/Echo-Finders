/**
 * Two-stage arrival: coarse regions the operating system watches, then a fine check we make.
 *
 * WHY THIS EXISTS.
 *
 * The product's promise in walking mode is that an echo opens when you arrive, with the
 * phone in a pocket and the screen off, so you are looking at the street instead of at a
 * phone. That promise cannot be kept by this engine polling a position, because on iOS a
 * backgrounded app is suspended and none of our code runs. Whatever loop we write stops
 * the moment the screen goes dark.
 *
 * What does run is Core Location. You hand it circles, it watches them against cell, wifi
 * and GPS on its own schedule, and it wakes the app when one is crossed, even from
 * terminated. So the engine's job in the background is not "where am I" but "which
 * circles should the system be watching right now".
 *
 * THE TWO STAGES, AND WHY THE RADIUS CHANGES BETWEEN THEM.
 *
 * Every echo in the library carries a `triggerRadiusKm`, and on foot it is usually 40 m,
 * chosen so an echo is about the doorway you are standing in rather than the block. That
 * is the right editorial radius and the wrong radius to give an operating system. Region
 * monitoring leans on cell and wifi positioning and is dependable at a hundred metres and
 * up; a 40 m circle fires late, or in a dense street with poor wifi, not at all.
 *
 * So the coarse stage widens the circle to something the platform can actually honour
 * (`COARSE_RADIUS_FLOOR_M`), and the fine stage puts the editorial radius back. Crossing a
 * coarse region is not an arrival, it is permission to go and look: the app wakes, turns
 * on a precise fix, and `arrivalAt` decides whether the listener is really inside the
 * echo's own radius or merely in the neighbourhood.
 *
 * This keeps the content unchanged. No echo's `triggerRadiusKm` moves, because the number
 * in the file is still exactly what decides whether the echo plays. Only the circle handed
 * to the platform is different, and that is a delivery detail rather than an editorial one.
 *
 * THE CAP IS TWENTY, AND IT IS NOT OURS TO RAISE.
 *
 * Core Location monitors at most twenty regions per app, and Apple's own guidance is to
 * register what is nearby and swap as the listener moves. Twenty is small: downtown
 * Wilmington alone is a hundred and five echoes. So this is a ranking problem, and the
 * engine already knows how to rank. `regionsToMonitor` picks the twenty worth watching and
 * is expected to be called again every time the app wakes, which is exactly when the
 * listener has moved far enough for the answer to have changed.
 *
 * Verified against Apple's region monitoring guide, 2026-11-05. Check it again before a
 * submission: the cap has been twenty for a very long time but it is Apple's number, not
 * ours, and `CLMonitor` is new enough to be worth re-reading.
 */

import type { Echo, LatLng, ListenerProfile } from "../types.js";
import { distanceKm } from "../geo/great-circle.js";
import { checkEligibility } from "../ranking/score.js";
import { findEchoesNearby, type NearbyEcho } from "../ranking/nearby.js";

/**
 * The most regions one app may hand the system at once.
 *
 * Apple's limit, for Core Location on iOS. Android's geofencing API allows considerably
 * more, so a platform that can take more should pass its own `max` rather than inherit
 * this one.
 */
export const IOS_REGION_LIMIT = 20;

/**
 * The smallest circle worth asking a platform to watch, in metres.
 *
 * Below this, region monitoring is unreliable rather than merely imprecise, and an echo
 * that sometimes does not fire is worse than one that fires early and is then filtered by
 * the fine stage. A hundred and fifty metres is roughly a city block, which is also about
 * the distance at which it is useful to start listening for an arrival.
 *
 * Not measured on a real device yet. This is the floor to start from, and the number to
 * revisit once there is a walk log from an actual iPhone.
 */
export const COARSE_RADIUS_FLOOR_M = 150;

/** A circle for the platform to watch, and what to do when it is crossed. */
export interface MonitoredRegion {
  readonly echoId: string;
  /** Centre of the circle: the echo's own point. */
  readonly at: LatLng;
  /** Radius to register with the platform, metres. Never below `COARSE_RADIUS_FLOOR_M`. */
  readonly radiusM: number;
  /** The echo's editorial radius, metres. What the fine stage checks on wake. */
  readonly triggerRadiusM: number;
  /** Why this one made the cut, for the walk log. Ranking score, 0 to 1. */
  readonly score: number;
}

export interface RegionPlanOptions {
  /** Platform cap. Defaults to Apple's twenty. */
  readonly max?: number;
  /** Smallest radius the platform can honour. Defaults to `COARSE_RADIUS_FLOOR_M`. */
  readonly minRadiusM?: number;
  /** How far out to consider echoes, km. Defaults to the walking preset's search. */
  readonly searchRadiusKm?: number;
  /**
   * Echo ids the platform is already watching.
   *
   * Re-registering a region the system already holds makes it fire its exit and entry
   * events again, which reaches the listener as an echo replaying for no reason. So a
   * region that is still worth watching keeps its place even if something marginally
   * better has come into range: churn costs more than the ranking gains.
   */
  readonly keep?: readonly string[];
  /** When the listener is here, for day/night and opening-hours eligibility. */
  readonly atMs?: number;
}

/**
 * The regions the platform should be watching, best first.
 *
 * Call this on every wake. The listener has moved, which is the only reason the system
 * woke us, so the previous answer is by definition stale.
 */
export function regionsToMonitor(
  at: LatLng,
  library: readonly Echo[],
  listener: ListenerProfile,
  options: RegionPlanOptions = {},
): MonitoredRegion[] {
  const max = Math.max(0, options.max ?? IOS_REGION_LIMIT);
  if (max === 0) return [];

  const minRadiusM = options.minRadiusM ?? COARSE_RADIUS_FLOOR_M;
  const keep = new Set(options.keep ?? []);

  const candidates: readonly NearbyEcho[] = findEchoesNearby(at, library, listener, {
    mode: "walking",
    radiusKm: options.searchRadiusKm,
    atMs: options.atMs,
    // Ask for more than the cap so the hysteresis pass has somewhere to choose from.
    limit: max * 4,
  });

  const region = (echo: Echo, score: number): MonitoredRegion => {
    const triggerRadiusM = echo.point.triggerRadiusKm * 1000;
    return {
      echoId: echo.id,
      at: echo.point.at,
      radiusM: Math.max(minRadiusM, triggerRadiusM),
      triggerRadiusM,
      score,
    };
  };

  // Already-watched regions that are still in range come first, in ranking order, so a
  // listener standing still never sees the set churn underneath them.
  const held = candidates.filter((c: NearbyEcho) => keep.has(c.echo.id));
  const fresh = candidates.filter((c: NearbyEcho) => !keep.has(c.echo.id));

  return [...held, ...fresh].slice(0, max).map((c: NearbyEcho) => region(c.echo, c.score));
}

/** What the fine stage concluded, once the app is awake with a real fix. */
export type Arrival =
  /** Inside the echo's own radius, allowing for the fix's error. Play it. */
  | { readonly kind: "arrived"; readonly distanceM: number }
  /**
   * Close, but the fix is too vague to be sure either way. Keep sampling: this is the
   * normal first answer, because the first fix after a wake is the worst one.
   */
  | { readonly kind: "unsure"; readonly distanceM: number; readonly accuracyM: number }
  /**
   * Outside the echo's radius by more than the fix's error. The coarse region did its
   * job and the answer is no. Go back to sleep rather than holding GPS open.
   */
  | { readonly kind: "elsewhere"; readonly distanceM: number };

export interface Fix {
  readonly at: LatLng;
  /** Horizontal accuracy, metres. The radius of the circle the device believes it is in. */
  readonly accuracyM: number;
}

/**
 * Stage two: is the listener actually here?
 *
 * Deliberately three-valued. A fix is a circle, not a point, and the honest answer when
 * that circle straddles the boundary is "ask me again in a moment" rather than a guess.
 * Treating an uncertain fix as an arrival is how an echo plays to somebody standing on the
 * wrong side of a junction, and that is the failure that teaches people to stop trusting
 * it.
 *
 * `elsewhere` matters as much as `arrived`, because it is the signal to stop: a coarse
 * region covers a block and most crossings of it are not arrivals. Without a way to say
 * no, every wake would hold a precise fix open until the battery noticed.
 */
export function arrivalAt(region: Pick<MonitoredRegion, "at" | "triggerRadiusM">, fix: Fix): Arrival {
  const distanceM = distanceKm(fix.at, region.at) * 1000;
  const accuracyM = Math.max(0, fix.accuracyM);

  if (distanceM + accuracyM <= region.triggerRadiusM) return { kind: "arrived", distanceM };
  if (distanceM - accuracyM > region.triggerRadiusM) return { kind: "elsewhere", distanceM };
  return { kind: "unsure", distanceM, accuracyM };
}

/**
 * Whether an eligible echo could ever be monitored at all.
 *
 * A convenience for the walk screen rather than for the platform: it answers "why did
 * nothing open" honestly, which is otherwise one of the hardest things to explain to
 * somebody standing in the street.
 */
export function monitorable(
  echo: Echo,
  listener: ListenerProfile,
  atMs: number = Date.now(),
): boolean {
  return checkEligibility(echo, { profile: listener, playAtMs: atMs }).eligible;
}
