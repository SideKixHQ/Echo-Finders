/**
 * The echoes nearest to where you stand, by the engine's own distance.
 *
 * Plain nearest first, not the engine's blended `findEchoesNearby` score: that one looks
 * only a walk's distance out, and the map shows every echo however far it is. The map
 * uses it to tell VoiceOver which echo is nearest (`EchoMap.tsx`). `distanceKm` is the engine's great circle distance, and
 * "in range" is the echo's own trigger radius, the same test a walk uses.
 */
import { distanceKm, type Echo, type LatLng } from "@echofinders/core";

export interface NearestEcho {
  readonly echo: Echo;
  readonly distanceKm: number;
  /** Inside the echo's own trigger radius: you are standing at it. */
  readonly inRange: boolean;
}

export function nearestEchoes(at: LatLng, library: readonly Echo[], limit = 30): NearestEcho[] {
  return library
    .map((echo) => {
      const km = distanceKm(at, echo.point.at);
      return { echo, distanceKm: km, inRange: km <= echo.point.triggerRadiusKm };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}
