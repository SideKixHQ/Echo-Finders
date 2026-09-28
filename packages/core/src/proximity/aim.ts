/**
 * Which way to turn, and how far, in words a walker can use.
 *
 * The rose shows a bearing as a position on a dial, which is right when you are surveying
 * what is around you and wrong when you have picked one and started walking. Walking is a
 * single question asked over and over — *am I still going the right way* — and the honest
 * answer to it is a sentence, not a diagram. You can read a sentence at waist height
 * without stopping.
 *
 * All of this is relative to where you are FACING, not to north. "Ahead" is a thing a body
 * understands and "north-north-east" is a thing a map understands, and only one of the two
 * is walking down the street.
 */

/** Degrees clockwise from true north. Normalised into [0, 360). */
export function relativeBearing(bearingDeg: number, headingDeg: number): number {
  const d = (bearingDeg - headingDeg) % 360;
  return d < 0 ? d + 360 : d;
}

/**
 * The bands.
 *
 * Not even, deliberately. "Straight ahead" is narrow (±14°) because it is a strong claim
 * and a phone compass is routinely 15° out; "behind you" is wide because once something is
 * behind you the only instruction that matters is turn round, and the exact angle is
 * noise. The middle bands are wide enough that ordinary walking wobble does not flip the
 * sentence every second, which is the failure that makes turn-by-turn guidance feel
 * frantic.
 */
export function aimWords(relativeDeg: number): string {
  const d = ((relativeDeg % 360) + 360) % 360;
  const side = d <= 180 ? "right" : "left";
  // Distance from straight ahead, 0 to 180, whichever way round.
  const off = d <= 180 ? d : 360 - d;

  if (off <= 14) return "Straight ahead";
  if (off <= 50) return `Ahead and slightly ${side}`;
  if (off <= 115) return `To your ${side}`;
  if (off <= 155) return `Behind you, to the ${side}`;
  return "Turn around";
}

/**
 * How far, as a number big enough to read while moving.
 *
 * Rounded, and rounded *coarser the further away it is*, because that is where the
 * precision actually is. A consumer GPS fix is good to about ten metres on a clear street
 * and much worse between tall buildings, so "153 m" is three digits of which one is a lie.
 * Rounding also stops the number flickering: an unrounded readout changes on every fix
 * whether or not you moved, which reads as the app being unsure.
 *
 * This is the opposite call from the proximity bar, which says "about 200m" on purpose to
 * keep eyes off the screen. There the phone is in a pocket. Here it is in a hand and the
 * number is the whole screen, so it may as well be the best number we have.
 */
export interface WalkDistance {
  readonly value: string;
  readonly unit: string;
}

export function walkDistance(km: number): WalkDistance {
  const m = km * 1000;
  if (m < 25) return { value: "Here", unit: "" };
  if (m < 200) return { value: String(Math.round(m / 5) * 5), unit: "m" };
  if (m < 1000) return { value: String(Math.round(m / 10) * 10), unit: "m" };
  if (m < 10000) return { value: (Math.round(m / 100) / 10).toFixed(1), unit: "km" };
  return { value: String(Math.round(km)), unit: "km" };
}

/**
 * The fallback for when there is no compass.
 *
 * Which is not rare: iOS gives no heading at all until somebody taps a button asking for
 * it, and it gives none ever on a desktop browser. Without a heading there is no "left",
 * because left is relative to a body we cannot see. What we still know is the true bearing,
 * and a true bearing has a name people can act on if they can find north — a street sign,
 * the sun, the map one tap away.
 *
 * Sixteen points would be more precise and less usable. "East-north-east" is a sailing term
 * and this is a pedestrian.
 */
const POINTS = [
  "north",
  "north-east",
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
] as const;

export function compassWords(bearingDeg: number): string {
  const d = ((bearingDeg % 360) + 360) % 360;
  // +22.5 so each name owns the 45 degrees CENTRED on it rather than starting at it.
  const i = Math.floor(((d + 22.5) % 360) / 45);
  return POINTS[i] ?? "north";
}
