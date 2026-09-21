import { describe, expect, it } from "vitest";
import {
  FULL_POLICY,
  MVP_POLICY,
  TRUE_CRIME_MIN_AGE,
  validateLibrary,
  validateEcho,
} from "../src/content/validate.js";
import type { Source, Echo, TrueCrimeReview } from "../src/types.js";
import { makeEcho } from "./fixtures.js";

const errorsOn = (echo: Echo, field: string) =>
  validateEcho(echo).filter((i) => i.severity === "error" && i.field === field);

const allErrors = (echo: Echo) => validateEcho(echo).filter((i) => i.severity === "error");

const source = (n: number): Source => ({
  title: `Source ${n}`,
  publisher: `Publisher ${n}`,
  retrievedAt: "2026-09-01",
  rights: "public-domain",
});

const REVIEW: TrueCrimeReview = {
  involvesLivingPeople: false,
  convictionStatus: "convicted",
  reviewedBy: "editorial-lead",
  reviewedAt: "2026-08-01",
  contentWarning: "This echo describes a violent crime.",
};

const trueCrime = (overrides: Partial<Echo> = {}): Echo =>
  makeEcho({
    id: "tc",
    at: { lat: 41.5, lng: -81.7 },
    category: "true-crime",
    minAge: 16,
    sources: [source(1), source(2)],
    factCheck: "corroborated",
    trueCrimeReview: REVIEW,
    ...overrides,
  });

describe("validateEcho — basics", () => {
  it("accepts a well-formed echo", () => {
    expect(allErrors(makeEcho({ id: "good-echo", at: { lat: 33, lng: -79 } }))).toEqual([]);
  });

  it("insists on kebab-case ids", () => {
    expect(errorsOn(makeEcho({ id: "Not Kebab", at: { lat: 33, lng: -79 } }), "id")).toHaveLength(1);
  });

  it("catches the coordinates nobody filled in", () => {
    expect(errorsOn(makeEcho({ id: "s", at: { lat: 0, lng: 0 } }), "at")[0]!.message).toMatch(
      /null island/,
    );
  });

  it("rejects out-of-range coordinates", () => {
    expect(errorsOn(makeEcho({ id: "s", at: { lat: 120, lng: 0 } }), "at.lat")).toHaveLength(1);
    expect(errorsOn(makeEcho({ id: "s", at: { lat: 0, lng: 200 } }), "at.lng")).toHaveLength(1);
  });

  it("keeps trigger radii inside a usable range", () => {
    const tooTight = makeEcho({ id: "s", at: { lat: 33, lng: -79 }, triggerRadiusKm: 0.005 });
    const tooWide = makeEcho({ id: "s", at: { lat: 33, lng: -79 }, triggerRadiusKm: 500 });
    expect(errorsOn(tooTight, "triggerRadiusKm")).toHaveLength(1);
    expect(errorsOn(tooWide, "triggerRadiusKm")).toHaveLength(1);
  });

  it("accepts the metre-scale radii a walking tour needs", () => {
    // The same library serves a flight and a walking tour, so the usable range spans four
    // orders of magnitude: a blue plaque is 0.05km, a city is 60.
    const plaque = makeEcho({ id: "plaque", at: { lat: 40.7, lng: -74 }, triggerRadiusKm: 0.05 });
    expect(errorsOn(plaque, "triggerRadiusKm")).toEqual([]);
  });

  it("requires a place name, because the script says it out loud", () => {
    expect(errorsOn(makeEcho({ id: "s", at: { lat: 33, lng: -79 }, place: "  " }), "place")).toHaveLength(1);
  });

  it("requires at least one source", () => {
    expect(errorsOn(makeEcho({ id: "s", at: { lat: 33, lng: -79 }, sources: [] }), "sources")).toHaveLength(1);
  });

  it("requires a retrieval date on every source", () => {
    const echo = makeEcho({
      id: "s",
      at: { lat: 33, lng: -79 },
      sources: [{ ...source(1), retrievedAt: "whenever" }],
    });
    expect(errorsOn(echo, "sources[0].retrievedAt")).toHaveLength(1);
  });

  it("will not approve an echo whose facts were never checked", () => {
    const echo = makeEcho({ id: "s", at: { lat: 33, lng: -79 }, factCheck: "unchecked" });
    expect(errorsOn(echo, "factCheck")).toHaveLength(1);
  });

  it("allows an unchecked draft, since that is what drafts are", () => {
    const draft = makeEcho({
      id: "s",
      at: { lat: 33, lng: -79 },
      factCheck: "unchecked",
      editorial: "draft",
    });
    expect(allErrors(draft)).toEqual([]);
  });

  it("warns, but does not fail, on an approved echo with no audio yet", () => {
    const echo = makeEcho({ id: "s", at: { lat: 33, lng: -79 }, audioKey: undefined });
    const issues = validateEcho(echo);
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(issues.some((i) => i.field === "renders" && i.severity === "warning")).toBe(true);
  });

  it("catches a kids echo a child could never hear", () => {
    const echo = makeEcho({ id: "s", at: { lat: 33, lng: -79 }, category: "kids", minAge: 15 });
    expect(errorsOn(echo, "minAge")).toHaveLength(1);
  });

  it("warns about an over-long pin summary", () => {
    const echo = makeEcho({ id: "s", at: { lat: 33, lng: -79 }, summary: "x".repeat(200) });
    expect(validateEcho(echo).some((i) => i.field === "summary")).toBe(true);
  });

  it("warns when audio is nowhere near its format's nominal length", () => {
    const echo = makeEcho({ id: "s", at: { lat: 33, lng: -79 }, format: "short", durationS: 600 });
    expect(validateEcho(echo).some((i) => i.field === "durationS")).toBe(true);
  });
});

