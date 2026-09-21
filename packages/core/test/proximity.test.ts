import { describe, expect, it } from "vitest";
import {
  ProximityGuide,
  proximityCue,
  SILENT,
  headingIsUsable,
  viewfinderMarkers,
} from "../src/proximity/index.js";
import { CaptureTracker } from "../src/capture/index.js";
import { validateEcho } from "../src/content/validate.js";
import { presetFor } from "../src/modes.js";
import type { Echo, LatLng, Position } from "../src/types.js";
import { ADULT, makeEcho } from "./fixtures.js";
import type { EchoDraft } from "./fixtures.js";

const HERE: LatLng = { lat: 40.7069, lng: -74.0113 };
const START = Date.parse("2026-06-15T17:00:00Z");
const RADIUS_KM = 0.05;

const north = (from: LatLng, metres: number): LatLng => ({
  lat: from.lat + metres / 111_195,
  lng: from.lng,
});
const east = (from: LatLng, metres: number): LatLng => ({
  lat: from.lat,
  lng: from.lng + metres / (111_195 * Math.cos((from.lat * Math.PI) / 180)),
});

const echo = (overrides: Partial<EchoDraft> = {}) =>
  makeEcho({ id: "target", at: HERE, triggerRadiusKm: RADIUS_KM, ...overrides });

describe("proximityCue", () => {
  it("says nothing when nothing is near", () => {
    expect(proximityCue(5, RADIUS_KM, "closer")).toEqual(SILENT);
  });

  it("confirms arrival with one long pulse rather than a rhythm", () => {
    // Arrival is an event, not guidance.
    const cue = proximityCue(RADIUS_KM * 0.5, RADIUS_KM, "closer");
    expect(cue.kind).toBe("arrived");
    expect(cue.intensity).toBe(1);
    expect(cue.intervalMs).toBe(Number.POSITIVE_INFINITY);
  });

  it("pulses faster the closer you get", () => {
    // Rhythm is the primary cue: through a pocket, rate is far more legible than strength.
    const far = proximityCue(RADIUS_KM * 5, RADIUS_KM, "closer");
    const near = proximityCue(RADIUS_KM * 1.5, RADIUS_KM, "closer");
    expect(near.intervalMs).toBeLessThan(far.intervalMs);
  });

  it("also raises intensity, as a secondary cue", () => {
    const far = proximityCue(RADIUS_KM * 5, RADIUS_KM, "closer");
    const near = proximityCue(RADIUS_KM * 2.5, RADIUS_KM, "closer");
    expect(near.intensity).toBeGreaterThan(far.intensity);
  });

  it("makes going the wrong way feel like a shrug, not a reprimand", () => {
    const warmer = proximityCue(RADIUS_KM * 4, RADIUS_KM, "closer");
    const colder = proximityCue(RADIUS_KM * 4, RADIUS_KM, "further");
    expect(colder.intensity).toBeLessThan(warmer.intensity);
    expect(colder.intervalMs).toBeGreaterThan(warmer.intervalMs);
    expect(colder.kind).toBe("colder");
  });

  it("never pulses fast enough to blur into a continuous buzz", () => {
    for (let r = 1.01; r < 6; r += 0.05) {
      expect(proximityCue(RADIUS_KM * r, RADIUS_KM, "closer").intervalMs).toBeGreaterThanOrEqual(220);
    }
  });

  it("scales to any echo size, from a doorway to a county", () => {
    // Same relative position, same felt experience, whatever the radius.
    const doorway = proximityCue(0.05 * 3, 0.05, "closer");
    const county = proximityCue(60 * 3, 60, "closer");
    expect(doorway.intervalMs).toBe(county.intervalMs);
  });

  it("goes quiet beyond the guidance range", () => {
    expect(proximityCue(RADIUS_KM * 7, RADIUS_KM, "closer").kind).toBe("none");
  });
});

