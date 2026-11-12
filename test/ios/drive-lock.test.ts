/**
 * The iPhone app's driving safety lock, the pure half (`apps/ios/src/drive/lock.ts`):
 * locks after sustained travel above walking pace, "I'm a passenger" unlocks until the trip
 * ends, and the trip ends after a few minutes at walking pace or with no fix.
 */
import { describe, expect, it } from "vitest";
import { presetFor } from "@echofinders/core";
import {
  DRIVE_LOCK_COPY,
  DRIVE_START,
  LOCK_KPH,
  SUSTAIN_MS,
  TRIP_END_MS,
  WALKING_KPH,
  asPassenger,
  isLocked,
  onFix,
  onTick,
  speedKph,
  type DriveFix,
  type DriveLockState,
} from "../../apps/ios/src/drive/lock.js";

const T0 = Date.UTC(2026, 10, 12, 9, 0, 0);
// Metres north per degree of latitude, near enough for a test.
const M_PER_DEG = 111_195;

/** A run of fixes due north at `kph`, one every `everyS` seconds, from `start`. */
function run(kph: number, seconds: number, start: { ms: number; northM: number }, everyS = 1): DriveFix[] {
  const fixes: DriveFix[] = [];
  for (let s = everyS; s <= seconds; s += everyS) {
    const northM = start.northM + (kph / 3.6) * s;
    fixes.push({ at: { lat: 34.2 + northM / M_PER_DEG, lng: -77.9 }, timestamp: start.ms + s * 1000, accuracyM: 8 });
  }
  return fixes;
}

function feed(state: DriveLockState, fixes: readonly DriveFix[]): DriveLockState {
  return fixes.reduce(onFix, state);
}

const first: DriveFix = { at: { lat: 34.2, lng: -77.9 }, timestamp: T0, accuracyM: 8 };
const lastOf = (fixes: readonly DriveFix[]) => fixes[fixes.length - 1]!;
const northOf = (fix: DriveFix) => (fix.at.lat - 34.2) * M_PER_DEG;

/** Driving at 50 km/h for a minute: locked. */
function driving(): DriveLockState {
  const fixes = run(50, 60, { ms: T0, northM: 0 });
  return feed(onFix(DRIVE_START, first), fixes);
}

describe("the thresholds", () => {
  it("uses the engine's walking pace and locks at about 25 km/h", () => {
    expect(WALKING_KPH).toBe(presetFor("walking").syncAtKph);
    expect(LOCK_KPH).toBe(25);
    expect(TRIP_END_MS).toBeGreaterThanOrEqual(2 * 60_000);
  });
});

describe("speed", () => {
  it("measures over the ground and prefers it to what the phone reports", () => {
    const next: DriveFix = { ...run(36, 1, { ms: T0, northM: 0 })[0]!, speedKph: 0 };
    expect(speedKph(first, next)).toBeCloseTo(36, 0);
  });

  it("uses the reported speed for the first fix", () => {
    expect(speedKph(null, { ...first, speedKph: 40 })).toBe(40);
    expect(speedKph(null, first)).toBeNull();
    expect(speedKph(null, { ...first, speedKph: -1 })).toBeNull();
  });

  it("treats a step inside the fixes' accuracy as wander, not travel", () => {
    const jitter: DriveFix = { at: { lat: 34.2 + 20 / M_PER_DEG, lng: -77.9 }, timestamp: T0 + 1000, accuracyM: 30 };
    expect(speedKph(first, jitter)).toBe(0);
  });
});

