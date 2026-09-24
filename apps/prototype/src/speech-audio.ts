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
  IMlxLW3qgn0MWgfz7Vnh: { pitch: 1.05, rate: 0.95, prefer: ["female", "samantha", "zira"] },
  // The male narrator.
  wC1005J19tvhoqqC2hkf: { pitch: 0.82, rate: 0.93, prefer: ["male", "daniel", "alex", "david"] },
  // The kids narrator.
  UrTldiIxfedDl9tlesyS: { pitch: 1.25, rate: 1.0, prefer: ["female", "karen", "moira"] },
};

export class SpeechAudio implements AudioSink {
  private readonly handlers = new Set<() => void>();
  private utterance: SpeechSynthesisUtterance | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private muted = false;
  /**
   * The listener's speed setting, as a multiplier on each narrator's own pace.
   *
   * Applied when an utterance is created, because that is the only moment the Web Speech
   * API allows: `rate` is read once at `speak()` and a running utterance cannot be
   * re-paced. So a change lands on the next echo rather than the current one — which is a
   * limitation of the stand-in, not of the design, and disappears with the real renders
   * where an `<audio>` element's `playbackRate` is live. Before this existed the control
   * changed a number on screen and nothing else at all.
   */
  private rate = 1;
  /**
   * Whether to speak the plain-language cut.
   *
   * The switch existed, the transcript followed it, the clock and the waveform were both
   * drawn from `simple.durationS` — and the narration read the full script regardless. So
   * "Simple audio on" was a claim about the one thing it did not change, and on a long
   * echo the bar finished a minute before the voice did.
   */
  private simple = false;
  private voiceOverride: string | null = null;

  /** Keyed once. `find` over the library ran on every play, for every echo. */
  private readonly byKey: ReadonlyMap<string, Echo>;

  constructor(library: readonly Echo[]) {
    this.byKey = new Map(library.map((echo) => [`speech/${echo.id}`, echo]));
  }

  get available(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) this.stop();
  }

  setRate(rate: number) {
    this.rate = rate;
  }

  /** Takes effect on the next echo, for the same reason `rate` does. */
  /**
   * A narrator the listener chose, overriding the one the echo was written for.
   *
   * Null means the echo's own, which is the default and the right default: an echo written
   * for the children's narrator should arrive in it. But a voice is the thing somebody
   * listens to for forty minutes, and not being able to change it is not a preference we
   * get to hold on their behalf.
   */
  setVoice(voiceId: string | null) {
    this.voiceOverride = voiceId;
  }

  setSimple(simple: boolean) {
    this.simple = simple;
  }

  /** The telling this listener has asked for, falling back where none is written. */
  private cut(echo: Echo): { script: string | undefined; durationS: number } {
    const plain = this.simple ? echo.simple : undefined;
    return {
      script: plain?.script ?? echo.script,
      durationS: plain?.durationS ?? echo.durationS,
    };
  }

  play(audioKey: string) {
    this.stop();
    const echo = this.byKey.get(audioKey);
    const cut = echo ? this.cut(echo) : null;

    // Muted, unsupported, or a browser with no voices installed — which is the normal case
    // in a headless one. Take the echo's stated duration rather than ending instantly: a
    // player that finishes the moment it starts drains the whole queue in a frame, and
    // every transition the queue exists to get right would go untested.
    if (!echo || this.muted || !this.available || !cut?.script || this.voiceCount === 0) {
      this.runSilently(cut?.durationS ?? 1);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cut.script);
    const cast =
      CAST[this.voiceOverride ?? echo.voice ?? ""] ?? { pitch: 1, rate: 0.95, prefer: [] };
    utterance.pitch = cast.pitch;
    // Clamped to what browsers actually honour; outside 0.1–10 they silently ignore it.
    utterance.rate = Math.max(0.5, Math.min(2.5, cast.rate * this.rate));

    const voice = this.pick(cast.prefer);
    if (voice) utterance.voice = voice;

    // `onend` fires for a natural finish *and* for a cancel, and the engine must only hear
    // the first: treating a deliberate stop as "the echo ended" advances the queue on top
    // of the advance the listener just asked for, so one tap on Next skips two echoes.
    //
    // This was guarded by a `stopping` flag set around `cancel()`, which does not work:
    // `speechSynthesis.cancel()` dispatches its end event *asynchronously*, so the flag was
    // always back to false by the time the handler ran and the guard never once fired.
    // Comparing the utterance instead has no timing in it at all — a handler whose
    // utterance is no longer the current one is by definition talking about a finish that
    // has already been superseded.
    const ended = () => {
      if (this.utterance !== utterance) return;
      this.fire();
    };
    utterance.onend = ended;
    utterance.onerror = ended;

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
    // Cleared *before* cancelling, so the end event that arrives some time later finds it
    // is no longer the current utterance and says nothing.
    this.utterance = null;
    window.speechSynthesis.cancel();
  }

  private get voiceCount(): number {
    return this.available ? window.speechSynthesis.getVoices().length : 0;
  }

  /**
   * Occupy the player for as long as the echo would have taken, then finish.
   *
   * Divided by the rate, like the spoken path — without it the silent path (a headless
   * browser, or any device with no voices installed) ran at 1× while the progress bar ran
   * at the listener's speed, so the bar reached the end and then sat there.
   */
  private runSilently(durationS: number) {
    this.timer = setTimeout(() => {
      this.timer = null;
      this.fire();
    }, Math.max(250, (durationS * 1000) / this.rate));
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
