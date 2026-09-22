import { describe, expect, it, vi } from "vitest";
import { WalkSession } from "../src/session/walk.js";
import type {
  AudioSink,
  HapticsSink,
  LocationSource,
  TonesSink,
} from "../src/session/adapters.js";
import type { LatLng, Position, TravelMode } from "../src/types.js";
import { toneFor, type ToneCue } from "../src/proximity/tone.js";
import type { Guidance } from "../src/proximity/haptics.js";
import type { WalkEvent } from "../src/session/walk.js";
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

const fakeAudio = (): AudioSink & { played: string[]; chimes: number } => {
  const played: string[] = [];
  let chimes = 0;
  return {
    played,
    get chimes() {
      return chimes;
    },
    play: (key) => void played.push(key),
    pause: () => {},
    chime: () => void chimes++,
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

  it("guides a walker, by buzz and by sound together", () => {
    const { haptics, tones } = approach("walking");
    expect(haptics.plays.length).toBeGreaterThan(0);
    expect(tones.plays.length).toBe(haptics.plays.length);
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
