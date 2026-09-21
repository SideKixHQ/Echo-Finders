import { describe, expect, it } from "vitest";
import {
  PRIVACY_DEFAULTS,
  capabilitiesImpliedBy,
  deleteData,
  exportCollection,
  holdsPersonalLocation,
  redactRecord,
} from "../src/privacy/settings.js";
import { WalkSession } from "../src/session/walk.js";
import type { LocationSource } from "../src/session/adapters.js";
import type { LatLng, Position } from "../src/types.js";
import type { CaptureRecord } from "../src/capture/types.js";
import type { PrivacySettings } from "../src/privacy/settings.js";
import { ADULT, makeEcho } from "./fixtures.js";

const HERE: LatLng = { lat: 40.7069, lng: -74.0113 };
const START = Date.parse("2026-06-15T17:00:00Z");

const record = (overrides: Partial<CaptureRecord> = {}): CaptureRecord => ({
  echoId: "federal-hall",
  capturedAt: "2026-06-14T14:32:07.000Z",
  stoodAt: { lat: 40.70691, lng: -74.01128 },
  distanceKm: 0.004,
  ...overrides,
});

class FakeLocation implements LocationSource {
  private onFix: ((p: Position) => void) | null = null;
  watch(onFix: (p: Position) => void) {
    this.onFix = onFix;
    return () => {
      this.onFix = null;
    };
  }
  emit(p: Position) {
    this.onFix?.(p);
  }
}

const fix = (at: LatLng, tMs: number): Position => ({
  at,
  accuracyM: 5,
  timestamp: tMs,
  source: "device-gnss",
});

describe("defaults are cautious", () => {
  it("leaves hands-free off until it is asked for", () => {
    expect(PRIVACY_DEFAULTS.handsFree).toBe(false);
  });

  it("leaves everything that serves us rather than the listener off", () => {
    expect(PRIVACY_DEFAULTS.analytics).toBe(false);
    expect(PRIVACY_DEFAULTS.personalisedSponsorship).toBe(false);
  });

  it("keeps the collection, because that is what capture means", () => {
    expect(PRIVACY_DEFAULTS.keepCollection).toBe(true);
  });

  it("does not record where the person stood unless they say so", () => {
    // The distinction the whole module exists for: a collection is about echoes, a
    // standing position is about a person.
    expect(PRIVACY_DEFAULTS.recordPrecisePlaces).toBe(false);
  });
});

describe("a collection is not a location history", () => {
  it("keeps which echo and when, by default", () => {
    const redacted = redactRecord(record(), PRIVACY_DEFAULTS)!;
    expect(redacted.echoId).toBe("federal-hall");
    expect(redacted.capturedAt).toBe("2026-06-14T14:32:07.000Z");
  });

  it("drops the standing position by default", () => {
    const redacted = redactRecord(record(), PRIVACY_DEFAULTS)!;
    expect(holdsPersonalLocation(redacted)).toBe(false);
  });

  it("keeps it when the listener opted in", () => {
    const opted: PrivacySettings = { ...PRIVACY_DEFAULTS, recordPrecisePlaces: true };
    const kept = redactRecord(record(), opted)!;
    expect(holdsPersonalLocation(kept)).toBe(true);
    expect(kept.stoodAt.lat).toBeCloseTo(40.70691, 5);
  });

  it("stores nothing at all when the collection is off", () => {
    const off: PrivacySettings = { ...PRIVACY_DEFAULTS, keepCollection: false };
    expect(redactRecord(record(), off)).toBeNull();
  });

  it("preserves whether something was listened to", () => {
    const heard = record({ heardAt: "2026-06-14T20:00:00.000Z" });
    expect(redactRecord(heard, PRIVACY_DEFAULTS)!.heardAt).toBe("2026-06-14T20:00:00.000Z");
  });
});

