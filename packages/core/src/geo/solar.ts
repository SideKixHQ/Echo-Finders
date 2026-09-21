/**
 * Is the sun up at this point on the Earth, right now?
 *
 * Needed because a meaningful share of the library is only worth playing when the
 * passenger can actually see the thing being described. "The canyon below you" is a great
 * line over Arizona at four in the afternoon and a slightly absurd one at midnight.
 *
 * This is the standard low-precision solar position algorithm. It is accurate to a
 * fraction of a degree, which is far beyond what a day/night decision requires.
 */

import type { LatLng } from "../types.js";

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

/** Solar elevation above the horizon, in degrees. Negative means the sun has set. */
export function solarElevationDeg(at: LatLng, epochMs: number): number {
  // Days since the J2000.0 epoch (2000-01-01 12:00 UTC).
  const n = epochMs / 86_400_000 - 10_957.5;

  const meanLongitude = (280.46 + 0.9856474 * n) % 360;
  const meanAnomaly = toRad((357.528 + 0.9856003 * n) % 360);

  const eclipticLongitude = toRad(
    meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly),
  );
  const obliquity = toRad(23.439 - 0.0000004 * n);

  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude));
  const rightAscension = Math.atan2(
    Math.cos(obliquity) * Math.sin(eclipticLongitude),
    Math.cos(eclipticLongitude),
  );

  // Greenwich mean sidereal time, in hours, then localised by longitude.
  const gmstHours = (18.697374558 + 24.06570982441908 * n) % 24;
  const localSiderealDeg = (gmstHours + 24) % 24 * 15 + at.lng;
  const hourAngle = toRad(localSiderealDeg - toDeg(rightAscension));

  const lat = toRad(at.lat);
  const elevation = Math.asin(
    Math.sin(lat) * Math.sin(declination) +
      Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle),
  );

  return toDeg(elevation);
}

/**
 * True when there is usable light on the ground.
 *
 * The threshold sits at civil twilight rather than at the horizon, because at −6° there is
 * still enough light to make out a coastline from cruise altitude.
 */
export function isDaylight(at: LatLng, epochMs: number): boolean {
  return solarElevationDeg(at, epochMs) > -6;
}

/** Local solar hour, 0–24. Used for the `hours` window on an echo. */
export function localSolarHour(at: LatLng, epochMs: number): number {
  const utcHours = (epochMs / 3_600_000) % 24;
  return ((utcHours + at.lng / 15) % 24 + 24) % 24;
}
