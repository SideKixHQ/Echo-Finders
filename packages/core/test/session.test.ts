import { describe, expect, it, vi } from "vitest";
import { WalkSession } from "../src/session/walk.js";
import { PlaybackQueue } from "../src/session/playback.js";
import { PRIVACY_DEFAULTS } from "../src/privacy/settings.js";
import type { CaptureRecord } from "../src/capture/types.js";
import type {
  AudioSink,
  HapticsSink,
  LocationSource,
  TonesSink,
} from "../src/session/adapters.js";
import type { LatLng, Position, TravelMode } from "../src/types.js";
import { toneFor, type ToneCue } from "../src/proximity/tone.js";
import type { Guidance, HapticCue } from "../src/proximity/haptics.js";
import type { WalkEvent, WalkSessionOptions } from "../src/session/walk.js";
import { ADULT, CHILD, makeEcho } from "./fixtures.js";
import type { EchoDraft } from "./fixtures.js";

const HERE: LatLng = { lat: 40.7069, lng: -74.0113 };
const START = Date.parse("2026-06-15T17:00:00Z");

const north = (from: LatLng, metres: number): LatLng => ({
  lat: from.lat + metres / 111_195,
  lng: from.lng,
});

const fix = (at: LatLng, tMs: number, accuracyM = 5): Position => ({
  at,
  accuracyM,
  timestamp: tMs,
  source: "device-gnss",
});

/** A location source the test drives by hand. */
class FakeLocation implements LocationSource {
  private onFix: ((p: Position) => void) | null = null;
  private onError: ((e: Error) => void) | null = null;
  stopped = false;

  watch(onFix: (p: Position) => void, onError?: (e: Error) => void) {
    this.onFix = onFix;
    this.onError = onError ?? null;
    return () => {
      this.stopped = true;
      this.onFix = null;
    };
  }
  emit(position: Position) {
    this.onFix?.(position);
  }
  fail(error: Error) {
    this.onError?.(error);
  }
  get watching() {
    return this.onFix !== null;
  }
}

const fakeHaptics = (): HapticsSink & { plays: unknown[]; stops: number } => {
  const plays: unknown[] = [];
  let stops = 0;
  return {
    plays,
    get stops() {
      return stops;
    },
    play: (cue) => void plays.push(cue),
    stop: () => void stops++,
  };
};

/**
 * A player the test drives by hand.
 *
 * `finish()` stands in for a file running out, which is the only way the queue ever
 * advances — the engine deliberately does not trust the duration in the content file.
 */
