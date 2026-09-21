import { describe, expect, it } from "vitest";
import { CaptureTracker, rarityOf, rarityReasons } from "../src/capture/index.js";
import type { Echo, LatLng, Position } from "../src/types.js";
import { ADULT, CHILD, makeEcho } from "./fixtures.js";
import type { EchoDraft } from "./fixtures.js";

const WALL_STREET: LatLng = { lat: 40.7069, lng: -74.0113 };
const START = Date.parse("2026-06-15T17:00:00Z");

/** A point `metres` north of `from`. One degree of latitude is ~111km everywhere. */
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

const plaque = (overrides: Partial<EchoDraft> = {}) =>
  makeEcho({
    id: "federal-hall",
    at: WALL_STREET,
    triggerRadiusKm: 0.05,
    visibility: "at-hand",
    ...overrides,
  });

/** Stand still at `at` for long enough to complete the dwell. */
function standAt(
  tracker: CaptureTracker,
  at: LatLng,
  library: Echo[],
  { dwellS = 15, accuracyM = 5 }: { dwellS?: number; accuracyM?: number } = {},
) {
  const events = [];
  for (let s = 0; s <= dwellS; s += 3) {
    events.push(...tracker.update(fix(at, START + s * 1000, accuracyM), library));
  }
  return events;
}

describe("capture by arrival", () => {
  it("opens an echo when the listener stands in its place", () => {
    const tracker = new CaptureTracker(ADULT);
    const library = [plaque()];
    const events = standAt(tracker, WALL_STREET, library);

    expect(events).toHaveLength(1);
    expect(events[0]!.echo.id).toBe("federal-hall");
    expect(tracker.stateOf("federal-hall")).toBe("captured");
  });

  it("does not open one from across the street", () => {
    const tracker = new CaptureTracker(ADULT);
    const library = [plaque()];
    expect(standAt(tracker, north(WALL_STREET, 400), library)).toEqual([]);
    expect(tracker.stateOf("federal-hall")).toBe("sealed");
  });

  it("records where the listener actually stood, not where the echo is", () => {
    // The collection is a record of a person's movements, which is the half worth keeping.
    const tracker = new CaptureTracker(ADULT);
    const standing = north(WALL_STREET, 30);
    const [event] = standAt(tracker, standing, [plaque()]);

    expect(event!.record.stoodAt).toEqual(standing);
    expect(event!.record.distanceKm).toBeGreaterThan(0);
    expect(event!.record.capturedAt).toMatch(/^2026-06-15T/);
  });

  it("never opens the same echo twice", () => {
    const tracker = new CaptureTracker(ADULT);
    const library = [plaque()];
    expect(standAt(tracker, WALL_STREET, library)).toHaveLength(1);
    expect(standAt(tracker, WALL_STREET, library)).toEqual([]);
  });

  it("opens nothing on an ordinary walk down an empty street", () => {
    const tracker = new CaptureTracker(ADULT);
    expect(standAt(tracker, { lat: 40.75, lng: -73.99 }, [plaque()])).toEqual([]);
  });
});

describe("arriving versus passing through", () => {
  it("does not open on a single fix in range", () => {
    // Someone on a bus would otherwise sweep a whole route without going anywhere.
    const tracker = new CaptureTracker(ADULT);
    expect(tracker.update(fix(WALL_STREET, START), [plaque()])).toEqual([]);
  });

  it("reports progress while the listener is arriving", () => {
    const tracker = new CaptureTracker(ADULT, { dwellS: 10 });
    tracker.update(fix(WALL_STREET, START), [plaque()]);
    tracker.update(fix(WALL_STREET, START + 5000), [plaque()]);

    expect(tracker.opening).toHaveLength(1);
    expect(tracker.opening[0]!.progress).toBeCloseTo(0.5, 1);
  });

  it("starts the timer over if they leave and come back", () => {
    const tracker = new CaptureTracker(ADULT, { dwellS: 10 });
    const library = [plaque()];

    tracker.update(fix(WALL_STREET, START), library);
    tracker.update(fix(WALL_STREET, START + 8000), library);
    // Walks 300m away over four minutes, then back. Timings have to be walkable, or the
    // plausibility check rightly rejects the whole thing as teleportation.
    tracker.update(fix(north(WALL_STREET, 300), START + 248_000), library);
    // Returns: the 8 seconds of credit must not carry over.
    expect(tracker.update(fix(WALL_STREET, START + 488_000), library)).toEqual([]);
    expect(tracker.opening[0]!.progress).toBeLessThan(0.2);
  });

  it("clears the opening list once nothing is nearby", () => {
    const tracker = new CaptureTracker(ADULT, { dwellS: 30 });
    const library = [plaque()];
    tracker.update(fix(WALL_STREET, START), library);
    expect(tracker.opening).toHaveLength(1);
    // 900m over twelve minutes: an ordinary walk away.
    tracker.update(fix(north(WALL_STREET, 900), START + 720_000), library);
    expect(tracker.opening).toEqual([]);
  });
});

