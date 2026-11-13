import { describe, expect, it } from "vitest";
import type { Echo } from "@echofinders/core";
import {
  NEAR_KM,
  NEAR_SPACING_MS,
  NO_NEAR_MEMORY,
  nearToastFor,
  nextAfterSync,
  walkMinutes,
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

describe("toast B: Next", () => {
  it("the nearest echo still waiting, never the one that just synced", () => {
    const around = [near("synced", 0.01), near("heard", 0.1, false), near("far", 0.6), near("close", 0.46)];
    expect(nextAfterSync("synced", around, null, "walking")).toEqual({ echo: around[3]!.echo, label: "Next · 8 min walk" });
  });

  it("nothing past a walk: an echo 9.5 km off is not a next", () => {
    expect(nextAfterSync("synced", [near("synced", 0.01), near("far", 9.5)], null, "walking")).toBeNull();
    expect(nextAfterSync("synced", [near("far", 9.5), near("walkable", 4.9)], null, "walking")?.echo.id).toBe("walkable");
  });

  it("the planned walk's own next stop, when there is one", () => {
    const stop = { echo: echo("stop"), distanceKm: 0.35 };
    expect(nextAfterSync("synced", [near("close", 0.05)], stop, "walking")?.label).toBe("Next stop · 6 min");
    expect(nextAfterSync("synced", [near("close", 0.05)], stop, "walking")?.echo.id).toBe("stop");
  });

  it("nothing when nothing is left", () => {
    expect(nextAfterSync("synced", [near("synced", 0.01), near("done", 0.2, false)], null, "walking")).toBeNull();
    expect(nextAfterSync("stop", [], { echo: echo("stop"), distanceKm: 0 }, "walking")).toBeNull();
  });

  it("driving, it says distance as the echo bar does: metres close up, minutes driving further", () => {
    const around = [near("synced", 0.01), near("close", 0.065)];
    expect(nextAfterSync("synced", around, null, "driving")?.label).toBe("Next · 50 m");
    expect(nextAfterSync("synced", [near("town", 1.2)], null, "driving")?.label).toBe("Next · 1 min drive");
    expect(nextAfterSync("synced", [near("out", 6)], null, "driving")?.label).toBe("Next · 4 min drive");
  });

  it("driving, past a walk is still a next: the bar has no walking limit", () => {
    expect(nextAfterSync("synced", [near("synced", 0.01), near("far", 9.5)], null, "driving")?.label).toBe(
      "Next · 6 min drive",
    );
  });

  it("on foot it stays minutes walking", () => {
    expect(nextAfterSync("synced", [near("close", 0.065)], null, "walking")?.label).toBe("Next · 1 min walk");
  });

  it("minutes on foot, at least one", () => {
    expect(walkMinutes(0)).toBe(1);
    expect(walkMinutes(0.35)).toBe(6);
  });
});
