/**
 * The driving safety lock, the pure half (`docs/10-blockers.md` item 14; approved by James
 * 2026-11-11). `DriveLock.tsx` feeds it fixes and a clock and draws what it decides.
 *
 * WHAT IT DOES. When the phone has been moving faster than walking pace for a while, the
 * screen's controls lock behind a full screen notice. Echoes keep playing: nothing here
 * touches the narrator, so a walk or a playing echo carries on hands free. One button, "I'm
 * a passenger", unlocks the screen until the trip ends. The trip ends when the phone has
 * been at walking pace or stopped for a few minutes; the next trip locks again.
 *
 * SPEED. Measured the way the engine's `CaptureTracker` measures it: over the ground from
 * the last fix, and the speed the phone reports only when nothing could be measured,
 * because a device that says it is still while its coordinates move is describing a wish.
 * One extra caution the tracker does not need: a step shorter than the fixes' own accuracy
 * is GPS wander, not travel, so it is not measured either.
 *
 * THRESHOLDS. Locks at 25 km/h held for 15 seconds: faster than any runner or a relaxed
 * cyclist, slower than any car in traffic that is moving. Walking pace is the engine's own
 * (`presetFor("walking").syncAtKph`, 8 km/h). Between the two, crawling traffic, the lock
 * holds but does not start. Three minutes at walking pace, or three minutes with no fix at
 * all (iOS stops reporting a phone that is not moving), end the trip.
 *
 * Kept apart so the root suite can test it (`test/ios/drive-lock.test.ts`): this file
 * imports nothing but the engine.
 */
import { distanceKm, presetFor, type LatLng } from "@echofinders/core";

/** Faster than this, held for `SUSTAIN_MS`, is travelling, not walking. */
export const LOCK_KPH = 25;
/** Slower than this is walking pace: the engine's own line between a stop and a stride. */
export const WALKING_KPH = presetFor("walking").syncAtKph ?? 8;
/** How long the speed must hold above `LOCK_KPH` before the screen locks. */
export const SUSTAIN_MS = 15_000;
/** How long at walking pace, or without a fix, before the trip is over. */
export const TRIP_END_MS = 3 * 60_000;
/** A fix vaguer than this says too little about speed to use. */
export const MAX_ACCURACY_M = 65;

/** A fix as the lock reads it. */
export interface DriveFix {
  readonly at: LatLng;
  /** Epoch milliseconds. */
  readonly timestamp: number;
  /** Metres, as the phone reports it; unknown if absent. */
  readonly accuracyM?: number | null;
  /** The speed the phone reports, km/h; unknown if absent or negative. */
  readonly speedKph?: number | null;
}

export interface DriveLockState {
  /** The last fix taken. */
  readonly last: DriveFix | null;
  /** When the current run above `LOCK_KPH` began, or null. */
  readonly fastSince: number | null;
  /** When the current run at walking pace began, or null. */
  readonly slowSince: number | null;
  /** A trip is under way: the speed held above `LOCK_KPH` and has not settled since. */
  readonly travelling: boolean;
  /** "I'm a passenger" was pressed on this trip. */
  readonly passenger: boolean;
}

export const DRIVE_START: DriveLockState = {
  last: null,
  fastSince: null,
  slowSince: null,
  travelling: false,
  passenger: false,
};

/** Is the screen locked? Only during a trip, and never after "I'm a passenger". */
export function isLocked(state: DriveLockState): boolean {
  return state.travelling && !state.passenger;
}

/**
 * Speed from `previous` to `fix`, km/h, or null when nothing can be said. Measured over the
 * ground when the step is longer than the fixes' wander; the reported speed otherwise.
 */
export function speedKph(previous: DriveFix | null, fix: DriveFix): number | null {
  const reported = fix.speedKph !== undefined && fix.speedKph !== null && fix.speedKph >= 0 ? fix.speedKph : null;
  if (!previous) return reported;
  const elapsedS = (fix.timestamp - previous.timestamp) / 1000;
  if (elapsedS <= 0) return reported;
  const km = distanceKm(previous.at, fix.at);
  const wanderM = Math.max(previous.accuracyM ?? 0, fix.accuracyM ?? 0);
  if (km * 1000 <= wanderM) return reported ?? 0;
  return (km / elapsedS) * 3600;
}

/** The trip ends after `TRIP_END_MS` at walking pace, or with no fix at all. */
function settle(state: DriveLockState, nowMs: number): DriveLockState {
  if (!state.travelling) return state;
  const atPace = state.slowSince !== null && nowMs - state.slowSince >= TRIP_END_MS;
  const silent = state.last !== null && nowMs - state.last.timestamp >= TRIP_END_MS;
  return atPace || silent ? { ...state, travelling: false, passenger: false, fastSince: null, slowSince: null } : state;
}

/** Take one fix. Fixes not newer than the last, unplaceable, or too vague are ignored. */
export function onFix(state: DriveLockState, fix: DriveFix): DriveLockState {
  if (!Number.isFinite(fix.at.lat) || !Number.isFinite(fix.at.lng)) return state;
  if (state.last && !(fix.timestamp > state.last.timestamp)) return state;
  if (fix.accuracyM !== undefined && fix.accuracyM !== null && fix.accuracyM > MAX_ACCURACY_M) return state;

  // A long silence before this fix may already have ended the trip.
  const before = settle(state, fix.timestamp);
  const kph = speedKph(before.last, fix);
  const from = before.last?.timestamp ?? fix.timestamp;
  if (kph === null) return { ...before, last: fix };

  const fastSince = kph >= LOCK_KPH ? (before.fastSince ?? from) : null;
  const slowSince = kph < WALKING_KPH ? (before.slowSince ?? from) : null;
  const travelling = before.travelling || (fastSince !== null && fix.timestamp - fastSince >= SUSTAIN_MS);
  return settle({ ...before, last: fix, fastSince, slowSince, travelling }, fix.timestamp);
}

/** The clock moved on with no fix: a phone that has stopped reports nothing. */
export function onTick(state: DriveLockState, nowMs: number): DriveLockState {
  return settle(state, nowMs);
}

/** "I'm a passenger": unlocked until this trip ends. Only during a trip. */
export function asPassenger(state: DriveLockState): DriveLockState {
  return state.travelling ? { ...state, passenger: true } : state;
}

/** The notice, word for word. No dashes; "echoes", always. */
export const DRIVE_LOCK_COPY = {
  caps: "Moving",
  title: "Locked while you travel",
  body: "You are moving faster than walking pace, so the screen is locked. Echoes keep playing, hands free.",
  driver: "Driving? Keep your eyes on the road and listen.",
  button: "I’m a passenger",
  hint: "Unlocks the screen until this trip ends.",
  announce: "Echo Finders is locked while you travel. Echoes keep playing.",
} as const;
