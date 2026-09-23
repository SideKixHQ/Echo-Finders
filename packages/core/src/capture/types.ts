/**
 * Capturing echoes on foot.
 *
 * The obvious reading of "like Pokémon Go" would put a game in front of the reward: find
 * the thing, perform some flick or timing trick, and be granted a prize. That is exactly
 * wrong here, and the reason is worth stating plainly, because it shapes every decision
 * below.
 *
 * In Pokémon Go the creature *is* the prize; the catch is the whole experience. In Echo
 * Finders the prize is a story about where you are standing. A capture mini-game would sit
 * between a person and the thing they came for, and every second of it is a second spent
 * looking at a phone instead of at the place the story is about.
 *
 * So capture is arrival. You walk into the place, and the echo opens. The skill is
 * navigation and the willingness to actually go there, which is the only skill this product
 * should ever reward.
 *
 * What that buys, and it is the thing no map game has: **the whole loop works with the
 * screen off**. Phone in a pocket, headphones in, walking. You arrive, you hear a chime,
 * the story starts. Nothing to tap, nothing to watch, nothing to aim. A find-and-collect
 * layer normally pulls attention *to* the screen; this one is the only version that can
 * pull attention away from it, which is the difference between the mechanic serving the
 * product's stated purpose and quietly replacing it.
 */

import type { Echo, LatLng } from "../types.js";

/**
 * Three states, not two.
 *
 * Separating "I was there" from "I listened" matters more than it first appears: a person
 * can walk a neighbourhood and open eight echoes in half an hour, and eight echoes is an
 * hour of listening. Collapsing the two would force a choice between standing still to
 * finish a story and moving on and losing it. Capture on arrival, listen whenever — on the
 * train home, that evening, next year.
 */
export type CaptureState =
  /** Visible on the map, not yet opened. The listener has never been inside its radius. */
  | "sealed"
  /** Opened by arriving. Theirs permanently, playable anywhere, from now on. */
  | "captured"
  /** Opened and listened to, at least once through. */
  | "heard";

/**
 * Proof that someone stood somewhere.
 *
 * Deliberately records where the listener actually was rather than only which echo opened.
 * Over time this is the more valuable half: a personal record of the places a life has
 * passed through, which is a far better reason to keep an app than a number that goes up.
 */
export interface CaptureRecord {
  readonly echoId: string;
  /** ISO timestamp of the moment it opened. */
  readonly capturedAt: string;
  /**
   * Where the listener actually stood, which is not the same as where the echo is.
   *
   * Optional because a listener can decline to have it kept, and **absent is how that is
   * expressed** (`redactRecord`). It used to be a required field carrying `NaN` as a
   * sentinel, which worked only for as long as the record never left memory: `NaN` survives
   * a structured clone into IndexedDB and turns into `null` through `JSON.stringify`, so a
   * redacted record was one serialisation away from looking like a real position at 0°N 0°E.
   * Optionality says the same thing in a way every store and every reader understands.
   */
  readonly stoodAt?: LatLng;
  /** How far from the echo's point they were, km. Absent with `stoodAt`, and for the same reason. */
  readonly distanceKm?: number;
  /** ISO timestamp of the first complete listen, if there has been one. */
  readonly heardAt?: string;
}

/** Why an arrival did not open an echo. */
export type CaptureRefusal =
  /** Not close enough, allowing for the accuracy of the fix. */
  | "out-of-range"
  /** In range, but not for long enough yet. See `dwellS`. */
  | "still-arriving"
  /** Already open. */
  | "already-captured"
  /** Age gate, category filter, or an unapproved echo. */
  | "not-eligible"
  /**
   * The listener could not physically have travelled from their last capture to this one
   * in the time elapsed.
   */
  | "implausible-movement"
  /** The position fix is too vague to place anyone inside a radius this small. */
  | "fix-too-vague";

/** An echo currently opening — in range, dwell timer running. Drives the progress ring. */
export interface Arriving {
  readonly echo: Echo;
  readonly distanceKm: number;
  /** 0–1. How much of the dwell requirement has elapsed. */
  readonly progress: number;
}

export interface CaptureEvent {
  readonly echo: Echo;
  readonly record: CaptureRecord;
  readonly rarity: Rarity;
}

/**
 * How hard this echo is to stand next to.
 *
 * Derived from the world rather than assigned for game balance, which is the whole point:
 * a rare echo here is rare because the place is genuinely hard to reach, or only open at
 * night, or requires you to find one precise doorway. Inventing tiers to pace a collection
 * would make the rarest echoes the least meaningful ones, and a collection of places you
 * stood is only worth having if the difficulty was real.
 */
export type Rarity = "common" | "uncommon" | "rare" | "singular";
