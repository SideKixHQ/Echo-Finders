/**
 * Rendering `ToneCue` with Web Audio, as a sonar contact.
 *
 * The engine decides the shape — the pitch, how long the return takes to come back, how
 * often to scan — and this is the part only a browser can do. An iOS build writes the same
 * forty lines against AVAudioEngine and nothing above this file changes.
 *
 * What it makes is a ping and its echo. A short sine, struck hard and left to ring down
 * over most of a second while its pitch sags — that sag is most of what makes a sine read
 * as *sonar* rather than as a notification, because a struck physical thing loses tension
 * as it decays and a synthesised beep does not. Then the return: the same ping, quieter,
 * arriving after a gap that *is* the distance.
 *
 * Bandpassed, because an unfiltered sine is a hearing test. A moderate Q around the ping's
 * own pitch is what puts it underwater — the harmonics a real transducer would lose on the
 * way out and back.
 *
 * Kept deliberately quiet and sparse. This plays underneath narration, and a guidance cue
 * that talks over the story has defeated the story.
 */

import type { ToneCue } from "@echofinders/core";

/** How long one ping rings down for. Long: the tail is the character. */
const TAIL_S = 0.85;
/** How far the pitch sags across that tail. A struck thing loses tension; a beep does not. */
const SAG = 0.86;

export class EchoTone {
  private ctx: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private muted = false;
  /**
   * Notes already handed to the audio clock.
   *
   * A return is scheduled up to a second ahead, and once `start()` has been called the
   * sound is the hardware's business rather than ours. Clearing the interval stops the
   * *next* scan and does nothing to the one in flight — so turning the cue off used to
   * leave it pinging, which reads as a bug however briefly it lasts.
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

  /**
   * Muted for the sonar switch, and while an echo is playing (James, 2026-11-09: "when im
   * listening to a story i keep hearing other beeps and echos from other stories. it is
   * distracting"). Unmuting picks the last contact back up, because the engine only sends a
   * new cue when the distance changes, and a listener standing still after a story would
   * otherwise hear nothing until they moved.
   */
  setMuted(muted: boolean) {
    const was = this.muted;
    this.muted = muted;
    if (muted) this.stop();
    else if (was && this.last) this.play(this.last);
  }

  /** The contact the engine last asked for, kept so unmuting can resume it. */
  private last: ToneCue | null = null;

  play(cue: ToneCue) {
    this.last = cue;
    this.stop();
    // Muted is not "play silently": without this the interval spun on regardless, firing
    // into a context that refuses to exist, for as long as the cue held.
    if (this.muted || cue.gain <= 0 || cue.hz <= 0) return;

    const scan = () => this.ping(cue);
    scan();
    if (Number.isFinite(cue.intervalMs) && cue.intervalMs > 0) {
      // The scan rate has to clear the whole contact — ping, gap, return, tail — or the
      // next one starts on top of the last and the gap stops being readable, which is the
      // one thing this cue is for.
      const contactMs = cue.repeats * cue.repeatGapMs + TAIL_S * 1000;
      this.timer = setInterval(scan, Math.max(cue.intervalMs, 0) + contactMs);
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    // A buzz pattern already handed to the phone would otherwise run out over a story.
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      try {
        navigator.vibrate(0);
      } catch {
        /* nothing to cancel */
      }
    }
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

  /**
   * The same contact as a buzz, in time with the ping (James, 2026-11-09: "the phone should
   * vibrate more and more as you get closer in time with the ping sound").
   *
   * One pulse for the ping and one for each return, at the returns' own spacing, so the
   * gap you feel is the gap you hear: the distance. Pulses lengthen as the gap closes, so
   * nearer is stronger as well as quicker. Android only: mobile Safari has no vibration
   * API (ADR-0011), and on an iPhone this waits for the App Store build's haptics.
   */
  private buzz(cue: ToneCue) {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    const near = 1 - Math.min(1, Math.max(0, cue.repeatGapMs) / 900);
    const pattern: number[] = [];
    for (let i = 0; i <= cue.repeats; i++) {
      if (cue.gain * Math.pow(cue.decay, i) < 0.004) break;
      const pulse = Math.round(i === 0 ? 30 + 90 * near : 18 + 40 * near);
      if (i > 0) pattern.push(Math.max(20, cue.repeatGapMs - pattern[pattern.length - 1]!));
      pattern.push(pulse);
    }
    try {
      navigator.vibrate(pattern);
    } catch {
      /* a browser that refuses (no user gesture yet) is not an error worth surfacing */
    }
  }

  /** One contact: the ping, then whatever comes back. */
  private ping(cue: ToneCue) {
    const ctx = this.context();
    if (!ctx) return;
    this.buzz(cue);

    for (let i = 0; i <= cue.repeats; i++) {
      const at = ctx.currentTime + (i * cue.repeatGapMs) / 1000;
      const level = cue.gain * Math.pow(cue.decay, i);
      if (level < 0.004) break;

      // A return has travelled twice as far, so it comes back duller as well as quieter —
      // the high end goes first. That is why a distant contact sounds distant rather than
      // merely soft.
      const tail = TAIL_S * (i === 0 ? 1 : 0.7);
      const hz = cue.hz * (i === 0 ? 1 : 0.97);

      const osc = ctx.createOscillator();
      const band = ctx.createBiquadFilter();
      const amp = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(hz, at);
      // The sag. Exponential rather than linear because pitch is heard logarithmically, so
      // a linear fall sounds like it slows down at the end.
      osc.frequency.exponentialRampToValueAtTime(hz * SAG, at + tail);

      band.type = "bandpass";
      band.frequency.value = hz;
      band.Q.value = i === 0 ? 3.2 : 5.5;

      // Struck, not faded in: a sonar ping has no attack to speak of, and anything slower
      // than a few milliseconds stops sounding like something hitting water.
      amp.gain.setValueAtTime(0.0001, at);
      amp.gain.exponentialRampToValueAtTime(level, at + 0.004);
      amp.gain.exponentialRampToValueAtTime(0.0001, at + tail);

      osc.connect(band).connect(amp).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + tail + 0.05);

      this.voices.push(osc);
      osc.onended = () => {
        this.voices = this.voices.filter((v) => v !== osc);
      };
    }
  }
}