describe("locking", () => {
  it("is unlocked at the start and on foot", () => {
    expect(isLocked(DRIVE_START)).toBe(false);
    const walk = feed(onFix(DRIVE_START, first), run(5, 600, { ms: T0, northM: 0 }));
    expect(isLocked(walk)).toBe(false);
  });

  it("does not lock on a cyclist's pace", () => {
    const ride = feed(onFix(DRIVE_START, first), run(18, 600, { ms: T0, northM: 0 }));
    expect(isLocked(ride)).toBe(false);
  });

  it("locks once the speed has held above 25 km/h for the sustain time, not before", () => {
    const fixes = run(50, 60, { ms: T0, northM: 0 });
    let state = onFix(DRIVE_START, first);
    for (const fix of fixes) {
      state = onFix(state, fix);
      expect(isLocked(state)).toBe(fix.timestamp - T0 >= SUSTAIN_MS);
    }
  });

  it("does not lock on a single burst, a GPS jump that is not sustained", () => {
    let state = onFix(DRIVE_START, first);
    const jump: DriveFix = { at: { lat: 34.2 + 60 / M_PER_DEG, lng: -77.9 }, timestamp: T0 + 1000, accuracyM: 8 };
    state = onFix(state, jump);
    const still: DriveFix = { ...jump, timestamp: T0 + 20_000 };
    state = onFix(state, still);
    expect(isLocked(state)).toBe(false);
  });

  it("locks from sparse fixes when their average is fast for long enough", () => {
    const later: DriveFix = { at: { lat: 34.2 + 500 / M_PER_DEG, lng: -77.9 }, timestamp: T0 + 30_000, accuracyM: 8 };
    expect(isLocked(onFix(onFix(DRIVE_START, first), later))).toBe(true);
  });

  it("ignores fixes too vague to measure, unplaceable, or out of order", () => {
    const state = driving();
    const last = state.last!;
    expect(onFix(state, { ...last, timestamp: last.timestamp + 1000, accuracyM: 500 })).toBe(state);
    expect(onFix(state, { ...last, timestamp: last.timestamp - 1000 })).toBe(state);
    expect(onFix(state, { at: { lat: Number.NaN, lng: 0 }, timestamp: last.timestamp + 1000 })).toBe(state);
  });

  it("stays locked through a red light and crawling traffic", () => {
    let state = driving();
    const last = state.last!;
    // Two minutes stopped: no fixes, then a slow creep, a fix every 10 m as the app asks.
    state = onTick(state, last.timestamp + 2 * 60_000);
    expect(isLocked(state)).toBe(true);
    state = feed(state, run(12, 120, { ms: last.timestamp + 2 * 60_000, northM: northOf(last) }, 3));
    expect(isLocked(state)).toBe(true);
  });
});

describe("the trip ends", () => {
  it("after a few minutes at walking pace", () => {
    let state = driving();
    const last = state.last!;
    const walk = run(4, 240, { ms: last.timestamp, northM: northOf(last) }, 5);
    for (const fix of walk) {
      state = onFix(state, fix);
      if (fix.timestamp - last.timestamp < TRIP_END_MS) expect(isLocked(state)).toBe(true);
    }
    expect(isLocked(state)).toBe(false);
    expect(state.travelling).toBe(false);
  });

  it("after a few minutes with no fix at all, which is how iOS reports a parked phone", () => {
    const state = driving();
    const last = state.last!;
    expect(isLocked(onTick(state, last.timestamp + TRIP_END_MS - 1000))).toBe(true);
    expect(isLocked(onTick(state, last.timestamp + TRIP_END_MS))).toBe(false);
  });

  it("before a fix that arrives after a long silence is judged", () => {
    const state = driving();
    const last = state.last!;
    const back: DriveFix = { ...last, timestamp: last.timestamp + TRIP_END_MS + 60_000 };
    expect(isLocked(onFix(state, back))).toBe(false);
  });
});

describe("I'm a passenger", () => {
  it("unlocks until the trip ends, and the next trip locks again", () => {
    let state = asPassenger(driving());
    expect(isLocked(state)).toBe(false);

    // Still driving: stays unlocked.
    const last = state.last!;
    state = feed(state, run(60, 300, { ms: last.timestamp, northM: northOf(last) }));
    expect(isLocked(state)).toBe(false);

    // Parked for a few minutes: the trip is over.
    const parked = lastOf(run(60, 300, { ms: last.timestamp, northM: northOf(last) }));
    state = onTick(state, parked.timestamp + TRIP_END_MS);
    expect(state.passenger).toBe(false);

    // The next drive locks again.
    const restart: DriveFix = { ...parked, timestamp: parked.timestamp + TRIP_END_MS + 1000 };
    state = feed(onFix(state, restart), run(50, 60, { ms: restart.timestamp, northM: northOf(restart) }));
    expect(isLocked(state)).toBe(true);
  });

  it("does nothing when there is no trip", () => {
    expect(asPassenger(DRIVE_START)).toBe(DRIVE_START);
  });
});

describe("the notice", () => {
  it("says echoes, has one button, and no dashes", () => {
    expect(DRIVE_LOCK_COPY.button).toBe("I’m a passenger");
    expect(DRIVE_LOCK_COPY.body).toMatch(/Echoes keep playing/);
    for (const line of Object.values(DRIVE_LOCK_COPY)) expect(line).not.toMatch(/[–—]|\s-\s/);
  });
});