describe("tapping to capture", () => {
  it("skips the dwell, because a tap is intent", () => {
    const tracker = new CaptureTracker(ADULT);
    const result = tracker.attempt(plaque(), fix(WALL_STREET, START));
    expect(result.captured).toBe(true);
    expect(tracker.stateOf("federal-hall")).toBe("captured");
  });

  it("cannot override range", () => {
    const tracker = new CaptureTracker(ADULT);
    const result = tracker.attempt(plaque(), fix(north(WALL_STREET, 500), START));
    expect(result.captured).toBe(false);
    expect(result.refusal).toBe("out-of-range");
  });

  it("cannot override the age gate", () => {
    const tracker = new CaptureTracker(CHILD);
    const grim = plaque({ minAge: 18, category: "history" });
    expect(tracker.attempt(grim, fix(WALL_STREET, START)).refusal).toBe("not-eligible");
  });

  it("reports an echo already taken", () => {
    const tracker = new CaptureTracker(ADULT);
    tracker.attempt(plaque(), fix(WALL_STREET, START));
    expect(tracker.attempt(plaque(), fix(WALL_STREET, START + 1000)).refusal).toBe(
      "already-captured",
    );
  });
});

describe("position quality", () => {
  it("grants a little slack for an imprecise fix", () => {
    const tracker = new CaptureTracker(ADULT);
    const city = plaque({ id: "city", triggerRadiusKm: 0.2 });
    // 240m away, with a 60m accuracy circle: plausibly inside a 200m radius.
    const events = standAt(tracker, north(WALL_STREET, 240), [city], { accuracyM: 60 });
    expect(events).toHaveLength(1);
  });

  it("will not open a doorway from a fix that cannot resolve a doorway", () => {
    // A 300m accuracy circle is not evidence of standing in a 50m radius.
    const tracker = new CaptureTracker(ADULT);
    const library = [plaque()];
    const events = [];
    for (let s = 0; s <= 15; s += 3) {
      events.push(...tracker.update(fix(WALL_STREET, START + s * 1000, 300), library));
    }
    expect(events).toEqual([]);
  });

  it("does not let a vague fix open everything within its circle", () => {
    const tracker = new CaptureTracker(ADULT);
    const far = plaque({ id: "far", triggerRadiusKm: 0.05 });
    // 400m away claiming 500m accuracy: the allowance is capped well below that.
    const events = [];
    for (let s = 0; s <= 15; s += 3) {
      events.push(...tracker.update(fix(north(WALL_STREET, 400), START + s * 1000, 500), [far]));
    }
    expect(events).toEqual([]);
  });
});

describe("plausible movement", () => {
  it("refuses a capture the listener could not have walked to", () => {
    const tracker = new CaptureTracker(ADULT, { mode: "walking" });
    tracker.update(fix({ lat: 40.7069, lng: -74.0113 }, START), []);
    // 5km away, two seconds later.
    const teleported = tracker.attempt(
      plaque({ id: "elsewhere", at: { lat: 40.75, lng: -74.0113 } }),
      fix({ lat: 40.75, lng: -74.0113 }, START + 2000),
    );
    expect(teleported.refusal).toBe("implausible-movement");
  });

  it("allows a brisk walk, and a sprint for a bus", () => {
    const tracker = new CaptureTracker(ADULT, { mode: "walking" });
    tracker.update(fix(WALL_STREET, START), []);
    // 100m in 30 seconds is 12 km/h — fast, entirely possible.
    const sprint = tracker.attempt(
      plaque({ at: north(WALL_STREET, 100) }),
      fix(north(WALL_STREET, 100), START + 30_000),
    );
    expect(sprint.captured).toBe(true);
  });

  it("scales the ceiling to the travel mode", () => {
    // The same movement that is impossible on foot is unremarkable in a car.
    const driving = new CaptureTracker(ADULT, { mode: "driving" });
    driving.update(fix({ lat: 40.7069, lng: -74.0113 }, START), []);
    const result = driving.attempt(
      plaque({ id: "uptown", at: { lat: 40.75, lng: -74.0113 }, triggerRadiusKm: 1 }),
      fix({ lat: 40.75, lng: -74.0113 }, START + 60_000),
    );
    expect(result.captured).toBe(true);
  });
});

