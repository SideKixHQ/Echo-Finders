/**
 * The iPhone app's narrator, the pure half (`apps/ios/src/playback.ts`): the audio session
 * it asks for, what the lock screen shows, the walk's queue, and how a call or Siri is told
 * from headphones coming out, so the echo resumes after the one and not the other.
 *
 * Run from the root suite, as `packs.test.ts` is: `playback.ts` imports nothing but the
 * engine.
 */
import { describe, expect, it } from "vitest";
import type { Echo, LatLng } from "@echofinders/core";
import {
  FULL_VOLUME,
  IDLE,
  LOCK_SCREEN_OPTIONS,
  SKIP_SECONDS,
  audioModeFor,
  hasFinished,
  nextIntent,
  nowPlayingFor,
  parseSound,
  playerChange,
  queued,
  walkQueue,
  type Intent,
  type PlayerReport,
} from "../../apps/ios/src/playback.js";

/** Bowling Green, New York. */
const here: LatLng = { lat: 40.7049, lng: -74.0137 };

function echo(id: string, overrides: Partial<Echo> = {}): Echo {
  return {
    id,
    title: `Echo ${id}`,
    category: "history",
    point: { at: here, triggerRadiusKm: 0.05, place: "Bowling Green" },
    durationS: 120,
    quality: 0.8,
    renders: [{ audioKey: `audio/${id}/voice.mp3`, voiceId: "voice", durationS: 120 }],
    ...overrides,
  } as unknown as Echo;
}

const playing: Intent = { want: "playing", interrupted: null };

function report(overrides: Partial<PlayerReport> = {}): PlayerReport {
  return { playing: true, timeControlStatus: "playing", didJustFinish: false, duration: 120, currentTime: 30, ...overrides };
}

describe("the audio session", () => {
  it("ducks other audio while the echo can be heard, in the background and through the silent switch", () => {
    expect(audioModeFor(true)).toEqual({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "duckOthers",
      allowsRecording: false,
      shouldRouteThroughEarpiece: false,
    });
  });

  it("mixes rather than ducks with Sound off, so music does not dip under a silent echo", () => {
    expect(audioModeFor(false).interruptionMode).toBe("mixWithOthers");
    expect(audioModeFor(false).shouldPlayInBackground).toBe(true);
  });
});

describe("the lock screen", () => {
  it("shows the echo's title, its place and the app's artwork", () => {
    expect(nowPlayingFor(echo("a"), "file:///icon.png")).toEqual({
      title: "Echo a",
      artist: "Bowling Green",
      albumTitle: "Echo Finders",
      artworkUrl: "file:///icon.png",
    });
  });

  it("leaves the artwork out until it has loaded, and names the app when there is no place", () => {
    const placeless = echo("b", { point: { at: here, triggerRadiusKm: 0.05 } } as Partial<Echo>);
    const shown = nowPlayingFor(placeless, null);
    expect(shown.artist).toBe("Echo Finders");
    expect("artworkUrl" in shown).toBe(false);
  });

  it("skips the same fifteen seconds as the echo card", () => {
    expect(SKIP_SECONDS).toBe(15);
    expect(LOCK_SCREEN_OPTIONS).toMatchObject({ showSeekBackward: true, showSeekForward: true, seekForwardIntervalSeconds: 15 });
  });
});

describe("the walk's queue", () => {
  it("plays the first echo and queues the next behind it, never cutting it off", () => {
    const queue = walkQueue();
    expect(queue.offer(queued(echo("a"), 0)!).started).toBe(true);
    expect(queue.offer(queued(echo("b"), 1)!).started).toBe(false);
    expect(queue.nowPlaying?.echo.id).toBe("a");
    // The echo ends with the phone locked: the waiting one is next.
    expect(queue.finished()?.echo.id).toBe("b");
    expect(queue.finished()).toBeNull();
  });

  it("keeps two waiting at most", () => {
    const queue = walkQueue();
    for (const id of ["a", "b", "c"]) queue.offer(queued(echo(id), 0)!);
    const { deferred } = queue.offer(queued(echo("d", { quality: 0.1 } as Partial<Echo>), 0)!);
    expect(deferred).toEqual({ echo: expect.objectContaining({ id: "d" }), reason: "queue-full" });
    expect(queue.waiting.map((q) => q.echo.id)).toEqual(["b", "c"]);
  });

  it("drops a waiting echo once you have walked far from it", () => {
    const queue = walkQueue();
    queue.offer(queued(echo("a"), 0)!);
    queue.offer(queued(echo("b"), 0)!);
    const far = { lat: here.lat + 1, lng: here.lng };
    expect(queue.moved(far).map((d) => d.echo.id)).toEqual(["b"]);
    expect(queue.nowPlaying?.echo.id).toBe("a");
  });

  it("only queues an echo with a recording", () => {
    expect(queued(echo("silent", { renders: [] } as Partial<Echo>), 0)).toBeNull();
  });
});

