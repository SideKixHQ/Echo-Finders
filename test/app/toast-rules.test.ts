import { describe, expect, it } from "vitest";
import type { Echo } from "@echofinders/core";
import {
  NEAR_KM,
  NEAR_SPACING_MS,
  NO_NEAR_MEMORY,
  nearToastFor,
  rememberNear,
  toastDistance,
  unlockLine,
} from "../../apps/prototype/src/toast-rules";

const echo = (id: string, radiusKm = 0.04) =>
  ({ id, title: id, point: { at: { lat: 0, lng: 0 }, place: "", triggerRadiusKm: radiusKm } }) as unknown as Echo;
const near = (id: string, km: number, sealed = true, radiusKm = 0.04) => ({ echo: echo(id, radiusKm), distanceKm: km, sealed });
const NOW = 1_800_000_000_000;

describe("toast A: an echo is close", () => {
  it("names an echo within 150 m and none beyond", () => {
    expect(nearToastFor([near("a", 0.08)], NO_NEAR_MEMORY, NOW, false)?.echo.id).toBe("a");
    expect(nearToastFor([near("a", NEAR_KM)], NO_NEAR_MEMORY, NOW, false)?.echo.id).toBe("a");
    expect(nearToastFor([near("a", 0.151)], NO_NEAR_MEMORY, NOW, false)).toBeNull();
  });

  it("picks the nearest", () => {
    expect(nearToastFor([near("far", 0.14), near("close", 0.07)], NO_NEAR_MEMORY, NOW, false)?.echo.id).toBe("close");
  });

  it("only for echoes you have not synced or heard", () => {
    expect(nearToastFor([near("a", 0.08, false)], NO_NEAR_MEMORY, NOW, false)).toBeNull();
    expect(nearToastFor([near("a", 0.08)], NO_NEAR_MEMORY, NOW, false, (id) => id === "a")).toBeNull();
  });

  it("not once you are inside its radius: that one is syncing", () => {
    expect(nearToastFor([near("a", 0.05, true, 0.09)], NO_NEAR_MEMORY, NOW, false)).toBeNull();
  });

  it("once per echo", () => {
    const memory = { shown: ["a"], lastAt: NOW - NEAR_SPACING_MS * 10 };
    expect(nearToastFor([near("a", 0.08)], memory, NOW, false)).toBeNull();
    expect(nearToastFor([near("a", 0.08), near("b", 0.12)], memory, NOW, false)?.echo.id).toBe("b");
  });

  it("never while one is playing", () => {
    expect(nearToastFor([near("a", 0.08)], NO_NEAR_MEMORY, NOW, true)).toBeNull();
  });

  it("at most one every five minutes", () => {
    const memory = rememberNear(NO_NEAR_MEMORY, "a", NOW);
    expect(nearToastFor([near("b", 0.08)], memory, NOW + NEAR_SPACING_MS - 1, false)).toBeNull();
    expect(nearToastFor([near("b", 0.08)], memory, NOW + NEAR_SPACING_MS, false)?.echo.id).toBe("b");
  });

  it("remembers each echo once", () => {
    const m = rememberNear(rememberNear(NO_NEAR_MEMORY, "a", NOW), "a", NOW + 1);
    expect(m).toEqual({ shown: ["a"], lastAt: NOW + 1 });
  });
});

describe("what the toasts say", () => {
  it("distances", () => {
    expect(toastDistance(0.0812)).toBe("80 m");
    expect(toastDistance(0.002)).toBe("5 m");
    expect(toastDistance(1.24)).toBe("1.2 km");
    expect(toastDistance(12.4)).toBe("12 km");
  });

  it("the real sync radius, said for the mode", () => {
    expect(unlockLine(echo("a", 0.04), "walking")).toBe("Walk within 40 m to unlock it");
    expect(unlockLine(echo("a", 0.09), "walking")).toBe("Walk within 90 m to unlock it");
    expect(unlockLine(echo("a", 3), "driving")).toBe("Get within 3 km to unlock it");
  });
});
