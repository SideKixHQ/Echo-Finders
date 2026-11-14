/**
 * How the narrator plays alongside the rest of the phone: the pure half of `player.tsx`.
 *
 * Nothing here touches expo-audio; it decides, and `player.tsx` does. Kept apart so the
 * root suite can test it (`test/ios/playback.test.ts`): the app sits outside the npm
 * workspace and this file imports nothing but the engine.
 *
 * OTHER AUDIO (James, 2026-11-11). Music lowers under an echo and comes back up; podcasts
 * and audiobooks pause and resume after it; Maps still speaks its turns. iOS has one
 * session option for exactly that, `interruptSpokenAudioAndMixWithOthers` with
 * `duckOthers`. expo-audio (SDK 58) cannot ask for it: its `interruptionMode` offers
 * `doNotMix`, `doNotMixPersistent`, `duckOthers` and `mixWithOthers`, and maps `duckOthers`
 * to the `playback` category with the `duckOthers` option alone. So the narrator ducks:
 * music lowers and comes back (as approved), Maps speaks over it (as approved), and a
 * podcast lowers too rather than pausing (the gap). Closing it needs a native module or a
 * change to expo-audio.
 *
 * Ducking makes the session mixable, and a mixable session is allowed to start from the
 * background, which is what lets a queued echo begin with the phone locked. The price is
 * that iOS only gives the lock screen's Now Playing to an app whose session does not mix,
 * so the lock screen controls may not show while the narrator ducks. `player.tsx` asks
 * for them anyway; only a phone can say what iOS does with the request.
 */
import { PlaybackQueue, type AudioRender, type Echo, type QueuedEcho } from "@echofinders/core";

/** expo-audio's `InterruptionMode`, spelled out so this file needs no native import. */
export type SessionMix = "mixWithOthers" | "doNotMix" | "doNotMixPersistent" | "duckOthers";

/** The fields of expo-audio's `AudioMode` the narrator sets. */
export interface NarrationAudioMode {
  readonly playsInSilentMode: boolean;
  readonly shouldPlayInBackground: boolean;
  readonly interruptionMode: SessionMix;
  readonly allowsRecording: boolean;
  readonly shouldRouteThroughEarpiece: boolean;
}

/**
 * The audio session for narration.
 *
 * Through the silent switch, as a podcast app plays: an echo is something you asked to
 * hear. In the background, so it carries on with the screen locked. Ducking other audio
 * while the Sound control is on; with Sound off the echo runs on in silence, and lowering
 * someone's music under a silent echo would be a bug, so it simply mixes.
 */
export function audioModeFor(soundOn: boolean, onDrive = false): NarrationAudioMode {
  return {
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    // On a drive the music pauses during an echo, so the car's screen and the steering
    // wheel's buttons control the echo (James, 2026-11-13, decision 5); walks keep ducking.
    interruptionMode: !soundOn ? "mixWithOthers" : onDrive ? "doNotMix" : "duckOthers",
    allowsRecording: false,
    shouldRouteThroughEarpiece: false,
  };
}

// --- The lock screen ----------------------------------------------------------------------

/** How far the lock screen's skip buttons jump, the same as the echo card's. */
export const SKIP_SECONDS = 15;

/** expo-audio's `AudioMetadata`. */
export interface NowPlaying {
  readonly title: string;
  readonly artist: string;
  readonly albumTitle: string;
  readonly artworkUrl?: string;
}

/** The echo's title, its place, and the app's own artwork. */
export function nowPlayingFor(echo: Echo, artworkUrl: string | null): NowPlaying {
  return {
    title: echo.title,
    artist: echo.point.place ?? "Echo Finders",
    albumTitle: "Echo Finders",
    ...(artworkUrl ? { artworkUrl } : {}),
  };
}

/** expo-audio's `AudioLockScreenOptions`: play and pause, and skip back and on. */
export const LOCK_SCREEN_OPTIONS = {
  showSeekBackward: true,
  showSeekForward: true,
  seekBackwardIntervalSeconds: SKIP_SECONDS,
  seekForwardIntervalSeconds: SKIP_SECONDS,
} as const;

// --- What plays, and what waits -----------------------------------------------------------

/**
 * The web app's queue (the engine's `PlaybackQueue`), for the phone: one echo at a time,
 * never cut off, two waiting at most, and a waiting echo dropped once you have walked too
 * far from it. On foot, because that is the phone's walk.
 */
export function walkQueue(): PlaybackQueue {
  return new PlaybackQueue("walking");
}

/** An echo as the queue holds it, or null when it has no recording to play. */
export function queued(echo: Echo, nowMs: number): QueuedEcho | null {
  const render: AudioRender | undefined = echo.renders?.find((r) => r.audioKey.startsWith("audio/"));
  return render ? { echo, render, atMs: nowMs } : null;
}

/**
 * Has the echo loaded now run out? `didJustFinish` is the player's word for it; the end of
 * the file is the fallback, because a status update can miss the one tick that says so.
 */