describe("validateEcho — the true-crime gate", () => {
  it("accepts a fully reviewed true-crime echo", () => {
    expect(allErrors(trueCrime())).toEqual([]);
  });

  it("refuses true crime with no human review, with no exceptions", () => {
    const issues = errorsOn(trueCrime({ trueCrimeReview: undefined }), "trueCrimeReview");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toMatch(/no exceptions/);
  });

  it("demands two independent sources", () => {
    expect(errorsOn(trueCrime({ sources: [source(1)] }), "sources")).toHaveLength(1);
  });

  it("demands three sources when a living person was not convicted", () => {
    // The highest-risk thing we publish: naming someone alive who was never convicted.
    const risky = trueCrime({
      sources: [source(1), source(2)],
      trueCrimeReview: { ...REVIEW, involvesLivingPeople: true, convictionStatus: "alleged" },
    });
    expect(errorsOn(risky, "sources")).toHaveLength(1);

    const sourced = trueCrime({
      sources: [source(1), source(2), source(3)],
      trueCrimeReview: { ...REVIEW, involvesLivingPeople: true, convictionStatus: "alleged" },
    });
    expect(allErrors(sourced)).toEqual([]);
  });

  it("allows two sources for a living person who was convicted", () => {
    const convicted = trueCrime({
      trueCrimeReview: { ...REVIEW, involvesLivingPeople: true, convictionStatus: "convicted" },
    });
    expect(allErrors(convicted)).toEqual([]);
  });

  it("requires corroboration, not a single source", () => {
    expect(errorsOn(trueCrime({ factCheck: "single-source" }), "factCheck")).toHaveLength(1);
  });

  it(`gates true crime at ${TRUE_CRIME_MIN_AGE}+`, () => {
    expect(errorsOn(trueCrime({ minAge: 13 }), "minAge")).toHaveLength(1);
  });

  it("insists a named human signed it off", () => {
    const anonymous = trueCrime({ trueCrimeReview: { ...REVIEW, reviewedBy: "   " } });
    expect(errorsOn(anonymous, "trueCrimeReview.reviewedBy")).toHaveLength(1);
  });

  it("insists on a content warning", () => {
    const unwarned = trueCrime({ trueCrimeReview: { ...REVIEW, contentWarning: "" } });
    expect(errorsOn(unwarned, "trueCrimeReview.contentWarning")).toHaveLength(1);
  });

  it("flags a crime echo filed under another category to dodge the gate", () => {
    const disguised = makeEcho({
      id: "disguised",
      at: { lat: 33, lng: -79 },
      category: "history",
      trueCrimeReview: REVIEW,
    });
    expect(validateEcho(disguised).some((i) => i.field === "trueCrimeReview")).toBe(true);
  });
});