describe("the session applies privacy when writing, not when reading", () => {
  const walk = (privacy?: PrivacySettings) => {
    const location = new FakeLocation();
    const echo = makeEcho({ id: "target", at: HERE, triggerRadiusKm: 0.05 });
    const session = new WalkSession([echo], ADULT, { location }, privacy ? { privacy } : {});
    session.start();
    for (let s = 0; s <= 15; s += 3) location.emit(fix(HERE, START + s * 1000));
    return session;
  };

  it("captures normally with cautious defaults", () => {
    expect(walk().collection).toHaveLength(1);
  });

  it("persists no personal position by default", () => {
    // Data never written cannot leak, cannot be subpoenaed, and cannot be forgotten in a
    // backup — a stronger guarantee than any rule about data we did keep.
    for (const stored of walk().collection) {
      expect(holdsPersonalLocation(stored)).toBe(false);
    }
  });

  it("persists it when the listener asked for a personal map", () => {
    const session = walk({ ...PRIVACY_DEFAULTS, recordPrecisePlaces: true });
    expect(holdsPersonalLocation(session.collection[0]!)).toBe(true);
  });

  it("persists nothing when the collection is switched off, but still captures", () => {
    // The walk still works; it simply leaves no trace.
    const session = walk({ ...PRIVACY_DEFAULTS, keepCollection: false });
    expect(session.collection).toEqual([]);
    expect(session.tracker.stateOf("target")).toBe("captured");
  });
});

describe("deletion means deleted", () => {
  const records = [record(), record({ echoId: "second" }), record({ echoId: "third" })];

  it("removes every standing position", () => {
    const result = deleteData(records, "precise-places");
    expect(result.personalLocationsRemaining).toBe(0);
    expect(result.removed).toBe(3);
  });

  it("keeps the collection when only places were deleted", () => {
    const result = deleteData(records, "precise-places");
    expect(result.records).toHaveLength(3);
    expect(result.records.map((r) => r.echoId)).toContain("second");
  });

  it("removes everything when the collection is deleted", () => {
    const result = deleteData(records, "collection");
    expect(result.records).toEqual([]);
    expect(result.personalLocationsRemaining).toBe(0);
  });

  it("leaves no residue either way", () => {
    // This is the promise that quietly rots as a codebase grows, so it is asserted rather
    // than trusted.
    for (const scope of ["precise-places", "collection"] as const) {
      expect(deleteData(records, scope).personalLocationsRemaining).toBe(0);
    }
  });

  it("copes with nothing to delete", () => {
    expect(deleteData([], "collection").removed).toBe(0);
  });
});

describe("export", () => {
  it("hands back everything stored, in plain JSON", () => {
    // A right to your data that needs our app to read it is not much of a right.
    const exported = exportCollection([record()], START);
    expect(exported.format).toBe("echofinders.collection.v1");
    expect(exported.records).toHaveLength(1);
    expect(() => JSON.parse(JSON.stringify(exported))).not.toThrow();
  });

  it("is dated", () => {
    expect(exportCollection([], START).exportedAt).toBe(new Date(START).toISOString());
  });

  it("exports nothing extra", () => {
    const exported = exportCollection([record()], START);
    expect(Object.keys(exported).sort()).toEqual(["exportedAt", "format", "records"]);
  });
});

describe("permissions follow settings", () => {
  it("asks for nothing beyond foreground location by default", () => {
    // An app requesting background location while hands-free is off is asking for
    // something it has no use for, and people are right to notice.
    expect([...capabilitiesImpliedBy(PRIVACY_DEFAULTS)]).toEqual(["location-foreground"]);
  });

  it("asks for background location only once hands-free is on", () => {
    const needed = capabilitiesImpliedBy({ ...PRIVACY_DEFAULTS, handsFree: true });
    expect(needed.has("location-background")).toBe(true);
  });

  it("drops the request again when hands-free is switched off", () => {
    expect(
      capabilitiesImpliedBy({ ...PRIVACY_DEFAULTS, handsFree: false }).has("location-background"),
    ).toBe(false);
  });
});
