import { describe, expect, it } from "vitest";
import { checkEligibility } from "@echofinders/core";
import { KIDS_CATEGORIES, keepForKids, kidsMay } from "../../apps/prototype/src/kids-mode";
import { listenerFor } from "../../apps/prototype/src/use-journey";
import { isRareFind } from "../../apps/prototype/src/my-echoes";
import { LIBRARY } from "../../apps/prototype/src/library.generated";

/*
 * Kids mode is the Kids topic only (James, 2026-11-13, docs/adr/0021-topics-and-rare.md):
 * "A now, B over time". It supersedes "hide True crime in kids mode", which still holds.
 */
describe("Kids mode", () => {
  // The panel itself (All, Rare, Kids, and no True crime) is checked in audit:flows.
  it("offers only the Kids topic, never True crime", () => {
    expect(KIDS_CATEGORIES).toEqual(["kids"]);
  });

  it("shows only Kids echoes on the map, so no true crime pin anywhere", () => {
    const shown = LIBRARY.filter(kidsMay);
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every((e) => e.category === "kids")).toBe(true);
    expect(LIBRARY.filter((e) => e.category === "true-crime").some(kidsMay)).toBe(false);
  });

  it("plays only Kids echoes: the engine refuses every other topic, and still checks the age", () => {
    const kids = listenerFor(true, ["true-crime"]);
    expect(kids.categories).toEqual(["kids"]);
    const now = Date.now();
    const playable = LIBRARY.filter((e) => checkEligibility(e, { profile: kids, playAtMs: now }).eligible);
    expect(playable.length).toBeGreaterThan(0);
    expect(playable.every((e) => e.category === "kids" && e.minAge <= kids.age)).toBe(true);
    // Out of kids mode nothing changes: true crime is still the opt in it was.
    expect(listenerFor(false, ["true-crime"]).categories).toContain("true-crime");
    expect(listenerFor(false).categories).toContain("legend");
  });

  it("drops a picked True crime when kids mode turns on, and nothing left is All", () => {
    expect(keepForKids(new Set(["true-crime"]))).toBeNull();
    expect(keepForKids(new Set(["true-crime", "history"]))).toBeNull();
    expect([...(keepForKids(new Set(["true-crime", "kids"])) ?? [])]).toEqual(["kids"]);
    expect(keepForKids(null)).toBeNull();
  });

  it("has rare Kids echoes, which is why the kids panel offers Rare", () => {
    expect(LIBRARY.some((e) => kidsMay(e) && isRareFind(e))).toBe(true);
  });
});
