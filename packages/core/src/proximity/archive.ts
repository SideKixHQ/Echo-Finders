/**
 * Then and now: standing where the photographer stood.
 *
 * The strongest thing a camera can do for a product about places having pasts, and it needs
 * no augmented reality at all. A photograph, the compass bearing it was taken along, and
 * the spot it was taken from are enough to tell somebody *turn left a bit, walk forward* —
 * and then they hold the phone up and align the two images themselves, which is both more
 * accurate than any anchoring we could compute and considerably more satisfying.
 *
 * Why not real AR: matching a 1908 glass plate to a live camera feed means feature matching
 * across a century of rebuilt façades, different lenses and different light. It fails on
 * exactly the buildings that changed most, which are the ones worth showing. Handing the
 * alignment to the person looking is the honest division of labour — we know where to stand
 * and roughly which way to face, they can see whether the windows line up.
 *
 * Everything here degrades. No bearing recorded, and you still get "stand here". No compass,
 * and you still get the distance. The photograph on its own, with the place in front of you,
 * is most of the value.
 */

import type { ArchivePhoto, LatLng } from "../types.js";
import { bearingDeg, distanceKm, turnDeg as turnBetween } from "../geo/great-circle.js";

export interface AlignmentOptions {
  /**
   * How close you have to be to the photographer's spot to count as standing on it, metres.
   *
   * Eight, which is roughly the width of a pavement. Tighter would be a lie — a consumer
   * GPS fix in a street is not that good — and looser starts recommending a view from the
   * middle of the road.
   */
  readonly onSpotM?: number;
  /** How far the device says its compass may be wrong, degrees. */
  readonly headingAccuracyDeg?: number;
}

/** What to tell somebody trying to line up a photograph with the world. */
export type AlignmentAdvice =
  /** Too far away for the framing to mean anything; walk towards it. */
  | "walk-there"
  /** On the right spot, pointing the wrong way. */
  | "turn"
  /** Close enough in both. Hold it up. */
  | "hold-up"
  /** No bearing was recorded, so facing cannot be checked. */
  | "no-bearing"
  /** The compass is too unreliable here to advise on facing. */
  | "no-compass";

export interface Alignment {
  readonly advice: AlignmentAdvice;
  /** Metres from where the photographer stood. */
  readonly metresAway: number;
  /**
   * Degrees to turn to face the way the camera faced. Negative is left, positive is right.
   * Null when there is no recorded bearing or no usable heading.
   */
  readonly turnDeg: number | null;
  /**
   * How well lined up, 0 to 1, combining position and facing. Drives the strength of
   * whatever the interface shows — an opacity, a meter, a warmth.
   */
  readonly score: number;
}

const DEFAULTS = {
  onSpotM: 8,
  headingAccuracyDeg: 15,
} as const;

/**
 * How close somebody is to reproducing a photograph's vantage point.
 *
 * `headingDeg` is null when the device has no compass or will not say which way it is
 * facing, which is common on the web and on any phone lying flat. That is not a failure
 * state: position alone still gets somebody to the right spot, and the advice says so
 * rather than pretending.
 */
export function alignmentTo(
  photo: ArchivePhoto,
  echoAt: LatLng,
  from: LatLng,
  headingDeg: number | null,
  options: AlignmentOptions = {},
): Alignment {
  const onSpotM = options.onSpotM ?? DEFAULTS.onSpotM;
  const headingAccuracyDeg = options.headingAccuracyDeg ?? DEFAULTS.headingAccuracyDeg;

  // Where the photographer stood, which is usually not where the subject is: a picture of a
  // building is taken from across the road, and standing *on* the building is the one place
  // you cannot reproduce it from.
  const vantage = photo.at ?? echoAt;
  const metresAway = distanceKm(from, vantage) * 1000;

  // Position score falls off over four spot-widths, so the meter starts moving while there
  // is still something useful to do about it.
  const nearness = clamp01(1 - metresAway / (onSpotM * 4));

  if (photo.bearingDeg === undefined) {
    return {
      advice: metresAway > onSpotM * 2 ? "walk-there" : "no-bearing",
      metresAway,
      turnDeg: null,
      score: nearness,
    };
  }

  if (headingDeg === null || headingAccuracyDeg >= 45) {
    // A compass this unsure would send somebody in the wrong direction with confidence,
    // which costs more trust than admitting it cannot help.
    return {
      advice: metresAway > onSpotM * 2 ? "walk-there" : "no-compass",
      metresAway,
      turnDeg: null,
      score: nearness,
    };
  }

  // Which way to face. A photograph taken *from* the vantage looks along its bearing, so
  // when somebody is standing somewhere else the useful direction is towards the subject
  // rather than the recorded bearing — otherwise they face a wall parallel to the shot.
  const onSpot = metresAway <= onSpotM;
  const target = onSpot ? photo.bearingDeg : bearingDeg(from, vantage);
  const turn = turnBetween(headingDeg, target);

  // Facing score allows the compass its own error before counting anything as wrong.
  const slack = Math.max(0, Math.abs(turn) - headingAccuracyDeg);
  const facing = clamp01(1 - slack / 60);

  // "Hold it up" requires standing on the spot, not merely near it.
  //
  // This used to allow it anywhere inside two spot-widths, which is wrong in a way that
  // wastes the whole exercise: at twelve metres out the target bearing is *towards the
  // vantage*, so somebody facing it was told to hold the phone up while pointing at the
  // patch of pavement they were supposed to be standing on, rather than at the building
  // the photograph is of. The reward for walking the last few metres is the only reason
  // to walk them.
  const advice: AlignmentAdvice = !onSpot
    ? "walk-there"
    : Math.abs(turn) > headingAccuracyDeg + 12
      ? "turn"
      : "hold-up";

  return { advice, metresAway, turnDeg: turn, score: nearness * facing };
}

/** Human-readable, and deliberately coarse — a live degree readout invites staring. */
export function alignmentWords(alignment: Alignment): string {
  switch (alignment.advice) {
    case "walk-there":
      return alignment.metresAway < 950
        ? `About ${Math.round(alignment.metresAway / 10) * 10}m away`
        : `${(alignment.metresAway / 1000).toFixed(1)}km away`;
    case "turn":
      return (alignment.turnDeg ?? 0) < 0 ? "Turn left" : "Turn right";
    case "hold-up":
      return "Hold it up here";
    case "no-bearing":
      return "Stand here — no facing recorded";
    case "no-compass":
      return "Stand here — compass unreliable";
  }
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
