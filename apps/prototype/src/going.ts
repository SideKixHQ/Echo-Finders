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

/**
 * HOW LONG UNTIL I AM THERE, which is the question, and metres only when minutes are silly.
 *
 * It was metres all the way out, and "390 m" is a measurement rather than an answer:
 * nobody decides anything from it without first dividing by their own walking pace in
 * their head. Six minutes is the decision. It is also the one number this bar was missing
 * — the top of the screen has how long the whole journey has left, the bar had how long
 * the story is, and neither of them is how far away the thing in front of you is in the
 * only unit a person plans with.
 *
 * Near the end it goes back to distance, because minutes stop meaning anything there: "one
 * minute" is noise when you can see the doorway, while "100 m" tells you to look up. And
 * inside the trigger radius it stops being a number at all — a live count that close
 * invites staring at a screen instead of at the thing, which is the one behaviour this
 * whole product is arranged to prevent.
 *
 * The metres are rounded to fifty, which is the echo card's rounding. They are on screen
 * together — tap the bar and the card opens above it — and they disagreed in an early
 * render: "390 m" on the bar over "About 400m away" on the card, about the same echo, two
 * inches apart. That is how somebody stops believing either number.
 *
 * Here rather than in `EchoBar.tsx` so the synced toast's Next says distance the same way
 * (`toast-rules.ts`).
 */
export function reach(distanceKm: number | null, cue: string | null, speedKph: number): string {
  if (cue === "arrived") return "you're here";
  if (cue === "close") return "a few steps";
  if (distanceKm === null) return "near here";
  const m = distanceKm * 1000;
  if (m < 150) return `${Math.max(50, Math.round(m / 50) * 50)} m`;
  const minutes = Math.round((distanceKm / speedKph) * 60);
  if (minutes < 1) return `${Math.round(m / 50) * 50} m`;
  if (minutes < 60) return `${minutes} min`;
  // Somewhere looked up, not walked to: hours on foot is not an answer, a distance is.
  if (minutes >= 600) return `${Math.round(distanceKm).toLocaleString("en-US")} km`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}`;
}
