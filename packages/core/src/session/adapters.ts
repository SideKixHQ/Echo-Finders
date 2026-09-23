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
import type { CaptureRecord } from "../capture/types.js";
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

/**
 * Playing an echo's narration. The engine decides what and when; the platform decides how.
 *
 * `ended` is what makes a queue possible at all. Only the platform knows when a file has
 * actually run out — the engine has a duration in the content file, but trusting it would
 * mean the next echo starting a second early or a second late on every transition, and a
 * listener who pauses would desynchronise it permanently.
 */
export interface AudioSink {
  play(audioKey: string, options?: { startAtS?: number }): void;
  pause(): void;
  resume(): void;
  /** Stop and discard. Used when the listener skips, or the session ends. */
  stop(): void;
  /** A short sound marking a capture, distinct from narration. */
  chime(): void;
  /** Called when the current item runs out on its own. Never on pause or stop. */
  ended(handler: () => void): Unsubscribe;
}

/** Querying and requesting the capabilities in `CAPABILITY_NEEDS`. */
export interface PermissionsAdapter {
  granted(): Promise<Set<Capability>>;
  request(capability: Capability): Promise<boolean>;
}

/**
 * Where a collection is kept between sessions.
 *
 * The collection is the reason somebody keeps this app. "Here is everywhere your life has
 * passed through, and what happened there" is only true if it survives closing the tab —
 * and until now it did not: every record lived in memory and a refresh threw away the lot.
 *
 * Three decisions worth stating.
 *
 * **It saves everything, not the one that changed.** A collection is small — hundreds of
 * records of a hundred-odd bytes — and an append-only log would slowly diverge from what
 * the listener has agreed to store. Redaction can *remove* fields when someone turns a
 * setting off, and a delete has to actually delete. Writing the whole set keeps "what is
 * stored" exactly equal to "what is permitted", which is the property the privacy model
 * rests on (`redactRecord`).
 *
 * **What arrives here is already redacted.** The engine applies `PrivacySettings` before
 * calling `save`, so an implementation never has to know the rules and can never
 * accidentally persist a standing position the listener asked us not to keep. Storage that
 * never received it cannot leak it, cannot be subpoenaed, and cannot turn up in a backup.
 *
 * **Failure is not exceptional.** Private browsing, a full disk, a denied quota — all
 * normal. An implementation should resolve rather than throw where it sensibly can, and
 * the engine treats a rejected save as an error to report, never as a reason to lose the
 * capture: the echo was still found, and the listener still stood there.
 */
export interface CollectionStore {
  /** Everything kept previously. Empty when there is nothing, or storage is unavailable. */
  load(): Promise<readonly CaptureRecord[]>;
  /** Replace what is stored. Already redacted; write it as given. */
  save(records: readonly CaptureRecord[]): Promise<void>;
  /** Forget all of it. What the privacy screen's delete calls. */
  clear(): Promise<void>;
}
