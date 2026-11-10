/**
 * How far is too far to be walked there, and how long an echo is to listen to.
 *
 * Searching Boston from Wilmington and tapping Go opened the card with "Walk there", and
 * tapping that started turn by turn: "1,083 km · Head northeast · Too far to walk". The
 * directions already knew it was too far (`DirectionsBar`); the card did not ask. Now both
 * ask the same question here, so the card stops offering a walk the directions would refuse.
 *
 * And the echo bar said "1,083 km · 0:59", where 0:59 was how long the echo is and read like
 * how long the trip takes. Wherever a distance and a length sit together, the length says
 * what it is: "1 min listen".
 */

/**
 * Past this, the app does not walk you there: about an hour on foot.
 *
 * It was twenty, and at Wrightsville Beach the card offered "Walk there · 2 hr 7 min" to an
 * echo 9.5 km off, and the directions it started said so (James, 2026-11-10). Past an
 * hour the card says how far and offers Save instead, the same as for a city away.
 */
export const WALKABLE_KM = 5;

/** Too far to be taken there by the app's in-app directions. Unknown distance is not. */
export function tooFarToWalk(distanceKm: number | null): boolean {
  return distanceKm !== null && distanceKm > WALKABLE_KM;
}

/** "1 min listen", "12 min listen": a length that cannot be mistaken for a journey. */
export function listenLength(seconds: number): string {
  return `${Math.max(1, Math.round(seconds / 60))} min listen`;
}

/** "9.5 km away", "25 km away", "1,083 km away": plainly, for an echo too far to walk to. */
export function farAway(distanceKm: number): string {
  if (distanceKm < 9.95) return `${distanceKm.toFixed(1)} km away`;
  return `${Math.round(distanceKm).toLocaleString("en-US")} km away`;
}
