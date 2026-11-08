/**
 * The narrator: a real rendered file where one exists, the browser's voice where not.
 *
 * `SpeechAudio` said this day would come: "when the real renders land this file is replaced
 * by twenty lines around an `<audio>` element". It is not replaced, because most of the
 * library still has no render and needs it. So this sits in front of it and decides, per
 * echo, which one speaks:
 *
 *   audio/<id>/<voice>.mp3   a render from `scripts/render-echo.mjs`, played from the file
 *   speech/<id>              the stand-in, spoken by `SpeechAudio`
 *
 * It falls back to the stand-in, rather than going quiet, when the file cannot play: the
 * listener asked for the simple telling and that has no render of its own, or the file is
 * missing or broken. A queue that waits for an `ended` that never comes is a walk that stops.
 *
 * It does not fall back when the browser merely refused to start the file without a tap
 * (Safari's autoplay rule, `NotAllowedError`). The recording is there and is what the
 * listener chose; swapping in the robot voice made James think his voices had been
 * replaced (2026-11-08). Instead it reports `blocked`, keeps the file loaded, and the
 * journey pauses so the player shows Play. The tap on Play is the gesture Safari wanted,
 * and `resume()` starts the real file from it.
 *
 * One `<audio>` element for the whole session, reused. iOS lets an element that has played
 * once from a tap play again later without one; a fresh element per echo would need a tap
 * every time, and a walk advances on its own.
 */

import type { AudioSink, Echo } from "@echofinders/core";
import { SpeechAudio } from "./speech-audio";

export class Narration implements AudioSink {
  private readonly speech: SpeechAudio;
  private readonly handlers = new Set<() => void>();
  private readonly blockedHandlers = new Set<() => void>();
  /** Which echo each rendered file belongs to, for the fallback and the simple cut. */
  private readonly byFile: ReadonlyMap<string, Echo>;
  private element: HTMLAudioElement | null = null;
  /** The file playing now. Null when the stand-in is speaking, or nothing is. */
  private currentFile: string | null = null;
  private simple = false;
  private muted = false;
  private rate = 1;

  constructor(library: readonly Echo[]) {
    this.speech = new SpeechAudio(library);
    this.speech.ended(() => this.fire());
    const byFile = new Map<string, Echo>();
    for (const echo of library) {
      for (const render of echo.renders ?? []) {
        if (isFile(render.audioKey)) byFile.set(render.audioKey, echo);
      }
    }
    this.byFile = byFile;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.speech.setMuted(muted);
    if (this.element) this.element.muted = muted;
  }

  setRate(rate: number) {
    this.rate = rate;
    this.speech.setRate(rate);
    // A file, unlike speech, can change pace mid-sentence, so this applies at once.
    if (this.element) this.element.playbackRate = rate;
  }

  /**
   * A narrator the listener chose. Only the stand-in can honour it: a render is one voice,
   * and re-voicing it means rendering again. So a rendered echo plays in the voice it was
   * rendered in, which is the voice it was cast to.
   */
  setVoice(voiceId: string | null) {
    this.speech.setVoice(voiceId);
  }

  setSimple(simple: boolean) {
    this.simple = simple;
    this.speech.setSimple(simple);
  }

  get busy(): boolean {
    return this.currentFile !== null || this.speech.busy;
  }

  play(audioKey: string, options?: { startAtS?: number }) {
    this.halt();
    const echo = this.byFile.get(audioKey);
    // The simple telling has no render yet, so a listener who asked for it hears it from
    // the stand-in rather than hearing the full version they asked not to.
    if (!echo || (this.simple && echo.simple?.script)) {
      this.speech.play(echo ? `speech/${echo.id}` : audioKey);
      return;
    }
    this.playFile(audioKey, echo, options?.startAtS ?? 0);
  }

  private playFile(audioKey: string, echo: Echo, startAtS: number) {
    const element = this.audio();
    this.currentFile = audioKey;
    const src = `/${audioKey}`;
    if (!element.src.endsWith(src)) element.src = src;
    element.muted = this.muted;
    element.playbackRate = this.rate;
    element.currentTime = Math.max(0, startAtS);

    const fallBack = () => {
      if (this.currentFile !== audioKey) return;
      this.currentFile = null;
      this.speech.play(`speech/${echo.id}`);
    };
    element.onerror = fallBack;
    element.play().catch((error: unknown) => {
      // A pause or stop before playback began rejects with AbortError. That is the
      // listener, not a failure, and must not start the stand-in talking over them.
      if (error instanceof DOMException && error.name === "AbortError") return;
      // Refused for want of a tap: wait for one, in the real voice.
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        if (this.currentFile === audioKey) for (const handler of this.blockedHandlers) handler();
        return;
      }
      fallBack();
    });
  }

  seek(fraction: number) {
    const element = this.element;
    if (this.currentFile && element) {
      const total = Number.isFinite(element.duration)
        ? element.duration
        : (this.byFile.get(this.currentFile)?.durationS ?? 0);
      element.currentTime = Math.max(0, Math.min(1, fraction)) * total;
      return;
    }
    this.speech.seek(fraction);
  }

  pause() {
    if (this.currentFile) this.element?.pause();
    else this.speech.pause();
  }

  resume() {
    if (this.currentFile) void this.element?.play().catch(() => undefined);
    else this.speech.resume();
  }

  stop() {
    this.halt();
    this.speech.stop();
  }

  chime() {
    this.speech.chime();
  }

  ended(handler: () => void) {
    this.handlers.add(handler);
    return () => void this.handlers.delete(handler);
  }

  /** The browser would not start a recording without a tap. The file stays ready to resume. */
  blocked(handler: () => void) {
    this.blockedHandlers.add(handler);
    return () => void this.blockedHandlers.delete(handler);
  }

  /** Stop the file without reporting an end: a stop is not a finish. */
  private halt() {
    if (this.currentFile && this.element) {
      this.element.onerror = null;
      this.element.pause();
    }
    this.currentFile = null;
    this.speech.stop();
  }

  private audio(): HTMLAudioElement {
    if (this.element) return this.element;
    const element = new Audio();
    element.preload = "auto";
    element.addEventListener("ended", () => {
      if (!this.currentFile) return;
      this.currentFile = null;
      this.fire();
    });
    this.element = element;
    return element;
  }

  private fire() {
    for (const handler of this.handlers) handler();
  }
}

function isFile(audioKey: string): boolean {
  return audioKey.startsWith("audio/");
}
