/**
 * Two airports, made into a journey.
 *
 * This is what a flight-data subscription would otherwise be for, and it is forty lines,
 * because the engine already does the hard part. `buildRouteGeometry` takes waypoints and
 * joins them along great circles, and `findEchoesAlongRoute` finds whatever is in the
 * corridor. Neither of them cares whether the waypoints came from an airline's filed route
 * or from two coordinates and some arithmetic.
 *
 * **A great circle is a prior, not a claim.** A real flight tracks a little off it for wind
 * and airspace, and some transatlantics are a hundred miles north of the line for an hour.
 * It matters less than it sounds: an echo fires when the phone is actually near the place,
 * not when the model thinks it should be, so the geometry decides what is *on the route*
 * and the GPS decides *when*. The one case it gets genuinely wrong is a route that is not
 * remotely direct, and for that we would want the filed track and a subscription to get it.
 *
 * The duration is arithmetic too: distance over the mode's cruising speed, plus a fixed
 * allowance for the parts of a flight that are not cruising. That is what the timings are
 * built against, and the flight is re-paced against the real position the moment there is
 * one.
 */

import { distanceKm, presetFor, type Route } from "@echofinders/core";
import type { Airport } from "./airports";

/** Taxi, climb and descent, in seconds. Not cruising, and not nothing. */
const GROUND_AND_CLIMB_S = 45 * 60;

export function buildFlight(from: Airport, to: Airport): Route {
  const km = distanceKm(
    { lat: from.lat, lng: from.lng },
    { lat: to.lat, lng: to.lng },
  );
  const cruiseKph = presetFor("flight").speedKph;

  return {
    id: `adhoc:${from.code}-${to.code}`,
    mode: "flight",
    name: `${from.city} to ${to.city}`,
    origin: {
      name: from.name,
      at: { lat: from.lat, lng: from.lng },
      timeZone: from.timeZone,
      code: from.code,
    },
    destination: {
      name: to.name,
      at: { lat: to.lat, lng: to.lng },
      timeZone: to.timeZone,
      code: to.code,
    },
    /*
     * Two waypoints, which is all the geometry needs: it interpolates the great circle
     * between them at whatever resolution the corridor query wants.
     */
    waypoints: [
      { at: { lat: from.lat, lng: from.lng }, name: from.city },
      { at: { lat: to.lat, lng: to.lng }, name: to.city },
    ],
    departureAt: new Date().toISOString(),
    durationS: Math.round((km / cruiseKph) * 3600) + GROUND_AND_CLIMB_S,
    cruiseAltitudeFt: 35000,
  };
}
