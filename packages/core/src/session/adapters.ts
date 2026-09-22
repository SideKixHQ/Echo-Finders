/**
 * The seam between the engine and a platform.
 *
 * Everything above this line is pure TypeScript that runs identically in Safari, in a
 * Panasonic seatback browser and inside React Native. Everything below it is the handful of
 * things only a device can do: report where it is, vibrate, play a sound, point a camera.
 *
 * Keeping that list short is the whole design. An iOS build's job is to implement these
 * few small interfaces — not to reimplement any decision about what to play, when to
 * capture, or how hard to buzz. Those live in the engine, are tested without a device, and
 * stay identical across platforms by construction rather than by discipline.
 */

import type { Position } from "../types.js";
import type { HapticCue } from "../proximity/haptics.js";
import type { ToneCue } from "../proximity/tone.js";
import type { Capability } from "../permissions/index.js";

/** Unsubscribe from a stream. */
export type Unsubscribe = () => void;

/**
 * A stream of position fixes.
 *
 * Implemented on iOS by CoreLocation, on the web by `navigator.geolocation.watchPosition`.
 * The engine never asks for a fix; it reacts to whatever arrives, at whatever rate, which
 * is the only assumption that survives a phone deciding to save battery.
 */
export interface LocationSource {
  watch(onFix: (position: Position) => void, onError?: (error: Error) => void): Unsubscribe;
}

/**
 * Something that can vibrate.
 *
 * Takes a `HapticCue` — an intention — rather than a duration or a waveform, because the
 * three platforms express this incompatibly: iOS Core Haptics has intensity and sharpness,
 * Android has amplitude, and the web has a list of millisecond durations and nothing else.
 * Translating an intention is straightforward; translating a waveform is lossy.
 *
 * Absent entirely on iOS Safari (ADR-0011), which is why this is optional everywhere.
 */
export interface HapticsSink {
  /** Begin or change the ongoing pattern. Called only when the cue actually changes. */
  play(cue: HapticCue): void;
  /** Stop vibrating. */
  stop(): void;
}

/**
 * Something that can make the proximity sound.
 *
 * Separate from `AudioSink` on purpose. That one plays narration — long, foreground, and
 * the thing the listener came for. This plays a short figure *underneath* it, on its own
 * bus, at its own level, and has to be duckable and mutable without touching the story.
 * Wiring them together would mean a listener who turns the guidance off loses the echo too.
 */
export interface TonesSink {
  /** Begin or change the ongoing figure. Called only when the cue actually changes. */
  play(cue: ToneCue): void;
  /** Stop. */
  stop(): void;
}

/** Playing an echo's audio. The engine decides what and when; the platform decides how. */
export interface AudioSink {
  play(audioKey: string, options?: { startAtS?: number }): void;
  pause(): void;
  /** A short sound marking a capture, distinct from narration. */
  chime(): void;
}

/** Querying and requesting the capabilities in `CAPABILITY_NEEDS`. */
export interface PermissionsAdapter {
  granted(): Promise<Set<Capability>>;
  request(capability: Capability): Promise<boolean>;
}
