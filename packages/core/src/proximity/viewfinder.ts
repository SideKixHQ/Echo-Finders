/**
 * Seeing echoes through the camera.
 *
 * Worth being precise about what this is, because "AR" covers two very different things.
 *
 * True augmented reality — surface detection, world anchors, occlusion — needs ARKit or
 * ARCore, does not exist in mobile Safari, and would place a marker on a wall with
 * centimetre precision. That precision is worthless here: we know where an echo is to
 * within a GPS fix, which is metres at best, and we know which way the phone is pointing to
 * within a compass reading, which in a street lined with steel-framed buildings can be
 * tens of degrees out.
 *
 * So this is the simpler and more honest thing: the camera feed with markers placed by
 * **bearing**. The same technique star-gazing and peak-finding apps use, it works on every
 * platform, and it degrades gracefully — because it never claimed to know exactly where the
 * doorway was.
 *
 * The one rule that follows from the uncertainty: **draw a region, not a pin.** A marker
 * that says "somewhere in this arc" is honest and stays useful when the compass is twenty
 * degrees out. A pin hovering confidently over the wrong building is worse than no marker
 * at all, and it is exactly what a naive implementation produces in a city centre.
 */

import type { Echo, LatLng } from "../types.js";
import { bearingDeg, distanceKm } from "../geo/great-circle.js";

export interface ViewfinderOptions {
  /**
   * Horizontal field of view of the camera, degrees. Phone rear cameras are typically
   * 60–70°; ultra-wide lenses reach 100° or more.
   */
  readonly fovDeg?: number;
  /**
   * How far the compass may be wrong, degrees, as the device reports it. Assume a lot
   * indoors and among tall buildings.
   */
  readonly headingAccuracyDeg?: number;
  /** Ignore echoes beyond this, km. */
  readonly maxDistanceKm?: number;
}

const DEFAULTS = {
  fovDeg: 65,
  headingAccuracyDeg: 15,
  maxDistanceKm: 2,
} as const;

export interface ViewfinderMarker {
  readonly echo: Echo;
  readonly distanceKm: number;
  /** Bearing from the viewer to the echo, degrees clockwise from north. */
  readonly bearingDeg: number;
  /**
   * Horizontal position in the frame: −1 at the left edge, 0 dead centre, 1 at the right.
   * Values outside that range are behind or beside the viewer.
   */
  readonly x: number;
  readonly inFrame: boolean;
  /**
   * How wide to draw the marker, as a fraction of frame width, to honestly represent how
   * unsure we are. Never draw narrower than this.
   */
  readonly spread: number;
  /** Degrees to turn to centre it. Negative is left, positive is right. */
  readonly turnDeg: number;
}

/**
 * Place echoes in the camera frame.
 *
 * Returns markers for everything within range, in view or not — an off-frame marker is
 * what lets the UI draw an arrow saying "turn left", which is most of the value on a
 * street where the thing you want is behind you.
 */
export function viewfinderMarkers(
  at: LatLng,
  headingDeg: number,
  echoes: readonly Echo[],
  options: ViewfinderOptions = {},
): ViewfinderMarker[] {
  const fovDeg = options.fovDeg ?? DEFAULTS.fovDeg;
  const headingAccuracyDeg = options.headingAccuracyDeg ?? DEFAULTS.headingAccuracyDeg;
  const maxDistanceKm = options.maxDistanceKm ?? DEFAULTS.maxDistanceKm;

  const halfFov = fovDeg / 2;
  const markers: ViewfinderMarker[] = [];

  for (const echo of echoes) {
    const km = distanceKm(at, echo.point.at);
    if (km > maxDistanceKm) continue;

    const bearing = bearingDeg(at, echo.point.at);
    const turnDeg = signedAngle(bearing - headingDeg);

    markers.push({
      echo,
      distanceKm: km,
      bearingDeg: bearing,
      x: turnDeg / halfFov,
      inFrame: Math.abs(turnDeg) <= halfFov,
      // The marker spans the compass error, so a twenty-degree error draws a wide arc
      // rather than a confident pin over the wrong building.
      spread: Math.min(1, (headingAccuracyDeg * 2) / fovDeg),
      turnDeg,
    });
  }

  // Nearest last, so a painter's-algorithm render draws close things over distant ones.
  markers.sort((a, b) => b.distanceKm - a.distanceKm);
  return markers;
}

/**
 * Is the compass trustworthy enough to point at anything?
 *
 * When it is not — and among tall buildings it frequently is not — the viewfinder should
 * say so and fall back to the map rather than quietly pointing somewhere wrong. A confident
 * wrong answer costs more trust than an admitted unknown.
 */
export function headingIsUsable(headingAccuracyDeg: number, fovDeg = DEFAULTS.fovDeg): boolean {
  return headingAccuracyDeg < fovDeg / 2;
}

/** Normalise any angle to the range (−180, 180]. */
function signedAngle(deg: number): number {
  const wrapped = ((deg % 360) + 540) % 360 - 180;
  return wrapped === -180 ? 180 : wrapped;
}