describe("ProximityGuide", () => {
  const target = echo();

  it("reports nothing when there is no target", () => {
    expect(new ProximityGuide().update(null)).toBeNull();
  });

  it("holds steady rather than flapping while someone stands still", () => {
    // A phone on a windowsill reports several metres of drift. Without smoothing the cue
    // would flip between warmer and colder and stop meaning anything.
    const guide = new ProximityGuide();
    guide.update({ echo: target, distanceKm: 0.15 });

    const jitter = [0.151, 0.149, 0.152, 0.148, 0.15];
    for (const distanceKm of jitter) {
      const guidance = guide.update({ echo: target, distanceKm })!;
      expect(guidance.trend).toBe("steady");
    }
  });

  it("notices a real approach", () => {
    const guide = new ProximityGuide();
    guide.update({ echo: target, distanceKm: 0.3 });
    let last = guide.update({ echo: target, distanceKm: 0.3 })!;
    for (const distanceKm of [0.25, 0.2, 0.15, 0.1]) {
      last = guide.update({ echo: target, distanceKm })!;
    }
    expect(last.trend).toBe("closer");
    expect(last.cue.kind).toBe("warmer");
  });

  it("notices walking away", () => {
    const guide = new ProximityGuide();
    guide.update({ echo: target, distanceKm: 0.1 });
    let last = guide.update({ echo: target, distanceKm: 0.1 })!;
    for (const distanceKm of [0.15, 0.2, 0.25]) {
      last = guide.update({ echo: target, distanceKm })!;
    }
    expect(last.trend).toBe("further");
  });

  it("starts fresh when the target changes", () => {
    // Distance to a different echo is not a continuation of the previous approach.
    const guide = new ProximityGuide();
    guide.update({ echo: target, distanceKm: 0.05 });
    const switched = guide.update({ echo: echo({ id: "other" }), distanceKm: 0.4 })!;
    expect(switched.trend).toBe("steady");
    expect(switched.echo.id).toBe("other");
  });

  it("forgets everything on reset", () => {
    const guide = new ProximityGuide();
    guide.update({ echo: target, distanceKm: 0.3 });
    guide.reset();
    expect(guide.update({ echo: target, distanceKm: 0.1 })!.trend).toBe("steady");
  });
});

describe("viewfinder", () => {
  const ahead = echo({ id: "ahead", at: north(HERE, 200) });
  const right = echo({ id: "right", at: east(HERE, 200) });
  const behind = echo({ id: "behind", at: north(HERE, -200) });

  it("puts something due north dead centre when facing north", () => {
    const [marker] = viewfinderMarkers(HERE, 0, [ahead]);
    expect(marker!.inFrame).toBe(true);
    expect(marker!.x).toBeCloseTo(0, 2);
    expect(marker!.turnDeg).toBeCloseTo(0, 1);
  });

  it("puts something to the east off the right of frame", () => {
    const [marker] = viewfinderMarkers(HERE, 0, [right]);
    expect(marker!.turnDeg).toBeCloseTo(90, 0);
    expect(marker!.inFrame).toBe(false);
    expect(marker!.x).toBeGreaterThan(1);
  });

  it("still reports what is behind you, so the UI can say which way to turn", () => {
    const [marker] = viewfinderMarkers(HERE, 0, [behind]);
    expect(marker!.inFrame).toBe(false);
    expect(Math.abs(marker!.turnDeg)).toBeCloseTo(180, 0);
  });

  it("follows the phone as it turns", () => {
    const facingNorth = viewfinderMarkers(HERE, 0, [right])[0]!;
    const facingEast = viewfinderMarkers(HERE, 90, [right])[0]!;
    expect(facingNorth.inFrame).toBe(false);
    expect(facingEast.inFrame).toBe(true);
    expect(facingEast.x).toBeCloseTo(0, 2);
  });

  it("draws a wider marker when the compass is less sure", () => {
    // A pin hovering confidently over the wrong building is worse than no pin at all.
    const confident = viewfinderMarkers(HERE, 0, [ahead], { headingAccuracyDeg: 3 })[0]!;
    const vague = viewfinderMarkers(HERE, 0, [ahead], { headingAccuracyDeg: 25 })[0]!;
    expect(vague.spread).toBeGreaterThan(confident.spread);
  });

  it("never claims more precision than the frame has", () => {
    const wild = viewfinderMarkers(HERE, 0, [ahead], { headingAccuracyDeg: 180 })[0]!;
    expect(wild.spread).toBeLessThanOrEqual(1);
  });

  it("respects a wider lens", () => {
    const narrow = viewfinderMarkers(HERE, 0, [right], { fovDeg: 60 })[0]!;
    const ultraWide = viewfinderMarkers(HERE, 0, [right], { fovDeg: 200 })[0]!;
    expect(narrow.inFrame).toBe(false);
    expect(ultraWide.inFrame).toBe(true);
  });

  it("drops anything beyond the viewing range", () => {
    const distant = echo({ id: "distant", at: north(HERE, 8000) });
    expect(viewfinderMarkers(HERE, 0, [distant])).toEqual([]);
  });

  it("orders nearest last, for painter's-algorithm rendering", () => {
    const near = echo({ id: "near", at: north(HERE, 60) });
    const far = echo({ id: "far", at: north(HERE, 900) });
    const markers = viewfinderMarkers(HERE, 0, [near, far]);
    expect(markers.map((m) => m.echo.id)).toEqual(["far", "near"]);
  });

  it("knows when the compass is too unreliable to point at anything", () => {
    // Among tall buildings it frequently is, and admitting it costs less trust than a
    // confident wrong answer.
    expect(headingIsUsable(8)).toBe(true);
    expect(headingIsUsable(40)).toBe(false);
  });
});