describe("validateLibrary", () => {
  it("passes a clean library", () => {
    const report = validateLibrary([
      makeEcho({ id: "one", at: { lat: 33, lng: -79 } }),
      makeEcho({ id: "two", at: { lat: 34, lng: -79 } }),
    ]);
    expect(report.ok).toBe(true);
    expect(report.errorCount).toBe(0);
  });

  it("catches duplicate ids", () => {
    const report = validateLibrary([
      makeEcho({ id: "same", at: { lat: 33, lng: -79 } }),
      makeEcho({ id: "same", at: { lat: 34, lng: -79 } }),
    ]);
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.message.includes("duplicated"))).toBe(true);
  });

  it("catches a dangling related-echo reference", () => {
    // Left unchecked, the scheduler's duplicate-subject suppression silently stops
    // working and a passenger hears the same subject twice.
    const report = validateLibrary([
      makeEcho({ id: "one", at: { lat: 33, lng: -79 }, relatedIds: ["ghost"] }),
    ]);
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.field === "relatedIds")).toBe(true);
  });

  it("accepts a resolved related-echo pair", () => {
    const report = validateLibrary([
      makeEcho({ id: "one", at: { lat: 33, lng: -79 }, relatedIds: ["two"] }),
      makeEcho({ id: "two", at: { lat: 34, lng: -79 }, relatedIds: ["one"] }),
    ]);
    expect(report.ok).toBe(true);
  });

  it("separates errors from warnings so CI can fail on errors alone", () => {
    const report = validateLibrary([
      makeEcho({ id: "warn-only", at: { lat: 33, lng: -79 }, audioKey: undefined }),
    ]);
    expect(report.errorCount).toBe(0);
    expect(report.warningCount).toBeGreaterThan(0);
    expect(report.ok).toBe(true);
  });
});

describe("rights policy", () => {
  const withRights = (rights: Source["rights"], url?: string): Echo =>
    makeEcho({
      id: "rights-test",
      at: { lat: 33, lng: -79 },
      sources: [{ ...source(1), rights, ...(url ? { url } : {}) }],
    });

  it("accepts public-domain sources, which carry most of the library", () => {
    expect(allErrors(withRights("public-domain"))).toEqual([]);
  });

  it("accepts CC-BY", () => {
    expect(allErrors(withRights("cc-by", "https://example.org/a"))).toEqual([]);
  });

  it("wants a creditable URL on a CC-BY source", () => {
    // CC-BY is free to use but not free of obligation; the credit has to land somewhere.
    const issues = validateEcho(withRights("cc-by"));
    expect(issues.some((i) => i.field === "sources[0].url" && i.severity === "warning")).toBe(true);
  });

  it("rejects CC-BY-SA, because share-alike can propagate into a licensed product", () => {
    const issues = errorsOn(withRights("cc-by-sa"), "sources[0].rights");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toMatch(/[Ss]hare-alike/);
  });

  it("rejects licensed material under the MVP policy", () => {
    expect(errorsOn(withRights("licensed"), "sources[0].rights")).toHaveLength(1);
  });

  it("points an editor at the underlying record rather than the article reporting it", () => {
    const issues = errorsOn(withRights("fair-use-facts"), "sources[0].rights");
    expect(issues[0]!.message).toMatch(/public record/);
  });

  it("allows everything again once a rights desk exists", () => {
    for (const rights of ["cc-by-sa", "licensed", "fair-use-facts"] as const) {
      const report = validateLibrary([withRights(rights)], FULL_POLICY);
      expect(report.errorCount).toBe(0);
    }
  });

  it("defaults to the MVP policy when none is given", () => {
    const explicit = validateLibrary([withRights("licensed")], MVP_POLICY);
    const implicit = validateLibrary([withRights("licensed")]);
    expect(implicit.errorCount).toBe(explicit.errorCount);
    expect(implicit.errorCount).toBeGreaterThan(0);
  });
});

describe("true crime — primary records", () => {
  it("demands a public record, not just two retellings", () => {
    // Secondary sources repeat each other's errors; a chain of retellings is how an echo
    // ends up asserting a conviction that never happened.
    const retellings = trueCrime({
      sources: [
        { ...source(1), rights: "cc-by", url: "https://example.org/1" },
        { ...source(2), rights: "cc-by", url: "https://example.org/2" },
      ],
    });
    const issues = errorsOn(retellings, "sources");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toMatch(/public record/);
  });

  it("is satisfied by one court or archive source alongside a secondary one", () => {
    const grounded = trueCrime({
      sources: [source(1), { ...source(2), rights: "cc-by", url: "https://example.org/2" }],
    });
    expect(allErrors(grounded)).toEqual([]);
  });
});
