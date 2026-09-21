import { describe, expect, it } from "vitest";
import { TRUE_CRIME_MIN_AGE, validateLibrary, validateStory } from "../src/content/validate.js";
import type { Source, Story, TrueCrimeReview } from "../src/types.js";
import { makeStory } from "./fixtures.js";

const errorsOn = (story: Story, field: string) =>
  validateStory(story).filter((i) => i.severity === "error" && i.field === field);

const allErrors = (story: Story) => validateStory(story).filter((i) => i.severity === "error");

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
  contentWarning: "This story describes a violent crime.",
};

const trueCrime = (overrides: Partial<Story> = {}): Story =>
  makeStory({
    id: "tc",
    at: { lat: 41.5, lng: -81.7 },
    category: "true-crime",
    minAge: 16,
    sources: [source(1), source(2)],
    factCheck: "corroborated",
    trueCrimeReview: REVIEW,
    ...overrides,
  });

describe("validateStory — basics", () => {
  it("accepts a well-formed story", () => {
    expect(allErrors(makeStory({ id: "good-story", at: { lat: 33, lng: -79 } }))).toEqual([]);
  });

  it("insists on kebab-case ids", () => {
    expect(errorsOn(makeStory({ id: "Not Kebab", at: { lat: 33, lng: -79 } }), "id")).toHaveLength(1);
  });

  it("catches the coordinates nobody filled in", () => {
    expect(errorsOn(makeStory({ id: "s", at: { lat: 0, lng: 0 } }), "at")[0]!.message).toMatch(
      /null island/,
    );
  });

  it("rejects out-of-range coordinates", () => {
    expect(errorsOn(makeStory({ id: "s", at: { lat: 120, lng: 0 } }), "at.lat")).toHaveLength(1);
    expect(errorsOn(makeStory({ id: "s", at: { lat: 0, lng: 200 } }), "at.lng")).toHaveLength(1);
  });

  it("keeps trigger radii inside a usable range", () => {
    const tooTight = makeStory({ id: "s", at: { lat: 33, lng: -79 }, triggerRadiusKm: 2 });
    const tooWide = makeStory({ id: "s", at: { lat: 33, lng: -79 }, triggerRadiusKm: 500 });
    expect(errorsOn(tooTight, "triggerRadiusKm")).toHaveLength(1);
    expect(errorsOn(tooWide, "triggerRadiusKm")).toHaveLength(1);
  });

  it("requires a place name, because the script says it out loud", () => {
    expect(errorsOn(makeStory({ id: "s", at: { lat: 33, lng: -79 }, place: "  " }), "place")).toHaveLength(1);
  });

  it("requires at least one source", () => {
    expect(errorsOn(makeStory({ id: "s", at: { lat: 33, lng: -79 }, sources: [] }), "sources")).toHaveLength(1);
  });

  it("requires a retrieval date on every source", () => {
    const story = makeStory({
      id: "s",
      at: { lat: 33, lng: -79 },
      sources: [{ ...source(1), retrievedAt: "whenever" }],
    });
    expect(errorsOn(story, "sources[0].retrievedAt")).toHaveLength(1);
  });

  it("will not approve a story whose facts were never checked", () => {
    const story = makeStory({ id: "s", at: { lat: 33, lng: -79 }, factCheck: "unchecked" });
    expect(errorsOn(story, "factCheck")).toHaveLength(1);
  });

  it("allows an unchecked draft, since that is what drafts are", () => {
    const draft = makeStory({
      id: "s",
      at: { lat: 33, lng: -79 },
      factCheck: "unchecked",
      editorial: "draft",
    });
    expect(allErrors(draft)).toEqual([]);
  });

  it("warns, but does not fail, on an approved story with no audio yet", () => {
    const story = makeStory({ id: "s", at: { lat: 33, lng: -79 }, audioKey: undefined });
    const issues = validateStory(story);
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(issues.some((i) => i.field === "audioKey" && i.severity === "warning")).toBe(true);
  });

  it("catches a kids story a child could never hear", () => {
    const story = makeStory({ id: "s", at: { lat: 33, lng: -79 }, category: "kids", minAge: 15 });
    expect(errorsOn(story, "minAge")).toHaveLength(1);
  });

  it("warns about an over-long pin summary", () => {
    const story = makeStory({ id: "s", at: { lat: 33, lng: -79 }, summary: "x".repeat(200) });
    expect(validateStory(story).some((i) => i.field === "summary")).toBe(true);
  });

  it("warns when audio is nowhere near its format's nominal length", () => {
    const story = makeStory({ id: "s", at: { lat: 33, lng: -79 }, format: "short", durationS: 600 });
    expect(validateStory(story).some((i) => i.field === "durationS")).toBe(true);
  });
});

describe("validateStory — the true-crime gate", () => {
  it("accepts a fully reviewed true-crime story", () => {
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

  it("flags a crime story filed under another category to dodge the gate", () => {
    const disguised = makeStory({
      id: "disguised",
      at: { lat: 33, lng: -79 },
      category: "history",
      trueCrimeReview: REVIEW,
    });
    expect(validateStory(disguised).some((i) => i.field === "trueCrimeReview")).toBe(true);
  });
});

describe("validateLibrary", () => {
  it("passes a clean library", () => {
    const report = validateLibrary([
      makeStory({ id: "one", at: { lat: 33, lng: -79 } }),
      makeStory({ id: "two", at: { lat: 34, lng: -79 } }),
    ]);
    expect(report.ok).toBe(true);
    expect(report.errorCount).toBe(0);
  });

  it("catches duplicate ids", () => {
    const report = validateLibrary([
      makeStory({ id: "same", at: { lat: 33, lng: -79 } }),
      makeStory({ id: "same", at: { lat: 34, lng: -79 } }),
    ]);
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.message.includes("duplicated"))).toBe(true);
  });

  it("catches a dangling related-story reference", () => {
    // Left unchecked, the scheduler's duplicate-subject suppression silently stops
    // working and a passenger hears the same subject twice.
    const report = validateLibrary([
      makeStory({ id: "one", at: { lat: 33, lng: -79 }, relatedIds: ["ghost"] }),
    ]);
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.field === "relatedIds")).toBe(true);
  });

  it("accepts a resolved related-story pair", () => {
    const report = validateLibrary([
      makeStory({ id: "one", at: { lat: 33, lng: -79 }, relatedIds: ["two"] }),
      makeStory({ id: "two", at: { lat: 34, lng: -79 }, relatedIds: ["one"] }),
    ]);
    expect(report.ok).toBe(true);
  });

  it("separates errors from warnings so CI can fail on errors alone", () => {
    const report = validateLibrary([
      makeStory({ id: "warn-only", at: { lat: 33, lng: -79 }, audioKey: undefined }),
    ]);
    expect(report.errorCount).toBe(0);
    expect(report.warningCount).toBeGreaterThan(0);
    expect(report.ok).toBe(true);
  });
});