describe("position accuracy scales with the echo, not the travel mode", () => {
  const fix = (at: LatLng, tMs: number, accuracyM: number): Position => ({
    at,
    accuracyM,
    timestamp: tMs,
    source: "device-gnss",
  });

  const stand = (tracker: CaptureTracker, at: LatLng, library: Echo[], accuracyM: number) => {
    const events = [];
    for (let s = 0; s <= 15; s += 3) {
      events.push(...tracker.update(fix(at, START + s * 1000, accuracyM), library));
    }
    return events;
  };

  it("grants a precise fix almost no slack", () => {
    // 60m from a 50m doorway with a 3m fix: you are simply not there.
    const tracker = new CaptureTracker(ADULT);
    expect(stand(tracker, north(HERE, 60), [echo()], 3)).toEqual([]);
  });

  it("grants a vague fix some, but never more than half the radius", () => {
    // 70m from a 50m radius: even a wild accuracy claim cannot stretch reach past 75m.
    const generous = new CaptureTracker(ADULT);
    expect(stand(generous, north(HERE, 70), [echo()], 400)).toEqual([]);
  });

  it("scales automatically from a doorway to a motorway", () => {
    // The same 20m fix is decisive for a plaque and irrelevant for a 3km driving echo,
    // with no mode-specific tuning anywhere.
    const walk = new CaptureTracker(ADULT, { mode: "walking" });
    expect(stand(walk, north(HERE, 45), [echo()], 20)).toHaveLength(1);

    const drive = new CaptureTracker(ADULT, { mode: "driving" });
    const roadside = echo({ id: "roadside", triggerRadiusKm: 3 });
    expect(stand(drive, north(HERE, 2000), [roadside], 20)).toHaveLength(1);
  });

  it("refuses a fix vaguer than twice the target", () => {
    const tracker = new CaptureTracker(ADULT);
    // 120m accuracy against a 50m radius: could be anywhere on the block.
    expect(stand(tracker, HERE, [echo()], 120)).toEqual([]);
  });

  it("accepts a fix inside that ratio", () => {
    const tracker = new CaptureTracker(ADULT);
    expect(stand(tracker, HERE, [echo()], 80)).toHaveLength(1);
  });
});

describe("authoring guidance", () => {
  it("warns about a radius tighter than a phone can resolve on foot", () => {
    const impossible = makeEcho({ id: "impossible", at: HERE, triggerRadiusKm: 0.022 });
    const issues = validateEcho(impossible);
    expect(
      issues.some((i) => i.field === "point.triggerRadiusKm" && i.severity === "warning"),
    ).toBe(true);
  });

  it("is quiet about a workable street-scale radius", () => {
    const workable = makeEcho({ id: "workable", at: HERE, triggerRadiusKm: 0.05 });
    expect(validateEcho(workable).filter((i) => i.field === "point.triggerRadiusKm")).toEqual([]);
  });

  it("publishes an expected fix accuracy for every mode", () => {
    for (const mode of ["walking", "cycling", "driving", "rail", "flight"] as const) {
      expect(presetFor(mode).typicalFixAccuracyM).toBeGreaterThan(0);
    }
    // On foot is the hardest case: a street between tall buildings is the worst place a
    // phone can be asked where it is, and it is where echoes are densest.
    expect(presetFor("walking").typicalFixAccuracyM).toBeGreaterThan(
      presetFor("driving").typicalFixAccuracyM,
    );
  });
});
