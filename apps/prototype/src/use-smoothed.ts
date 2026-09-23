/**
 * The position the map draws, as distinct from the position the engine reasons about.
 *
 * A real GPS fix wanders. `SimulatedJourney` reproduces that on purpose — it jitters each
 * fix by the accuracy it claims, so the smoothing inside `ProximityGuide` is doing real
 * work rather than being handed a signal no phone ever produces. That is right for the
 * engine and wrong for the screen: four fixes a second, each a couple of metres off in a
 * random direction, and a follow-the-listener map shakes. Not drifts — shakes, with the
 * whole scene under it, because every pin is placed relative to the centre.
 *
 * So the raw fix goes to the engine and a smoothed one goes to the view. This is the same
 * split every mapping app makes, and the reason none of them look like this one did.
 *
 * An exponential moving average rather than anything cleverer. It costs two multiplies per
 * fix, it has no state to get wrong, and the lag it introduces — around a second at this
 * weight — is about a metre and a half at walking pace, which is inside the accuracy circle
 * it is smoothing in the first place.
 *
 * It snaps rather than slides on a jump: a seek, a mode switch or a route change moves the
 * listener kilometres, and easing across that would send the marker gliding over the map
 * like a paper aeroplane.
 */

import { useRef } from "react";
import type { LatLng } from "@echofinders/core";

/** How much of each new fix to take. Lower is steadier and laggier. */
const WEIGHT = 0.25;
/** Past this, it is not noise — it is somewhere else. Degrees, about 300 m of latitude. */
const JUMP_DEG = 0.003;

export function useSmoothedPoint(next: LatLng | null): LatLng | null {
  const held = useRef<LatLng | null>(null);

  if (!next) {
    held.current = null;
    return null;
  }

  const last = held.current;
  if (
    !last ||
    Math.abs(next.lat - last.lat) > JUMP_DEG ||
    Math.abs(next.lng - last.lng) > JUMP_DEG
  ) {
    held.current = next;
    return next;
  }

  held.current = {
    lat: last.lat + (next.lat - last.lat) * WEIGHT,
    lng: last.lng + (next.lng - last.lng) * WEIGHT,
  };
  return held.current;
}
