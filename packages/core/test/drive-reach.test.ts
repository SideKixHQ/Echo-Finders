/**
 * The driving reach (James, 2026-11-13, decision 3): a driver syncs an echo up to about
 * 150 m from the road, and a waiting echo the car has passed gives up.
 */
import { describe, expect, it } from "vitest";
import { CaptureTracker } from "../src/capture/index.js";
import { MODE_PRESETS, syncRadiusKm } from "../src/modes.js";
import { PlaybackQueue } from "../src/session/playback.js";
import type { Echo, LatLng, Position, TravelMode } from "../src/types.js";
import { ADULT, makeEcho } from "./fixtures.js";

const FRONT_STREET: LatLng = { lat: 34.2357, lng: -77.9452 };
const START = Date.parse("2026-06-15T17:00:00Z");

/** A point `metres` north and `east` metres east of `from`. */
const offset = (from: LatLng, north: number, east = 0): LatLng => ({
  lat: from.lat + north / 111_195,
  lng: from.lng + east / (111_195 * Math.cos((from.lat * Math.PI) / 180)),
});

const fix = (at: LatLng, tMs: number): Position => ({ at, accuracyM: 10, timestamp: tMs, source: "device-gnss" });

/** A walking echo, forty metres across, as nearly every echo in the library is. */
const plaque = (radiusKm = 0.04): Echo =>
  makeEcho({ id: "the-plaque", at: FRONT_STREET, triggerRadiusKm: radiusKm, visibility: "at-hand" });

/**
 * Drive north past the echo along a road `offRoadM` to its east, at `kph`, one fix a
 * second, from 600 m before it to 600 m after. Returns what synced.
 */
function passBy(mode: TravelMode, offRoadM: number, kph = 50, echo = plaque()) {
  const tracker = new CaptureTracker(ADULT, { mode });
  const mps = kph / 3.6;
  const synced: string[] = [];
  for (let s = 0; s * mps <= 1200; s++) {
    const at = offset(FRONT_STREET, -600 + s * mps, offRoadM);
    synced.push(...tracker.update(fix(at, START + s * 1000), [echo]).map((e) => e.echo.id));
  }
  return synced;
}

describe("a driver's reach from the road", () => {
  it("is about 150 m on a drive, and nothing on foot", () => {
    expect(MODE_PRESETS.driving.syncReachKm).toBe(0.15);
    expect(MODE_PRESETS.walking.syncReachKm ?? 0).toBe(0);
    expect(syncRadiusKm(0.04, "driving")).toBe(0.15);
    expect(syncRadiusKm(0.04, "walking")).toBe(0.04);
  });

  it("syncs a landmark 120 m off the road as a car drives past at 50 km/h", () => {
    expect(passBy("driving", 120)).toEqual(["the-plaque"]);
  });

  it("syncs one 140 m off the road at highway speed", () => {
    expect(passBy("driving", 140, 100)).toEqual(["the-plaque"]);
  });

  it("does not sync one 250 m off the road", () => {
    expect(passBy("driving", 250)).toEqual([]);
  });

  it("never narrows an echo written wider than the reach", () => {
    expect(syncRadiusKm(3, "driving")).toBe(3);
    expect(passBy("driving", 1500, 90, plaque(3))).toEqual(["the-plaque"]);
  });

  it("leaves walking as it was: 120 m away is not there", () => {
    const tracker = new CaptureTracker(ADULT, { mode: "walking" });
    const at = offset(FRONT_STREET, 0, 120);
    const synced = [0, 3, 6, 9, 12].flatMap((s) => tracker.update(fix(at, START + s * 1000), [plaque()]));
    expect(synced).toEqual([]);
  });
});

describe("a waiting echo the car has passed gives up", () => {
  const waiting = (id: string, at: LatLng) => ({
    echo: makeEcho({ id, at, triggerRadiusKm: 0.04 }),
    render: { voiceId: "v", audioKey: `a/${id}`, durationS: 60 },
    atMs: START,
  });

  /** One echo playing, one waiting at the plaque; the listener then moves along `path`. */
  function wait(mode: TravelMode, path: readonly LatLng[]) {
    const queue = new PlaybackQueue(mode);
    queue.offer(waiting("playing", offset(FRONT_STREET, -100)));
    queue.offer(waiting("the-plaque", FRONT_STREET));
    return path.flatMap((at) => queue.moved(at).map((d) => d.echo.id));
  }

  it("on a drive, once out of reach and getting further away", () => {
    const along = [-50, 0, 100, 200, 300].map((m) => offset(FRONT_STREET, m));
    expect(wait("driving", along)).toEqual(["the-plaque"]);
  });

  it("not while the car is still coming towards it", () => {
    const coming = [-2000, -1500, -1000, -500, -200].map((m) => offset(FRONT_STREET, m));
    expect(wait("driving", coming)).toEqual([]);
  });

  it("not while still within reach of it", () => {
    const passing = [-100, -50, 0, 60, 120].map((m) => offset(FRONT_STREET, m));
    expect(wait("driving", passing)).toEqual([]);
  });

  it("leaves walking as it was: a short way past is still worth hearing", () => {
    const strolling = [0, 40, 80, 120].map((m) => offset(FRONT_STREET, m));
    expect(wait("walking", strolling)).toEqual([]);
  });
});
