/**
 * Hot and cold, out loud.
 *
 * The haptic beside this works through a pocket, which is most of why it exists — but it
 * only reaches someone holding the phone, and on iOS Safari it does not exist at all
 * (ADR-0011). Headphones are the one channel this product can always count on, because
 * wearing them is the premise.
 *
 * The sound is a **sonar scan**, and the metaphor does real work rather than decorating.
 * A sonar ping tells you a distance by how long the return takes to come back: far away,
 * a long wait between the ping and its echo; close, they nearly collide; and on top of the
 * thing, there is no return at all, because there is no distance left for one to cross.
 *
 * That is exactly the quantity this cue has to convey, so the cue *is* the mechanism rather
 * than a sound chosen to represent it. Nobody has to learn what it means — anybody who has
 * heard a submarine in a film already knows that a quickening ping means something is
 * getting closer.
 *
 * It also fixes the failure of the first version, which was a note and four fading repeats.
 * That is an echo in a room, and a room does not have a *direction*: the repeats got
 * faster as you closed, but faster repeats read as urgency rather than as proximity, and
 * a listener had to be told what it meant. A returning ping needs no telling.
 *
 * That gives a listener the distance without a word being spoken, and it means the cue
 * never competes with narration for the same channel: it is a shape, not a voice.
 *
 * Like `HapticCue`, this is an intention rather than a waveform. Web Audio, AVAudioEngine
 * and Android's SoundPool have nothing in common at the sample level and everything in
 * common at this level.
 */

import type { CueKind, HapticCue } from "./haptics.js";

export interface ToneCue {
  readonly kind: CueKind;
  /** Pitch of the ping, Hz. Rises as the echo nears, so closing has a direction too. */
  readonly hz: number;
  /** Returns after the ping. Zero is a bare ping — there is no distance left to cross. */
  readonly repeats: number;
  /**
   * How long the return takes to come back, ms.
   *
   * **This is the distance.** Everything else in the cue is character; this one number is
   * the message, and it is the reason the sonar framing is not a costume: a gap that
   * shrinks from nearly a second to nothing is the same information a real sonar carries,
   * read the same way, by a listener who was never taught it.
   */
  readonly repeatGapMs: number;
  /** Fraction of the previous reflection's volume each one keeps. */
  readonly decay: number;
  /** Overall level, 0–1. Deliberately quiet: this plays under narration, never over it. */
  readonly gain: number;
  /** Gap before the whole figure repeats. `Infinity` means play it once. */
  readonly intervalMs: number;
}

export const NO_TONE: ToneCue = {
  kind: "none",
  hz: 0,
  repeats: 0,
  repeatGapMs: 0,
  decay: 0,
  gain: 0,
  intervalMs: Number.POSITIVE_INFINITY,
};

/**
 * Per-band shape.
 *
 * One return, never a train of them — a sonar contact is a ping and its echo, and stacking
 * four reflections turns a reading into a rhythm. The gap between the two carries the
 * distance, collapsing from most of a second to nothing.
 *
 * Pitch rises as well, but gently and inside a narrow band. Sonar lives around a kilohertz,
 * where the ear is sharp and a sine cuts through street noise without being loud; the first
 * version sat down at A3 and read as a doorbell. "Colder" drops below the start, which is
 * heard as wrong without being unpleasant: going the wrong way is a shrug, not a reprimand
 * (ADR-0011).
 */
const SHAPES: Record<CueKind, Omit<ToneCue, "kind" | "intervalMs">> = {
  none: { hz: 0, repeats: 0, repeatGapMs: 0, decay: 0, gain: 0 },
  colder: { hz: 700, repeats: 1, repeatGapMs: 900, decay: 0.32, gain: 0.1 },
  steady: { hz: 820, repeats: 1, repeatGapMs: 700, decay: 0.38, gain: 0.13 },
  warmer: { hz: 920, repeats: 1, repeatGapMs: 430, decay: 0.45, gain: 0.17 },
  close: { hz: 1050, repeats: 1, repeatGapMs: 170, decay: 0.55, gain: 0.2 },
  // No return: there is no distance left for one to cross.
  arrived: { hz: 1200, repeats: 0, repeatGapMs: 0, decay: 0, gain: 0.26 },
};

/**
 * The sound that goes with a haptic cue.
 *
 * Derived from the cue rather than from distance, so the two can never disagree about how
 * near something is — there is one proximity model and two ways of expressing it. The
 * figure repeats on the haptic's own rhythm for the same reason.
 */
export function toneFor(cue: HapticCue): ToneCue {
  if (cue.kind === "none" || cue.intensity <= 0) return NO_TONE;

  const shape = SHAPES[cue.kind];
  return {
    kind: cue.kind,
    ...shape,
    // Arrival is a moment, not a rhythm: it sounds once and stops.
    intervalMs: cue.kind === "arrived" ? Number.POSITIVE_INFINITY : cue.intervalMs,
  };
}

/** Total length of one figure, ms. What a renderer needs to schedule it. */
export function toneDurationMs(tone: ToneCue, noteMs = 120): number {
  return noteMs + tone.repeats * tone.repeatGapMs;
}
