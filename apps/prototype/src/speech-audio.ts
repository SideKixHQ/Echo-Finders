/**
 * An `AudioSink` backed by the browser reading the script out loud.
 *
 * A stand-in, and an unusually useful one. Nothing has been through ElevenLabs yet, so the
 * alternative was leaving the entire audio path — the queue, the transitions, the
 * hands-free case — untestable until the first real file existed. This makes the product
 * audible today, with no API key, no network and no cost.
 *
 * It is also the only way to judge the writing. An echo is heard, never read, and prose
 * that looks fine on a page can be unspeakable: sentences that need a second pass, numbers
 * that are painful aloud, a clause that lands wrong without a comma nobody can hear. The
 * words here are the real words, so that is all testable now rather than after a hundred
 * renders have been paid for.
 *
 * What it is *not* is a preview of the product's voice. Browser TTS is flat and its timing
 * is not ElevenLabs' timing, so every duration it produces is wrong. When the real renders
 * land this file is replaced by twenty lines around an `<audio>` element and nothing above
 * it changes, which is the point of the adapter.
 */

import type { AudioSink, Echo } from "@echofinders/core";

/**
 * Per-narrator delivery.
 *
 * Browser voices vary wildly by platform and cannot be relied on by name, so the cast is
 * expressed as pitch and rate first and a name preference second. It will not sound like
 * the real narrators — the point is only that the alternation is *audible*, so the casting
 * decision can be judged rather than taken on trust.
 */
const CAST: Record<string, { pitch: number; rate: number; prefer: string[] }> = {
  // The default narrator.
  plP9aw1rizYgjFfuvLQ7: { pitch: 1.05, rate: 0.95, prefer: ["female", "samantha", "zira"] },
  // The male narrator.
  hP72SDESIJq2YuAblBqz: { pitch: 0.82, rate: 0.93, prefer: ["male", "daniel", "alex", "david"] },
  // The kids narrator.
  MkTSSXNgnBULS6ek4pon: { pitch: 1.25, rate: 1.0, prefer: ["female", "karen", "moira"] },
};

export class SpeechAudio implements AudioSink {
  private readonly handlers = new Set<() => void>();
  private utterance: SpeechSynthesisUtterance | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private muted = false;
  /** Set while we cancel deliberately, so our own stop does not read as "finished". */
  private stopping = false;

  constructor(private readonly library: readonly Echo[]) {}

  get available(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) this.stop();
  }

  play(audioKey: string) {
    this.stop();
    const echo = this.library.find((e) => `speech/${e.id}` === audioKey);

    // Muted, unsupported, or a browser with no voices installed — which is the normal case
    // in a headless one. Take the echo's stated duration rather than ending instantly: a
    // player that finishes the moment it starts drains the whole queue in a frame, and
    // every transition the queue exists to get right would go untested.
    if (this.muted || !this.available || !echo?.script || this.voiceCount === 0) {
      this.runSilently(echo?.durationS ?? 1);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(echo.script);
    const cast = CAST[echo.voice ?? ""] ?? { pitch: 1, rate: 0.95, prefer: [] };
    utterance.pitch = cast.pitch;
    utterance.rate = cast.rate;

    const voice = this.pick(cast.prefer);
    if (voice) utterance.voice = voice;

    // `onend` fires for a natural finish *and* for a cancel, and the engine must only hear
    // the first: treating a deliberate stop as "the echo ended" would advance the queue
    // every time the listener skipped, playing two things for one tap.
    utterance.onend = () => {
      if (!this.stopping) this.fire();
    };
    utterance.onerror = () => {
      if (!this.stopping) this.fire();
    };

    this.utterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  pause() {
    if (this.available) window.speechSynthesis.pause();
  }

  resume() {
    if (this.available) window.speechSynthesis.resume();
  }

  /** Is anything occupying the player right now? Drives the demo's hold-while-narrating. */
  get busy(): boolean {
    return this.utterance !== null || this.timer !== null;
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.available || !this.utterance) return;
    this.stopping = true;
    window.speechSynthesis.cancel();
    this.utterance = null;
    this.stopping = false;
  }

  private get voiceCount(): number {
    return this.available ? window.speechSynthesis.getVoices().length : 0;
  }

  /** Occupy the player for as long as the echo would have taken, then finish. */
  private runSilently(durationS: number) {
    this.timer = setTimeout(() => {
      this.timer = null;
      this.fire();
    }, Math.max(250, durationS * 1000));
  }

  /** A capture landed. Deliberately not speech — a different channel, so it never masks a word. */
  chime() {
    // The proximity tone already owns the "you are here" moment; a second sound on top of
    // it would be noise. Left to the EchoTone renderer's `arrived` cue.
  }

  ended(handler: () => void) {
    this.handlers.add(handler);
    return () => void this.handlers.delete(handler);
  }

  private fire() {
    this.utterance = null;
    for (const handler of this.handlers) handler();
  }

  private pick(prefer: readonly string[]): SpeechSynthesisVoice | null {
    if (!this.available) return null;
    const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
    if (voices.length === 0) return null;
    for (const want of prefer) {
      const hit = voices.find((v) => v.name.toLowerCase().includes(want));
      if (hit) return hit;
    }
    return voices[0] ?? null;
  }
}