describe("captured versus heard", () => {
  it("separates standing there from listening", () => {
    // Eight echoes on a half-hour walk is an hour of listening; forcing the two together
    // would mean choosing between finishing a story and moving on.
    const tracker = new CaptureTracker(ADULT);
    standAt(tracker, WALL_STREET, [plaque()]);
    expect(tracker.stateOf("federal-hall")).toBe("captured");

    expect(tracker.markHeard("federal-hall", START + 86_400_000)).toBe(true);
    expect(tracker.stateOf("federal-hall")).toBe("heard");
  });

  it("will not mark something heard twice", () => {
    const tracker = new CaptureTracker(ADULT);
    standAt(tracker, WALL_STREET, [plaque()]);
    tracker.markHeard("federal-hall", START);
    expect(tracker.markHeard("federal-hall", START + 1000)).toBe(false);
  });

  it("will not mark an uncaptured echo heard", () => {
    expect(new CaptureTracker(ADULT).markHeard("never-been-there")).toBe(false);
  });
});

describe("the collection survives", () => {
  it("restores from persisted records", () => {
    const first = new CaptureTracker(ADULT);
    standAt(first, WALL_STREET, [plaque()]);

    const restored = CaptureTracker.restore(ADULT, first.records);
    expect(restored.stateOf("federal-hall")).toBe("captured");
    expect(restored.records).toHaveLength(1);
  });

  it("does not re-open what was already collected", () => {
    const first = new CaptureTracker(ADULT);
    standAt(first, WALL_STREET, [plaque()]);
    const restored = CaptureTracker.restore(ADULT, first.records);
    expect(standAt(restored, WALL_STREET, [plaque()])).toEqual([]);
  });
});

describe("rarity is earned, not assigned", () => {
  it("calls a city-scale echo common", () => {
    expect(rarityOf(makeEcho({ id: "c", at: WALL_STREET, triggerRadiusKm: 60 }))).toBe("common");
  });

  it("counts having to find the exact spot", () => {
    expect(rarityOf(plaque())).not.toBe("common");
  });

  it("counts being a long way from anywhere", () => {
    const remote = makeEcho({
      id: "remote",
      at: { lat: 63.07, lng: -151.0 },
      triggerRadiusKm: 5,
      remoteness: 0.9,
    });
    expect(rarityOf(remote)).toBe("uncommon");
  });

  it("stacks difficulty into something singular", () => {
    const hard = makeEcho({
      id: "hard",
      at: { lat: 63.07, lng: -151.0 },
      triggerRadiusKm: 0.04,
      remoteness: 0.95,
      hours: { fromHour: 22, toHour: 3 },
    });
    expect(rarityOf(hard)).toBe("singular");
  });

  it("explains itself, so the collection screen can say why", () => {
    const hard = makeEcho({
      id: "hard",
      at: WALL_STREET,
      triggerRadiusKm: 0.04,
      remoteness: 0.95,
      hours: { fromHour: 22, toHour: 3 },
    });
    const reasons = rarityReasons(hard);
    expect(reasons).toContain("You have to find the exact spot");
    expect(reasons).toContain("Only open at certain hours");
    expect(reasons).toContain("A long way from anywhere");
  });

  it("gives an ordinary echo nothing to boast about", () => {
    expect(rarityReasons(makeEcho({ id: "c", at: WALL_STREET, triggerRadiusKm: 60 }))).toEqual([]);
  });
});