describe("telling a finish, a halt and a start apart", () => {
  it("calls the end of the file a finish, not a halt", () => {
    expect(playerChange(report(), report({ playing: false, timeControlStatus: "paused", didJustFinish: true }))).toBeNull();
    expect(hasFinished({ didJustFinish: false, duration: 120, currentTime: 119.8 })).toBe(true);
  });

  it("does not call a stall while buffering a halt", () => {
    expect(playerChange(report(), report({ playing: false, timeControlStatus: "waitingToPlayAtSpecifiedRate" }))).toBeNull();
  });

  it("calls a pause mid echo a halt, and playing again unasked a start", () => {
    expect(playerChange(report(), report({ playing: false, timeControlStatus: "paused" }))).toBe("halted");
    expect(playerChange(report({ playing: false, timeControlStatus: "paused" }), report())).toBe("started");
    expect(playerChange(report(), report({ currentTime: 31 }))).toBeNull();
  });
});

describe("interruptions", () => {
  it("resumes after a call or Siri, once iOS gives the volume back", () => {
    const call = nextIntent(playing, { type: "halted", volume: 0.5, app: "background" });
    expect(call).toEqual({ intent: { want: "playing", interrupted: "volume" }, resume: false });
    // Still on the call.
    expect(nextIntent(call.intent, { type: "check", volume: 0.5, app: "background" }).resume).toBe(false);
    // The call ends and iOS says resume: expo-audio restores the volume.
    expect(nextIntent(call.intent, { type: "check", volume: 1, app: "background" })).toEqual({ intent: playing, resume: true });
  });

  it("resumes after Siri on screen, when the app is active again", () => {
    const siri = nextIntent(playing, { type: "halted", volume: 1, app: "inactive" });
    expect(siri.intent.interrupted).toBe("inactive");
    expect(nextIntent(siri.intent, { type: "check", volume: 1, app: "inactive" }).resume).toBe(false);
    expect(nextIntent(siri.intent, { type: "check", volume: 1, app: "active" }).resume).toBe(true);
  });

  it("stays paused after a call that ended without leave to resume", () => {
    const call = nextIntent(playing, { type: "halted", volume: 0.5, app: "background" });
    // iOS never said resume, so the volume stays lowered; opening the app is not enough.
    expect(nextIntent(call.intent, { type: "check", volume: 0.5, app: "active" }).resume).toBe(false);
    // Pressing Play is.
    expect(nextIntent(call.intent, { type: "play" })).toEqual({ intent: playing, resume: false });
  });

  it("stays paused when headphones come out, on screen or locked", () => {
    for (const app of ["active", "background"] as const) {
      const pulled = nextIntent(playing, { type: "halted", volume: 1, app });
      expect(pulled.intent).toEqual({ want: "paused", interrupted: null });
      expect(nextIntent(pulled.intent, { type: "check", volume: 1, app: "active" }).resume).toBe(false);
    }
  });

  it("does not resume an echo the listener paused", () => {
    const paused = nextIntent(playing, { type: "pause" }).intent;
    const halted = nextIntent(paused, { type: "halted", volume: 0.5, app: "background" });
    expect(halted.intent).toEqual(paused);
    expect(nextIntent(halted.intent, { type: "check", volume: 1, app: "active" }).resume).toBe(false);
  });

  it("follows Play pressed on the lock screen", () => {
    const paused: Intent = { want: "paused", interrupted: null };
    expect(nextIntent(paused, { type: "started" })).toEqual({ intent: playing, resume: false });
  });

  it("forgets everything on stop", () => {
    expect(nextIntent({ want: "playing", interrupted: "volume" }, { type: "stop" }).intent).toBe(IDLE);
    expect(nextIntent(IDLE, { type: "pause" }).intent).toBe(IDLE);
    expect(FULL_VOLUME).toBeLessThan(1);
  });
});

describe("the Sound control, as saved", () => {
  it("is on unless it was saved off", () => {
    expect(parseSound({ soundOn: false })).toBe(false);
    expect(parseSound({ soundOn: true })).toBe(true);
    expect(parseSound(null)).toBe(true);
    expect(parseSound("nonsense")).toBe(true);
  });
});
