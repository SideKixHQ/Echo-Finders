import { describe, expect, it } from "vitest";
import {
  CAPABILITY_NEEDS,
  capabilitiesToRequest,
  featureAvailability,
  isUsable,
} from "../src/permissions/index.js";
import type { Capability, FeatureId } from "../src/permissions/index.js";

const levelOf = (granted: Capability[], feature: FeatureId) =>
  featureAvailability(granted).find((f) => f.feature === feature)!;

describe("the permission set itself", () => {
  it("treats exactly one capability as essential", () => {
    const essential = CAPABILITY_NEEDS.filter((n) => n.essential);
    expect(essential).toHaveLength(1);
    expect(essential[0]!.capability).toBe("location-foreground");
  });

  it("asks for nothing during onboarding except the one thing it cannot work without", () => {
    // A prompt fired before anyone knows what the app does is the commonest way to lose a
    // capability permanently — on iOS a refusal cannot be re-prompted.
    const upfront = CAPABILITY_NEEDS.filter((n) => n.askAt === "onboarding");
    expect(upfront.map((n) => n.capability)).toEqual(["location-foreground"]);
  });

  it("asks for notifications last, once there is something to notify about", () => {
    const notifications = CAPABILITY_NEEDS.find((n) => n.capability === "notifications")!;
    expect(notifications.askAt).toBe("after-first-capture");
  });

  it("never requests anything it cannot justify", () => {
    // No microphone, no contacts, no photo library, no advertising identifier.
    const asked = CAPABILITY_NEEDS.map((n) => n.capability);
    for (const unjustifiable of ["microphone", "contacts", "photos", "advertising-id"]) {
      expect(asked).not.toContain(unjustifiable);
    }
  });

  it("explains every capability in its own words, and what refusing costs", () => {
    for (const need of CAPABILITY_NEEDS) {
      expect(need.rationale.trim().length).toBeGreaterThan(20);
      expect(need.ifRefused.trim().length).toBeGreaterThan(20);
    }
  });
});

describe("the app works on foreground location alone", () => {
  const minimal: Capability[] = ["location-foreground"];

  it("is usable", () => {
    expect(isUsable(minimal)).toBe(true);
  });

  it("can still browse and capture", () => {
    // This is the commitment, not an aspiration: refusal rates for everything else are
    // high, and an experience that collapses without them is one most people never get.
    expect(levelOf(minimal, "map-browsing").level).toBe("full");
    expect(levelOf(minimal, "capture-on-screen").level).toBe("full");
  });

  it("offers a real fallback for everything it cannot do", () => {
    for (const state of featureAvailability(minimal)) {
      if (state.level !== "full") expect(state.fallback.length).toBeGreaterThan(10);
    }
  });

  it("is not usable with nothing granted", () => {
    expect(isUsable([])).toBe(false);
    expect(levelOf([], "capture-on-screen").level).toBe("unavailable");
  });
});

describe("degraded rather than broken", () => {
  it("runs hands-free without haptics, just less well", () => {
    const state = levelOf(["location-foreground", "location-background"], "capture-hands-free");
    expect(state.level).toBe("degraded");
    expect(state.missing).toContain("haptics");
  });

  it("is fully hands-free once it can also buzz", () => {
    const state = levelOf(
      ["location-foreground", "location-background", "haptics"],
      "capture-hands-free",
    );
    expect(state.level).toBe("full");
    expect(state.missing).toEqual([]);
  });

  it("falls back to a list when the camera view cannot run", () => {
    const state = levelOf(["location-foreground", "camera"], "camera-viewfinder");
    expect(state.level).toBe("unavailable");
    expect(state.missing).toContain("orientation");
    expect(state.fallback).toMatch(/list/i);
  });

  it("needs both background location and notifications to alert someone passing by", () => {
    expect(levelOf(["location-foreground", "notifications"], "passing-alerts").level).toBe(
      "unavailable",
    );
    expect(
      levelOf(["location-foreground", "notifications", "location-background"], "passing-alerts")
        .level,
    ).toBe("full");
  });

  it("names what is missing, so the UI can offer the fix", () => {
    const state = levelOf(["location-foreground"], "haptic-guidance");
    expect(state.missing).toEqual(["haptics"]);
  });
});

describe("asking at the right moment", () => {
  it("requests background location when someone first goes hands-free, not before", () => {
    const asks = capabilitiesToRequest("first-hands-free", ["location-foreground"]);
    expect(asks.map((n) => n.capability)).toEqual(["location-background"]);
  });

  it("requests camera and compass together at the viewfinder", () => {
    const asks = capabilitiesToRequest("first-viewfinder", ["location-foreground"]);
    expect(asks.map((n) => n.capability).sort()).toEqual(["camera", "orientation"]);
  });

  it("does not re-ask for something already granted", () => {
    const asks = capabilitiesToRequest("first-viewfinder", [
      "location-foreground",
      "camera",
      "orientation",
    ]);
    expect(asks).toEqual([]);
  });

  it("asks for everything eventually, across all the moments", () => {
    const moments = ["onboarding", "first-walk", "first-hands-free", "first-viewfinder", "after-first-capture"] as const;
    const asked = moments.flatMap((m) => capabilitiesToRequest(m, []).map((n) => n.capability));
    expect(new Set(asked).size).toBe(CAPABILITY_NEEDS.length);
  });
});
