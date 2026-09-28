import { describe, expect, it } from "vitest";
import { waveform } from "../src/index.js";

const SCRIPT =
  "Short one. This sentence is considerably longer than the one before it and carries a great deal more text with it. Tiny. And another middling sentence sits here to fill the shape out a little.";

describe("waveform", () => {
  it("returns exactly the number of samples asked for", () => {
    for (const n of [1, 7, 44, 120]) expect(waveform(SCRIPT, n)).toHaveLength(n);
  });

  it("never leaves the drawable range", () => {
    for (const v of waveform(SCRIPT, 200)) {
      expect(v).toBeGreaterThanOrEqual(0.18);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  /*
   * Stability is the point. The shape is about to be the scrubber, and a scrubber that
   * reshuffles between renders is a scrubber nobody can learn.
   */
  it("gives the same script the same shape every time", () => {
    expect(waveform(SCRIPT, 44)).toEqual(waveform(SCRIPT, 44));
  });

  it("gives different scripts different shapes", () => {
    expect(waveform(SCRIPT, 44)).not.toEqual(waveform("A different echo entirely.", 44));
  });

  it("is louder where the sentences are longer", () => {
    const shorts = waveform("A. B. C. D. E. F. G. H.", 64);
    const longs = waveform(
      Array.from({ length: 8 }, () => "This sentence is long enough to push the amplitude up.").join(" "),
      64,
    );
    const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(longs)).toBeGreaterThan(mean(shorts));
  });

  it("has something to draw even with no script at all", () => {
    expect(waveform("", 12)).toHaveLength(12);
    expect(waveform("   ", 12).every((v) => v > 0)).toBe(true);
  });

  /*
   * Neighbours must differ, or it reads as a bar chart rather than a waveform. Measured
   * rather than asserted by eye: at least a third of adjacent pairs differ appreciably.
   */
  it("varies between neighbours rather than drawing a comb", () => {
    const w = waveform(SCRIPT, 44);
    let jumps = 0;
    for (let i = 1; i < w.length; i++) if (Math.abs(w[i]! - w[i - 1]!) > 0.04) jumps++;
    expect(jumps).toBeGreaterThan(w.length / 3);
  });

  it("refuses to be asked for no samples", () => {
    expect(waveform(SCRIPT, 0)).toHaveLength(1);
    expect(waveform(SCRIPT, -5)).toHaveLength(1);
  });
});