const fakeAudio = (): AudioSink & {
  played: string[];
  chimes: number;
  stops: number;
  finish: () => void;
} => {
  const played: string[] = [];
  const handlers = new Set<() => void>();
  let chimes = 0;
  let stops = 0;
  return {
    played,
    get chimes() {
      return chimes;
    },
    get stops() {
      return stops;
    },
    finish: () => handlers.forEach((h) => h()),
    play: (key) => void played.push(key),
    pause: () => {},
    resume: () => {},
    stop: () => void stops++,
    chime: () => void chimes++,
    ended: (handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
};

const echo = (overrides: Partial<EchoDraft> = {}) =>
  makeEcho({ id: "target", at: HERE, triggerRadiusKm: 0.05, ...overrides });

function collect(session: WalkSession) {
  const events: WalkEvent[] = [];
  session.subscribe((e) => events.push(e));
  return events;
}

describe("WalkSession lifecycle", () => {
  it("watches location only once started", () => {
    const location = new FakeLocation();
    const session = new WalkSession([echo()], ADULT, { location });
    expect(location.watching).toBe(false);
    session.start();
    expect(location.watching).toBe(true);
  });

  it("is idempotent about starting", () => {
    const location = new FakeLocation();
    const watch = vi.spyOn(location, "watch");
    const session = new WalkSession([echo()], ADULT, { location });
    session.start();
    session.start();
    expect(watch).toHaveBeenCalledTimes(1);
  });

  it("stops watching and falls silent", () => {
    const location = new FakeLocation();
    const haptics = fakeHaptics();
    const session = new WalkSession([echo()], ADULT, { location, haptics });
    session.start();
    location.emit(fix(north(HERE, 150), START));
    session.stop();
    expect(location.stopped).toBe(true);
    expect(haptics.stops).toBeGreaterThan(0);
  });

  it("passes location failures through rather than swallowing them", () => {
    const location = new FakeLocation();
    const session = new WalkSession([echo()], ADULT, { location });
    const events = collect(session);
    session.start();
    location.fail(new Error("location unavailable"));

    const error = events.find((e) => e.type === "error");
    expect(error).toBeDefined();
  });

  it("lets a subscriber unsubscribe", () => {
    const location = new FakeLocation();
    const session = new WalkSession([echo()], ADULT, { location });
    const events: WalkEvent[] = [];
    const off = session.subscribe((e) => events.push(e));
    session.start();
    location.emit(fix(north(HERE, 500), START));
    const seen = events.length;
    off();
    location.emit(fix(north(HERE, 400), START + 5000));
    expect(events.length).toBe(seen);
  });
});

describe("what a walk reports", () => {
  const setup = () => {
    const location = new FakeLocation();
    const haptics = fakeHaptics();
    const audio = fakeAudio();
    const session = new WalkSession([echo()], ADULT, { location, haptics, audio });
    const events = collect(session);
    session.start();
    return { location, haptics, audio, session, events };
  };

  it("reports position, nearby echoes and guidance on every fix", () => {
    const { location, events } = setup();
    location.emit(fix(north(HERE, 150), START));

    expect(events.some((e) => e.type === "position")).toBe(true);
    expect(events.some((e) => e.type === "nearby")).toBe(true);
    expect(events.some((e) => e.type === "guidance")).toBe(true);
  });

  it("captures on arrival and announces it", () => {
    const { location, audio, events } = setup();
    for (let s = 0; s <= 15; s += 3) location.emit(fix(HERE, START + s * 1000));

    const captured = events.filter((e) => e.type === "captured");
    expect(captured).toHaveLength(1);
    expect(audio.chimes).toBe(1);
  });

  it("stays silent about audio unless asked to play hands-free", () => {
    // Starting narration unbidden is right only when someone has asked for it.
    const { location, audio } = setup();
    for (let s = 0; s <= 15; s += 3) location.emit(fix(HERE, START + s * 1000));
    expect(audio.played).toEqual([]);
  });

  it("plays automatically when hands-free is on", () => {
    const location = new FakeLocation();
    const audio = fakeAudio();
    const session = new WalkSession([echo()], ADULT, { location, audio }, { autoPlay: true });
    session.start();
    for (let s = 0; s <= 15; s += 3) location.emit(fix(HERE, START + s * 1000));
    expect(audio.played).toHaveLength(1);
  });

  it("reports echoes part-way through opening, for the progress ring", () => {
    const { location, events } = setup();
    location.emit(fix(HERE, START));
    location.emit(fix(HERE, START + 3000));

    const opening = events.filter((e) => e.type === "opening").at(-1);
    expect(opening).toBeDefined();
    expect(opening!.type === "opening" && opening!.arriving.length).toBe(1);
  });
});

describe("haptics are driven, not spammed", () => {
  const walkIn = (distancesM: number[], gapMs = 4000) => {
    const location = new FakeLocation();
    const haptics = fakeHaptics();
    const session = new WalkSession([echo()], ADULT, { location, haptics });
    session.start();
    distancesM.forEach((m, i) => location.emit(fix(north(HERE, m), START + i * gapMs)));
    return { haptics, session, location };
  };

  it("buzzes as the listener closes in", () => {
    const { haptics } = walkIn([280, 240, 200, 160, 120]);
    expect(haptics.plays.length).toBeGreaterThan(0);
  });

  it("does not restate an unchanged cue on every fix", () => {
    // A fix can arrive every second; restating an identical pattern would cut it off
    // mid-pulse and turn a rhythm into a stutter.
    const { haptics } = walkIn([200, 200, 200, 200, 200, 200]);
    expect(haptics.plays.length).toBeLessThanOrEqual(2);
  });

  it("falls silent when nothing is near", () => {
    const { haptics, location } = walkIn([200, 160]);
    const before = haptics.stops;
    location.emit(fix(north(HERE, 9000), START + 600_000));
    expect(haptics.stops).toBeGreaterThan(before);
  });

  it("stops guiding towards something already captured", () => {
    // Continuing to buzz about an echo in your pocket would be maddening.
    const location = new FakeLocation();
    const haptics = fakeHaptics();
    const session = new WalkSession([echo()], ADULT, { location, haptics });
    const events = collect(session);
    session.start();
    for (let s = 0; s <= 15; s += 3) location.emit(fix(HERE, START + s * 1000));

    const guidance = events.filter((e) => e.type === "guidance").at(-1)!;
    expect(guidance.type === "guidance" && guidance.guidance).toBeNull();
  });

  it("works perfectly well with no haptics at all", () => {
    // iOS Safari has no vibration API; the walk must not depend on one.
    const location = new FakeLocation();
    const session = new WalkSession([echo()], ADULT, { location });
    const events = collect(session);
    session.start();
    for (let s = 0; s <= 15; s += 3) location.emit(fix(HERE, START + s * 1000));
    expect(events.filter((e) => e.type === "captured")).toHaveLength(1);
  });
});

describe("tap to capture", () => {
  it("opens an echo immediately", () => {
    const location = new FakeLocation();
    const audio = fakeAudio();
    const session = new WalkSession([echo()], ADULT, { location, audio });
    const events = collect(session);

    const capture = session.captureNow(echo(), fix(HERE, START));
    expect(capture).not.toBeNull();
    expect(capture!.rarity).toBeDefined();
    expect(events.filter((e) => e.type === "captured")).toHaveLength(1);
    expect(audio.chimes).toBe(1);
  });

  it("returns null when out of range, and announces nothing", () => {
    const location = new FakeLocation();
    const session = new WalkSession([echo()], ADULT, { location });
    const events = collect(session);
    expect(session.captureNow(echo(), fix(north(HERE, 800), START))).toBeNull();
    expect(events).toEqual([]);
  });
});

describe("the collection carries over", () => {
  it("restores what was already found", () => {
    const location = new FakeLocation();
    const first = new WalkSession([echo()], ADULT, { location });
    first.start();
    for (let s = 0; s <= 15; s += 3) location.emit(fix(HERE, START + s * 1000));
    expect(first.tracker.records).toHaveLength(1);

    const second = new WalkSession([echo()], ADULT, { location: new FakeLocation() }, {
      captured: first.tracker.records,
    });
    expect(second.tracker.stateOf("target")).toBe("captured");
  });
});

describe("safety gates still apply on a walk", () => {
  it("will not capture something a child may not hear", () => {
    const location = new FakeLocation();
    const session = new WalkSession([echo({ minAge: 18 })], CHILD, { location });
    const events = collect(session);
    session.start();
    for (let s = 0; s <= 15; s += 3) location.emit(fix(HERE, START + s * 1000));
    expect(events.filter((e) => e.type === "captured")).toEqual([]);
  });
});

describe("guidance belongs to whoever is steering", () => {
  const fakeTones = (): TonesSink & { plays: ToneCue[]; stops: number } => {
    const plays: ToneCue[] = [];
    let stops = 0;
    return {
      plays,
      get stops() {
        return stops;
      },
      play: (cue) => void plays.push(cue),
      stop: () => void stops++,
    };
  };

  const approach = (mode: TravelMode) => {
    const location = new FakeLocation();
    const haptics = fakeHaptics();
    const tones = fakeTones();
    const session = new WalkSession([echo()], ADULT, { location, haptics, tones }, { mode });
    session.start();
    [280, 240, 200, 160, 120].forEach((m, i) => location.emit(fix(north(HERE, m), START + i * 4000)));
    return { haptics, tones, session };
  };

  it("buzzes a walker throughout, and only pings while they are closing", () => {
    // The two channels are addressed to different audiences. A buzz reaches one person
    // through a pocket; a sound in a street reaches everyone standing in it. So the sonar
    // scans while something is changing and goes quiet when nothing is — standing on a
    // corner reading the screen is not an approach, and a cue that keeps pinging through it
    // is noise nobody asked for.
    const { haptics, tones } = approach("walking");
    const buzzes = haptics.plays as HapticCue[];

    expect(buzzes.length).toBeGreaterThan(0);
    expect(tones.plays.length).toBeGreaterThan(0);
    expect(tones.plays.some((t) => t.kind === "steady")).toBe(false);
    // Every buzz that was not "steady" got its ping, and every "steady" one did not.
    expect(tones.plays.length).toBe(buzzes.filter((c) => c.kind !== "steady").length);
  });

  it("guides a car, because a navigator can redirect one", () => {
    // The distinction is agency over the route, not speed. A passenger in a car can say
    // "turn left here"; gating this on how fast you are moving would quietly assume they
    // cannot.
    const { haptics, tones } = approach("driving");
    expect(haptics.plays.length).toBeGreaterThan(0);
    expect(tones.plays.length).toBeGreaterThan(0);
  });

  it("says nothing to someone being carried", () => {
    // Nobody diverts an aircraft towards a good story. Buzzing at a passenger about a
    // landmark off the track describes a choice they do not have.
    for (const mode of ["flight", "rail"] as const) {
      const { haptics, tones } = approach(mode);
      expect(haptics.plays).toEqual([]);
      expect(tones.plays).toEqual([]);
    }
  });

  it("still computes guidance when carried, so the map can show it", () => {
    // Withholding the cue is a rendering decision, not a reason to stop knowing.
    const location = new FakeLocation();
    const session = new WalkSession([echo()], ADULT, { location }, { mode: "flight" });
    const seen: (Guidance | null)[] = [];
    session.subscribe((e) => {
      if (e.type === "guidance") seen.push(e.guidance);
    });
    session.start();
    [280, 200, 120].forEach((m, i) => location.emit(fix(north(HERE, m), START + i * 4000)));
    expect(seen.some((g) => g !== null)).toBe(true);
  });

  it("sounds like an echo: reflections that tighten as you close", () => {
    // The whole conceit. Far off, the returns are slow and many — the sound of a big empty
    // space. At the source there is no reflection at all.
    const far = toneFor({ kind: "steady", intensity: 0.4, pulseMs: 40, intervalMs: 900 });
    const near = toneFor({ kind: "close", intensity: 0.9, pulseMs: 40, intervalMs: 300 });
    const there = toneFor({ kind: "arrived", intensity: 1, pulseMs: 60, intervalMs: 0 });

    expect(near.repeatGapMs).toBeLessThan(far.repeatGapMs);
    expect(near.hz).toBeGreaterThan(far.hz);
    expect(there.repeats).toBe(0);
    // Arrival is a moment, not a rhythm.
    expect(there.intervalMs).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("two echoes, one pair of ears", () => {
  const withAudio = (id: string, at: LatLng, quality = 0.8) =>
    makeEcho({
      id,
      at,
      triggerRadiusKm: 0.05,
      quality,
      audioKey: `audio/${id}.mp3`,
    });

  /** Two echoes a few metres apart, which is Bowling Green. */
  const CORNER = HERE;
  const ALSO_HERE = north(HERE, 8);

  const walkTo = (echoes: ReturnType<typeof withAudio>[], stops: number[] = [0, 0, 0, 0, 0]) => {
    const location = new FakeLocation();
    const audio = fakeAudio();
    const session = new WalkSession(echoes, ADULT, { location, audio }, { autoPlay: true });
    const events = collect(session);
    session.start();
    stops.forEach((m, i) => location.emit(fix(north(CORNER, m), START + i * 13_000)));
    return { audio, session, events, location };
  };

  it("does not talk over itself when two echoes capture together", () => {
    // The bug this exists for. At a stop with two echoes a few metres apart — the King
    // George statue and the Charging Bull — both capture within seconds, and the second
    // `play()` used to land straight on top of the first.
    const { audio } = walkTo([withAudio("statue", CORNER), withAudio("bull", ALSO_HERE)]);
    expect(audio.played).toEqual(["audio/statue.mp3"]);
  });

  it("plays the second one when the first runs out", () => {
    const { audio } = walkTo([withAudio("statue", CORNER), withAudio("bull", ALSO_HERE)]);
    audio.finish();
    expect(audio.played).toEqual(["audio/statue.mp3", "audio/bull.mp3"]);
  });

  it("reports what is playing and what is behind it", () => {
    const { events } = walkTo([withAudio("statue", CORNER), withAudio("bull", ALSO_HERE)]);
    const last = [...events].reverse().find((e) => e.type === "playback");
    expect(last?.type).toBe("playback");
    const state = last?.type === "playback" ? last.state : null;
    expect(state?.kind).toBe("playing");
    expect(state?.kind === "playing" && state.item.echo.id).toBe("statue");
    expect(last?.type === "playback" && last.waiting.map((w) => w.echo.id)).toEqual(["bull"]);
  });

  it("gives up on a waiting echo once the listener has walked away from it", () => {
    // Capturing and hearing are different things. Nothing is lost — it is in the collection
    // and can be played from there — but an echo saying "look at the tops of the posts" is
    // worthless two streets later, so it does not wait indefinitely for its turn.
    const { events } = walkTo(
      [withAudio("statue", CORNER), withAudio("bull", ALSO_HERE)],
      [0, 0, 400, 800],
    );
    const deferred = events.filter((e) => e.type === "deferred");
    expect(deferred.length).toBe(1);
    expect(deferred[0]?.type === "deferred" && deferred[0].deferred.echo.id).toBe("bull");
    expect(deferred[0]?.type === "deferred" && deferred[0].deferred.reason).toBe("out-of-range");
  });

  it("lets whatever is already playing finish, wherever the listener has got to", () => {
    // Stopping a story mid-sentence because somebody rounded a corner would be a bizarre
    // thing for a product to do.
    const { audio, events } = walkTo([withAudio("statue", CORNER)], [0, 0, 600, 900]);
    expect(audio.stops).toBe(0);
    const last = [...events].reverse().find((e) => e.type === "playback");
    expect(last?.type === "playback" && last.state.kind).toBe("playing");
  });

  it("drops the weakest when more arrive than a queue can usefully hold", () => {
    // Arriving last is not a reason to be dropped; being the least worth hearing is.
    const echoes = [
      withAudio("a", CORNER, 0.9),
      withAudio("b", north(CORNER, 5), 0.85),
      withAudio("c", north(CORNER, 10), 0.3),
      withAudio("d", north(CORNER, 15), 0.8),
    ];
    const { events } = walkTo(echoes);
    const deferred = events.filter((e) => e.type === "deferred");
    expect(deferred.length).toBe(1);
    expect(deferred[0]?.type === "deferred" && deferred[0].deferred.echo.id).toBe("c");
    expect(deferred[0]?.type === "deferred" && deferred[0].deferred.reason).toBe("queue-full");
  });

  it("plays on demand, and puts back what was interrupted", () => {
    const echoes = [withAudio("statue", CORNER), withAudio("bull", ALSO_HERE)];
    const { audio, session } = walkTo(echoes);
    session.play(echoes[1]!);
    expect(audio.played).toEqual(["audio/statue.mp3", "audio/bull.mp3"]);
    expect(session.nowPlaying?.echo.id).toBe("bull");
    audio.finish();
    // The one it jumped in front of is still there, not thrown away.
    expect(session.nowPlaying?.echo.id).toBe("statue");
  });

  it("stays quiet unless hands-free was asked for", () => {
    const location = new FakeLocation();
    const audio = fakeAudio();
    const session = new WalkSession([withAudio("statue", CORNER)], ADULT, { location, audio });
    session.start();
    [0, 0, 0].forEach((m, i) => location.emit(fix(north(CORNER, m), START + i * 13_000)));
    expect(audio.played).toEqual([]);
    expect(audio.chimes).toBeGreaterThan(0);
  });
});

describe("choosing in advance", () => {
  const withAudio = (id: string, at: LatLng) =>
    makeEcho({ id, at, triggerRadiusKm: 0.05, audioKey: `audio/${id}.mp3` });

  const arrive = (options: WalkSessionOptions) => {
    const location = new FakeLocation();
    const audio = fakeAudio();
    const echoes = [withAudio("wanted", HERE), withAudio("skipped", north(HERE, 8))];
    const session = new WalkSession(echoes, ADULT, { location, audio }, options);
    const events = collect(session);
    session.start();
    [0, 0, 0, 0, 0].forEach((m, i) => location.emit(fix(north(HERE, m), START + i * 13_000)));
    return { audio, events, session };
  };

  it("plays only what the listener picked before setting off", () => {
    // The pre-departure case: look at what the route passes, choose a few, and let those
    // play themselves as they come up.
    const { audio } = arrive({ autoPlay: true, autoPlayOnly: ["wanted"] });
    expect(audio.played).toEqual(["audio/wanted.mp3"]);
  });

  it("still collects the ones it does not play", () => {
    // Not chosen is not the same as not found. Capturing is the game; playing is a choice,
    // and the unchosen ones are in the collection to be played from there whenever.
    const { events } = arrive({ autoPlay: true, autoPlayOnly: ["wanted"] });
    const captured = events.filter((e) => e.type === "captured");
    expect(captured.map((e) => (e.type === "captured" ? e.capture.echo.id : "")).sort()).toEqual([
      "skipped",
      "wanted",
    ]);
  });

  it("treats an empty choice literally — nothing plays itself", () => {
    // How a listener turns auto-play off without turning it off: they chose nothing.
    const { audio } = arrive({ autoPlay: true, autoPlayOnly: [] });
    expect(audio.played).toEqual([]);
  });

  it("plays everything when no choice was made", () => {
    const { audio } = arrive({ autoPlay: true });
    expect(audio.played).toEqual(["audio/wanted.mp3"]);
    // And the second is queued behind it rather than dropped.
    audio.finish();
    expect(audio.played).toEqual(["audio/wanted.mp3", "audio/skipped.mp3"]);
  });

  it("never starts one before the last has finished", () => {
    const { audio } = arrive({ autoPlay: true });
    expect(audio.played.length).toBe(1);
    audio.finish();
    expect(audio.played.length).toBe(2);
  });
});

/**
 * The queue's identity rules.
 *
 * All three of these were reachable from the sheet with one tap, and all three were silent:
 * nothing threw, nothing logged, and the only symptom was an echo you had already heard
 * starting again by itself, or one that quietly never arrived.
 */
describe("playing something that is already in hand", () => {
  const queued = (id: string, quality = 0.7) => ({
    echo: echo({ id, quality }),
    render: { voiceId: "v", audioKey: `a/${id}`, durationS: 30 },
    atMs: START,
  });

  it("restarts what is playing rather than cloning it", () => {
    // Tapping Listen on the card that already says "Playing" used to push the current item
    // back onto the queue, so the echo played straight through a second time.
    const queue = new PlaybackQueue("walking");
    queue.offer(queued("a"));
    queue.playNow(queued("a"));

    expect(queue.nowPlaying?.echo.id).toBe("a");
    expect(queue.waiting).toHaveLength(0);
    expect(queue.finished()).toBeNull();
  });

  it("promotes a waiting echo instead of duplicating it", () => {
    const queue = new PlaybackQueue("walking");
    queue.offer(queued("a"));
    queue.offer(queued("b"));
    queue.playNow(queued("b"));

    expect(queue.nowPlaying?.echo.id).toBe("b");
    expect(queue.waiting.map((q) => q.echo.id)).toEqual(["a"]);
  });

  it("does not queue the same echo twice", () => {
    const queue = new PlaybackQueue("walking");
    queue.offer(queued("a"));
    queue.offer(queued("b"));
    queue.offer(queued("b"));
    expect(queue.waiting.map((q) => q.echo.id)).toEqual(["b"]);
  });

  it("reports what it gave up to make room, and gives up the weakest", () => {
    // `playNow` used to pop the tail — the newest arrival — and say nothing about it, while
    // `offer` right next to it dropped the weakest and reported it. One queue, one rule.
    const queue = new PlaybackQueue("walking", { maxWaiting: 2 });
    queue.offer(queued("a", 0.9));
    queue.offer(queued("weak", 0.2));
    queue.offer(queued("c", 0.8));
    const deferred = queue.playNow(queued("d", 0.9));

    expect(deferred?.echo.id).toBe("weak");
    expect(deferred?.reason).toBe("queue-full");
    expect(queue.waiting.map((q) => q.echo.id)).toEqual(["a", "c"]);
  });
});

/**
 * Keeping the collection.
 *
 * The collection is the reason somebody keeps this app, and until now every record lived in
 * memory: a refresh threw away the lot. These cover the three things that make persistence
 * either trustworthy or actively harmful — that it writes what was agreed rather than what
 * was captured, that turning a setting off reaches what is *already* stored, and that a
 * storage failure never costs somebody a capture they actually earned.
 */
describe("keeping the collection", () => {
  const fakeStore = () => {
    const saves: (readonly CaptureRecord[])[] = [];
    let fail = false;
    return {
      saves,
      failNext: () => void (fail = true),
      load: async () => [],
      save: async (records: readonly CaptureRecord[]) => {
        if (fail) {
          fail = false;
          throw new Error("quota exceeded");
        }
        saves.push(records);
      },
      clear: async () => void (saves.length = 0),
    };
  };

  const arriveAt = (location: FakeLocation) => {
    // Inside the radius, held past the dwell.
    location.emit(fix(HERE, START));
    location.emit(fix(HERE, START + 20_000));
  };

  /**
   * Let the write chain settle.
   *
   * A macrotask rather than a counted run of `await Promise.resolve()`: `persist` chains
   * through an async `save` and a `catch`, so the number of microtask ticks it takes is an
   * implementation detail, and a test that counts them breaks the next time the chain grows
   * a link.
   */
  const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("writes after a capture", async () => {
    const location = new FakeLocation();
    const store = fakeStore();
    const session = new WalkSession([echo()], ADULT, { location, collection: store });
    session.start();
    arriveAt(location);
    await settled();

    expect(store.saves.length).toBeGreaterThan(0);
    expect(store.saves.at(-1)!.map((r) => r.echoId)).toEqual(["target"]);
  });

  it("writes what the listener agreed to, not what was captured", async () => {
    // `stoodAt` is a standing position — a fact about a person, not about an echo. Storage
    // that never received it cannot leak it.
    const location = new FakeLocation();
    const store = fakeStore();
    const session = new WalkSession([echo()], ADULT, { location, collection: store }, {
      privacy: { ...PRIVACY_DEFAULTS, keepCollection: true, recordPrecisePlaces: false },
    });
    session.start();
    arriveAt(location);
    await settled();

    expect(store.saves.at(-1)!).toHaveLength(1);
    expect(store.saves.at(-1)![0]!.stoodAt).toBeUndefined();
  });

  it("rewrites storage when a setting is turned off", async () => {
    // The failure this prevents: "stop recording where I was standing" that only applies to
    // future captures, leaving every previous position sitting on disk.
    const location = new FakeLocation();
    const store = fakeStore();
    const session = new WalkSession([echo()], ADULT, { location, collection: store }, {
      privacy: { ...PRIVACY_DEFAULTS, keepCollection: true, recordPrecisePlaces: true },
    });
    session.start();
    arriveAt(location);
    await settled();
    expect(store.saves.at(-1)![0]!.stoodAt).toBeDefined();

    session.setPrivacy({ ...PRIVACY_DEFAULTS, keepCollection: true, recordPrecisePlaces: false });
    await settled();
    expect(store.saves.at(-1)![0]!.stoodAt).toBeUndefined();
  });

  it("reports a failed write without losing the capture", async () => {
    // A full disk is a storage problem. Throwing away the capture would turn it into a lie
    // about where somebody has been.
    const location = new FakeLocation();
    const store = fakeStore();
    const session = new WalkSession([echo()], ADULT, { location, collection: store });
    const events = collect(session);
    store.failNext();
    session.start();
    arriveAt(location);
    await settled();

    expect(events.some((e) => e.type === "captured")).toBe(true);
    expect(events.some((e) => e.type === "error")).toBe(true);
    expect(session.collection).toHaveLength(1);
  });

  it("restores a previous collection, so a found echo is not found twice", () => {
    const location = new FakeLocation();
    const previous: CaptureRecord[] = [
      { echoId: "target", capturedAt: new Date(START).toISOString(), distanceKm: 0.01 },
    ];
    const session = new WalkSession([echo()], ADULT, { location }, { captured: previous });
    const events = collect(session);
    session.start();
    arriveAt(location);

    expect(session.tracker.stateOf("target")).toBe("captured");
    expect(events.filter((e) => e.type === "captured")).toHaveLength(0);
  });
});