export function hasFinished(status: { didJustFinish: boolean; duration: number; currentTime: number }): boolean {
  return status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.5);
}

// --- Interruptions ------------------------------------------------------------------------

/**
 * What the listener wants, which is not always what the player is doing. A phone call
 * stops the player; the listener still wants the echo, and gets it back after.
 */
export interface Intent {
  /** Playing, paused by the listener, or nothing loaded. */
  readonly want: "playing" | "paused" | "idle";
  /**
   * The player was stopped by the phone, and how that showed: expo-audio lowered its
   * volume (`volume`), or the app was taken out of active on screen (`inactive`).
   */
  readonly interrupted: "volume" | "inactive" | null;
}

export const IDLE: Intent = { want: "idle", interrupted: null };

/** React Native's `AppStateStatus`, the three that matter here. */
export type AppPhase = "active" | "inactive" | "background";

/** The player's own report, as `useAudioPlayerStatus` gives it. */
export interface PlayerReport {
  readonly playing: boolean;
  /** "playing", "paused", or "waitingToPlayAtSpecifiedRate" while it buffers. */
  readonly timeControlStatus: string;
  readonly didJustFinish: boolean;
  readonly duration: number;
  readonly currentTime: number;
}

export type IntentEvent =
  /** The listener pressed Play, or an echo was started for them. */
  | { readonly type: "play" }
  /** The listener pressed Pause in the app. */
  | { readonly type: "pause" }
  /** Nothing is loaded any more. */
  | { readonly type: "stop" }
  /** The player stopped by itself, mid echo, seen with this volume and app phase. */
  | { readonly type: "halted"; readonly volume: number; readonly app: AppPhase }
  /** The player started by itself: Play on the lock screen or on headphones. */
  | { readonly type: "started" }
  /** A look at whether an interruption is over: the volume now, and the app's phase. */
  | { readonly type: "check"; readonly volume: number; readonly app: AppPhase };

/** Below this the player's volume has been lowered by expo-audio for an interruption. */
export const FULL_VOLUME = 0.99;

/**
 * What an event does to the listener's intent, and whether to start the player again.
 *
 * How a call is told from a headphone pull: expo-audio pauses the player for both, and
 * while the session ducks it plays again after neither (after a call it restores the
 * volume, and only presses play in a mode that does not mix). It leaves one fingerprint.
 * When a call or Siri begins it halves the volume of every player that was playing, and
 * puts it back when iOS says the app may resume. Pulling out headphones leaves the volume
 * alone. And on screen, a call or Siri takes the app to inactive, which a pull does not.
 *
 * So a stop with the volume lowered is an interruption, over when the volume is back. A
 * stop while the app is inactive is one too, over when the app is active again at full
 * volume. Any other stop is the listener's (headphones out, Pause on the lock screen or
 * on the headphones) and stays stopped, as iOS asks of an app when headphones come out.
 * In the background a stop with no fingerprint stays stopped: better an echo that waits
 * for Play than one that starts from the speaker in a pocket.
 */
export function nextIntent(intent: Intent, event: IntentEvent): { intent: Intent; resume: boolean } {
  switch (event.type) {
    case "play":
    case "started":
      return { intent: { want: "playing", interrupted: null }, resume: false };
    case "pause":
      return { intent: intent.want === "idle" ? IDLE : { want: "paused", interrupted: null }, resume: false };
    case "stop":
      return { intent: IDLE, resume: false };
    case "halted": {
      if (intent.want !== "playing") return { intent, resume: false };
      if (event.volume < FULL_VOLUME) return { intent: { want: "playing", interrupted: "volume" }, resume: false };
      if (event.app === "inactive") return { intent: { want: "playing", interrupted: "inactive" }, resume: false };
      return { intent: { want: "paused", interrupted: null }, resume: false };
    }
    case "check": {
      if (intent.want !== "playing" || !intent.interrupted) return { intent, resume: false };
      const volumeBack = event.volume >= FULL_VOLUME;
      const over = intent.interrupted === "volume" ? volumeBack : volumeBack && event.app === "active";
      return over ? { intent: { want: "playing", interrupted: null }, resume: true } : { intent, resume: false };
    }
  }
}

/**
 * Read one status update against the last: did the player stop or start without being
 * asked? A stop at the end of the file is a finish, not a halt, and a stall while it
 * buffers is neither.
 */
export function playerChange(before: PlayerReport, now: PlayerReport): "halted" | "started" | null {
  if (before.playing && !now.playing) {
    if (hasFinished(now)) return null;
    if (now.timeControlStatus !== "paused") return null;
    return "halted";
  }
  if (!before.playing && now.playing) return "started";
  return null;
}

// --- The Sound control --------------------------------------------------------------------

/** The Sound control as saved: on unless it was saved off. A file that will not read is on. */
export function parseSound(raw: unknown): boolean {
  if (raw && typeof raw === "object" && "soundOn" in raw) return (raw as { soundOn: unknown }).soundOn !== false;
  return true;
}
