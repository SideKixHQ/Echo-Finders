/**
 * An echo's script, split into lines with their share of the running time.
 *
 * Shared, because two screens need the same answer and were getting different ones. The
 * transcript has always split the script into sentences and placed each one on the
 * timeline; the player's *Line* buttons moved the playhead by a flat twelve percent. On a
 * three-sentence echo that is a third of a sentence and on a twenty-sentence one it is two
 * and a half, so the control named after a line was the one thing it never moved by.
 *
 * Proportional to character count, which is a decent proxy for speech: it gets the long
 * sentence right and the short one roughly right, and is wrong in a way nobody notices at
 * this length. It is not good enough to ship against real audio, which is why the render
 * pipeline asks ElevenLabs for `/with-timestamps` and measures the real thing. When those
 * land, this is replaced and both callers keep working, because both read lines and
 * offsets rather than the estimate.
 */

export interface Line {
  readonly index: number;
  readonly text: string;
  /** Fraction of the echo at which this line starts and ends. */
  readonly from: number;
  readonly to: number;
}

export function splitScript(script: string): readonly Line[] {
  const parts = script
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const total = parts.reduce((sum, p) => sum + p.length, 0) || 1;
  let cursor = 0;
  return parts.map((text, index) => {
    const from = cursor / total;
    cursor += text.length;
    return { index, text, from, to: cursor / total };
  });
}

/**
 * Where the playhead lands when somebody asks for the previous or next line.
 *
 * Back goes to the start of the line you are in, not the one before it — the same rule as
 * every music player's "previous track", and for the same reason: most of the time what
 * somebody wants is to hear that sentence again. Only when you are already at the top of a
 * line does it step back one.
 */
export function stepLine(lines: readonly Line[], progress: number, delta: -1 | 1): number {
  if (lines.length === 0) return Math.max(0, Math.min(1, progress + delta * 0.12));

  const at = lines.findIndex((l) => progress >= l.from && progress < l.to);
  const index = at === -1 ? (progress <= 0 ? 0 : lines.length - 1) : at;
  const line = lines[index]!;

  if (delta === 1) return lines[index + 1]?.from ?? 1;

  // A shade inside the line, or a "restart this one" lands exactly on the boundary and the
  // next press has nowhere to go.
  const NUDGE = 0.01;
  if (progress > line.from + NUDGE) return line.from;
  return lines[index - 1]?.from ?? 0;
}
