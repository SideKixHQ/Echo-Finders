/**
 * A waveform for an echo that has not been recorded yet.
 *
 * There is no audio for most of the library (`speech-audio.ts` makes the same bargain for
 * the voice), so a waveform drawn from amplitude data is not available. The alternative
 * was a decorative squiggle, which is worse than it sounds: the shape is about to become
 * the SCRUBBER, and a scrubber whose peaks have nothing to do with the recording teaches a
 * listener a picture of the audio that is a lie.
 *
 * So it is derived from the script. Loud where the sentences are long, quiet where they
 * are short, which is at least *about* this echo and is stable for it: the same script
 * always gives the same shape, so the picture does not shuffle between screens or between
 * frames. The one thing a listener actually reads off it — how far in they are and how
 * much is left — is true regardless, because that comes from the playhead.
 *
 * It is replaced by real amplitude the moment a render exists. Until then this is honest
 * about being a drawing of the text.
 */

/** Amplitudes from 0 to 1, one per sample, derived from the script's own shape. */
export function waveform(script: string, samples: number): readonly number[] {
  const n = Math.max(1, Math.floor(samples));
  const sentences = script.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  if (sentences.length === 0) return Array.from({ length: n }, () => 0.4);

  return Array.from({ length: n }, (_, i) => {
    const sentence = sentences[Math.floor((i / n) * sentences.length)] ?? "";
    /*
     * Two overlapping cycles, deliberately not harmonics of each other. One cycle makes a
     * regular comb that reads as a bar chart; two that share a period beat into a visible
     * repeat. These do not line up inside any realistic sample count.
     */
    const wobble = Math.sin(i * 1.7) * 0.14 + Math.sin(i * 0.6) * 0.09;
    const body = 0.34 + Math.min(0.52, sentence.length / 260);
    return clamp01(body + wobble);
  });
}

const clamp01 = (v: number) => (v < 0.18 ? 0.18 : v > 1 ? 1 : v);
