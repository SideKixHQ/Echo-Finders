import { describe, expect, it } from "vitest";
import { checkContribution, effectiveRadiusKm } from "../src/content/contributions.js";
import { validateEcho } from "../src/content/validate.js";
import { checkEligibility } from "../src/ranking/score.js";
import { findEchoesAlongRoute } from "../src/geo/corridor.js";
import { presetFor } from "../src/modes.js";
import { TRUST_REACH_KM } from "../src/types.js";
import type { Contribution, Echo, TrustLevel } from "../src/types.js";
import type { EchoDraft } from "./fixtures.js";
import { ADULT, MANHATTAN_WALK, makeEcho } from "./fixtures.js";

const NOON = Date.parse("2026-06-15T17:00:00Z");
const WALL_STREET = { lat: 40.7069, lng: -74.0113 };

const contribution = (overrides: Partial<Contribution> = {}): Contribution => ({
  contributorId: "c-8821",
  attribution: "Marcus, who grew up on this street",
  submittedAt: "2026-09-20T10:00:00.000Z",
  trust: "new",
  ownVoice: true,
  ...overrides,
});

const personal = (overrides: Partial<EchoDraft> = {}): Echo =>
  makeEcho({
    id: "grandmother-corner",
    at: WALL_STREET,
    triggerRadiusKm: 0.08,
    category: "culture-food",
    provenance: "personal",
    certainty: "testimony",
    contribution: contribution(),
    sources: [],
    ...overrides,
  });

const errors = (echo: Echo) => validateEcho(echo).filter((i) => i.severity === "error");

describe("testimony is a different kind of claim", () => {
  it("accepts a memory with no sources at all", () => {
    // "My grandmother met my grandfather here" is not a claim about the world; demanding a
    // citation for it would be a category error.
    expect(errors(personal())).toEqual([]);
  });

  it("still demands sources from the editorial library", () => {
    const editorial = makeEcho({ id: "e", at: WALL_STREET, sources: [] });
    expect(errors(editorial).some((i) => i.field === "sources")).toBe(true);
  });

  it("insists testimony is labelled as such", () => {
    // It can neither be "documented" nor be faulted for failing to be.
    const mislabelled = personal({ certainty: "documented" });
    expect(checkContribution(mislabelled).some((i) => i.field === "certainty")).toBe(true);
  });

  it("does not demand an uncertainty note from testimony", () => {
    expect(errors(personal()).some((i) => i.field === "certaintyNote")).toBe(false);
  });
});

describe("a contribution must be attributable", () => {
  it("refuses one with nobody behind it", () => {
    const anonymous = personal({ contribution: undefined });
    expect(checkContribution(anonymous)[0]!.field).toBe("contribution");
  });

  it("requires something to read out", () => {
    const unnamed = personal({ contribution: contribution({ attribution: "  " }) });
    expect(checkContribution(unnamed).some((i) => i.field === "contribution.attribution")).toBe(true);
  });

  it("requires an internal id, so it stays accountable", () => {
    const untraceable = personal({ contribution: contribution({ contributorId: "" }) });
    expect(
      checkContribution(untraceable).some((i) => i.field === "contribution.contributorId"),
    ).toBe(true);
  });
});

describe("hard limits on what a contribution may be", () => {
  it("refuses true crime outright", () => {
    // Real people, real harm, and a legal exposure a contribution cannot carry.
    const crime = personal({ category: "true-crime", minAge: 16 });
    expect(checkContribution(crime).some((i) => i.field === "category")).toBe(true);
  });

  it.each([
    ["a web address", "Come see us at https://example.com for more"],
    ["an email", "Write to me at marcus@example.com about it"],
    ["a phone number", "Give us a ring on +1 212 555 0148"],
    ["a social handle", "Follow @marcuswalks for more of these"],
  ])("refuses %s in the script", (_label, script) => {
    // A contact detail in a place-anchored audio message is either advertising or an
    // attempt to move someone into a private channel.
    expect(checkContribution(personal({ script })).some((i) => i.field === "script")).toBe(true);
  });

  it("leaves an ordinary memory alone", () => {
    const memory = personal({
      script:
        "My grandmother worked in the building on the corner for thirty years. She met my grandfather on the steps in 1961, in the rain, and neither of them had an umbrella.",
    });
    expect(checkContribution(memory)).toEqual([]);
  });

  it("applies none of this to the editorial library", () => {
    const editorial = makeEcho({
      id: "e",
      at: WALL_STREET,
      script: "See https://www.nps.gov/feha for the full record.",
    });
    expect(checkContribution(editorial)).toEqual([]);
  });
});

