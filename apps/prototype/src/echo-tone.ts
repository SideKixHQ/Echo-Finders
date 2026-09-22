/**
 * Rendering `ToneCue` with Web Audio.
 *
 * The engine decides the shape — pitch, how many reflections, how tightly spaced — and this
 * is the part that only a browser can do. An iOS build writes the same forty lines against
 * AVAudioEngine and nothing above this file changes.
 *
 * The sound is an echo, literally: a note followed by quieter repeats of itself. Far from
 * the target the repeats are slow and there are more of them, which is what a large empty
 * space sounds like; close in they tighten, and at arrival there is no repeat at all,
 * because you are standing at the source.
 *
 * Kept deliberately soft and short. This plays underneath narration, and a guidance cue
 * that talks over the story has defeated the story.
 */

import type { ToneCue } from "@echofinders/core";

const NOTE_MS = 130;

export class EchoTone {
  private ctx: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private muted = false;
  /**
   * Notes already handed to the audio clock.
   *
   * A far-away cue schedules its reflections up to a couple of seconds ahead, and once
   * `start()` has been called the note is the hardware's business, not ours. Clearing the
   * interval stops the *next* figure and does nothing to the one in flight — so turning the
   * cue off left it chiming twice more, which reads as a bug however briefly it lasts.
   */
  private voices: OscillatorNode[] = [];

  /**
   * Browsers refuse to start audio until the user has interacted with the page, so the
   * context is created on the first play rather than up front — and a refusal is not worth
   * breaking anything over, since this is a secondary channel by design.
   */
  private context(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) this.stop();
  }

  play(cue: ToneCue) {
    this.stop();
    // Muted is not "play silently": without this the interval spun on regardless, firing
    // into a context that refuses to exist, for as long as the cue held.
    if (this.muted || cue.gain <= 0 || cue.hz <= 0) return;

    const fire = () => this.figure(cue);
    fire();
    if (Number.isFinite(cue.intervalMs) && cue.intervalMs > 0) {
      this.timer = setInterval(fire, cue.intervalMs + NOTE_MS + cue.repeats * cue.repeatGapMs);
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const osc of this.voices) {
      // A node that already ended throws on a second stop, and one bad cue must not take
      // the rest of the cleanup down with it.
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        /* already finished */
      }
    }
    this.voices = [];
  }

  /** Release the audio context. Browsers allow only a handful per page. */
  async dispose() {
    this.stop();
    const ctx = this.ctx;
    this.ctx = null;
    await ctx?.close().catch(() => undefined);
  }

  /** One note and its reflections. */
  private figure(cue: ToneCue) {
    const ctx = this.context();
    if (!ctx) return;

    for (let i = 0; i <= cue.repeats; i++) {
      const at = ctx.currentTime + (i * cue.repeatGapMs) / 1000;
      const level = cue.gain * Math.pow(cue.decay, i);
      if (level < 0.005) break;

      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      // A triangle is soft enough to sit under speech; a sine reads as a medical alarm and
      // a square reads as an error.
      osc.type = "triangle";
      osc.frequency.value = cue.hz;

      // Percussive: near-instant attack, exponential tail. A slow attack at this length
      // just sounds like a mistake.
      amp.gain.setValueAtTime(0.0001, at);
      amp.gain.exponentialRampToValueAtTime(level, at + 0.008);
      amp.gain.exponentialRampToValueAtTime(0.0001, at + NOTE_MS / 1000);

      osc.connect(amp).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + NOTE_MS / 1000 + 0.02);

      this.voices.push(osc);
      osc.onended = () => {
        this.voices = this.voices.filter((v) => v !== osc);
      };
    }
  }
}
