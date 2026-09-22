/**
 * Hot and cold, out loud.
 *
 * The haptic beside this works through a pocket, which is most of why it exists — but it
 * only reaches someone holding the phone, and on iOS Safari it does not exist at all
 * (ADR-0011). Headphones are the one channel this product can always count on, because
 * wearing them is the premise.
 *
 * The sound is literally an echo, and that is not only a pun. An echo is the sound of a
 * space: far from a wall the returns are slow, spread out and faint; close to it they
 * arrive almost on top of the original. So the cue renders distance as the *shape of the
 * reflection* — a long way off, one note and four slow fading returns; nearly there, the
 * returns tighten until they collapse into the note itself. At the moment of arrival there
 * is no reflection at all, because you are standing at the thing making the sound.
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
  /** Base pitch, Hz. Rises as the echo nears, so closing has a direction you can hear. */
  readonly hz: number;
  /** Reflections after the first note. Zero means a bare note — you have arrived. */
  readonly repeats: number;
  /** Gap between reflections, ms. Tightens as you close. */
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
 * Pitches are a rising minor arpeggio rather than arbitrary frequencies — A3, C4, E4, A4 —
 * so the sequence resolves upward as you approach and a listener hears progress as melody
 * rather than as a siren. "Colder" drops below the start, which reads as wrong without
 * having to be unpleasant: going the wrong way is a shrug, not a reprimand (ADR-0011).
 */
const SHAPES: Record<CueKind, Omit<ToneCue, "kind" | "intervalMs">> = {
  none: { hz: 0, repeats: 0, repeatGapMs: 0, decay: 0, gain: 0 },
  colder: { hz: 174.61, repeats: 3, repeatGapMs: 260, decay: 0.5, gain: 0.12 },
  steady: { hz: 220.0, repeats: 3, repeatGapMs: 220, decay: 0.55, gain: 0.16 },
  warmer: { hz: 261.63, repeats: 3, repeatGapMs: 150, decay: 0.6, gain: 0.2 },
  close: { hz: 329.63, repeats: 2, repeatGapMs: 90, decay: 0.65, gain: 0.24 },
  // No reflection: you are at the source.
  arrived: { hz: 440.0, repeats: 0, repeatGapMs: 0, decay: 0, gain: 0.3 },
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