describe("reach is earned", () => {
  it("holds a first contribution to fifty metres, whatever was typed", () => {
    // Most of the moderation system in one number: spam has no payoff when nobody hears it.
    expect(effectiveRadiusKm(personal({ triggerRadiusKm: 5 }))).toBe(TRUST_REACH_KM.new);
  });

  it("widens as a contributor earns it", () => {
    const levels: TrustLevel[] = ["new", "established", "trusted", "institution"];
    const reaches = levels.map((trust) =>
      effectiveRadiusKm(personal({ triggerRadiusKm: 10, contribution: contribution({ trust }) })),
    );
    for (let i = 1; i < reaches.length; i++) {
      expect(reaches[i]!).toBeGreaterThan(reaches[i - 1]!);
    }
  });

  it("never exceeds what the contributor actually asked for", () => {
    const tiny = personal({
      triggerRadiusKm: 0.03,
      contribution: contribution({ trust: "institution" }),
    });
    expect(effectiveRadiusKm(tiny)).toBeCloseTo(0.03, 5);
  });

  it("leaves the editorial library at its authored radius", () => {
    const editorial = makeEcho({ id: "e", at: WALL_STREET, triggerRadiusKm: 60 });
    expect(effectiveRadiusKm(editorial)).toBe(60);
  });

  it("actually narrows what a route picks up", () => {
    // 129m off the route: outside a new contributor's 50m reach, inside the walking
    // corridor, and well inside the 2km its author asked for. So what decides whether it
    // is heard is trust alone.
    const far = personal({
      id: "far",
      at: { lat: 40.7069, lng: -74.0131 },
      triggerRadiusKm: 2,
    });
    expect(findEchoesAlongRoute(MANHATTAN_WALK, [far])).toEqual([]);

    const trusted = makeEcho({ ...far, contribution: contribution({ trust: "institution" }) });
    expect(findEchoesAlongRoute(MANHATTAN_WALK, [trusted])).toHaveLength(1);
  });
});

describe("where contributions are carried", () => {
  const base = { profile: ADULT, playAtMs: NOON };

  it("keeps them off a licensed airline service", () => {
    // An airline will not put unvetted passenger content in front of a cabin.
    const result = checkEligibility(personal(), { ...base, mode: "flight" });
    expect(result.reasons).toContain("provenance-not-carried");
  });

  it("carries them on foot, where they are the point", () => {
    expect(checkEligibility(personal(), { ...base, mode: "walking" }).eligible).toBe(true);
  });

  it("carries the editorial library everywhere", () => {
    const editorial = makeEcho({ id: "e", at: WALL_STREET });
    for (const mode of ["flight", "rail", "driving", "walking"] as const) {
      expect(checkEligibility(editorial, { ...base, mode }).eligible).toBe(true);
    }
  });

  it("carries vetted partners on a flight", () => {
    const museum = makeEcho({ id: "m", at: WALL_STREET, provenance: "partner" });
    expect(checkEligibility(museum, { ...base, mode: "flight" }).eligible).toBe(true);
  });

  it("lets a listener override the mode's default", () => {
    const strict = { ...ADULT, provenances: ["editorial"] as const };
    const result = checkEligibility(personal(), { profile: strict, playAtMs: NOON, mode: "walking" });
    expect(result.reasons).toContain("provenance-not-carried");
  });

  it("declares the commercial split in the mode table", () => {
    expect(presetFor("flight").defaultProvenances).not.toContain("personal");
    expect(presetFor("walking").defaultProvenances).toContain("personal");
  });
});

describe("reports hide first, review after", () => {
  it("silences a reported echo immediately", () => {
    // Being briefly wrong about a good contribution costs far less than being briefly
    // right about a bad one.
    const reported = personal({
      contribution: contribution({ reportedAt: "2026-09-21T09:00:00.000Z" }),
    });
    const result = checkEligibility(reported, { profile: ADULT, playAtMs: NOON, mode: "walking" });
    expect(result.reasons).toContain("under-review");
  });

  it("leaves an unreported one playing", () => {
    expect(
      checkEligibility(personal(), { profile: ADULT, playAtMs: NOON, mode: "walking" }).eligible,
    ).toBe(true);
  });
});
