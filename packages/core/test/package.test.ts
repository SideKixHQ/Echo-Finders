import { describe, expect, it } from "vitest";
import { buildRoutePackage, estimateBytes } from "../src/pkg/build.js";
import { NOMINAL_DURATION_S } from "../src/types.js";
import type { Story, TrueCrimeReview } from "../src/types.js";
import { JFK_MIA, makeStory, storiesAlongJfkMia } from "./fixtures.js";

const REVIEW: TrueCrimeReview = {
  involvesLivingPeople: false,
  convictionStatus: "convicted",
  reviewedBy: "editorial-lead",
  reviewedAt: "2026-08-01",
  contentWarning: "This story describes a violent crime.",
};

/** A library with something for every audience, as a real corridor would have. */
function mixedLibrary(): Story[] {
  return [
    ...storiesAlongJfkMia(40, ["history", "nature-science"]),
    ...storiesAlongJfkMia(30, ["kids"]).map((s) =>
      makeStory({ ...s, id: `kids-${s.id}`, category: "kids", minAge: 0 }),
    ),
    ...storiesAlongJfkMia(30, ["true-crime"]).map((s) =>
      makeStory({
        ...s,
        id: `tc-${s.id}`,
        category: "true-crime",
        minAge: 16,
        trueCrimeReview: REVIEW,
      }),
    ),
  ];
}

describe("estimateBytes", () => {
  it("uses the measured size when the audio has been rendered", () => {
    const story = makeStory({ id: "s", at: { lat: 33, lng: -79 }, audioBytes: 12_345 });
    expect(estimateBytes(story, 64)).toBe(12_345);
  });

  it("falls back to the bitrate assumption", () => {
    const story = makeStory({ id: "s", at: { lat: 33, lng: -79 }, format: "short" });
    // 64 kbps is 8,000 bytes/sec; a 90-second short is therefore about 720 KB.
    expect(estimateBytes(story, 64)).toBe(8000 * NOMINAL_DURATION_S.short);
  });
});

describe("buildRoutePackage", () => {
  const library = mixedLibrary();

  it("carries the route geometry the map needs", () => {
    const pkg = buildRoutePackage(JFK_MIA, library);
    expect(pkg.flightId).toBe(JFK_MIA.id);
    expect(pkg.path.length).toBeGreaterThan(50);
    expect(pkg.bounds.minLat).toBeLessThan(26);
    expect(pkg.bounds.maxLat).toBeGreaterThan(40);
  });

  it("decimates the polyline to the cap", () => {
    const pkg = buildRoutePackage(JFK_MIA, library, { maxPathPoints: 50 });
    expect(pkg.path.length).toBeLessThanOrEqual(50);
    // Endpoints must survive thinning or the drawn line misses the airports.
    expect(pkg.path[0]!.lat).toBeCloseTo(JFK_MIA.origin.at.lat, 4);
    expect(pkg.path.at(-1)!.lat).toBeCloseTo(JFK_MIA.destination.at.lat, 4);
  });

  it("stays inside its size budget", () => {
    const pkg = buildRoutePackage(JFK_MIA, library, { maxBytes: 20 * 1024 * 1024 });
    expect(pkg.totalBytes).toBeLessThanOrEqual(pkg.budgetBytes);
  });

  it("lists stories in the order the aircraft meets them", () => {
    const pkg = buildRoutePackage(JFK_MIA, library);
    for (let i = 1; i < pkg.stories.length; i++) {
      expect(pkg.stories[i]!.alongTrackKm).toBeGreaterThanOrEqual(pkg.stories[i - 1]!.alongTrackKm);
    }
  });

  it("serves every audience, not just the one with the best stories", () => {
    // The failure this guards against: spending the whole budget on adult history and
    // leaving a seven-year-old with an empty flight.
    const pkg = buildRoutePackage(JFK_MIA, library);
    const categories = new Set(pkg.stories.filter((s) => s.essential).map((s) => s.story.category));
    expect(categories.has("kids")).toBe(true);
    expect(categories.has("true-crime")).toBe(true);
    expect(categories.has("history")).toBe(true);
  });

  it("keeps a child's flight intact even on a tight budget", () => {
    const tight = buildRoutePackage(JFK_MIA, library, { maxBytes: 12 * 1024 * 1024 });
    const kids = tight.stories.filter((s) => s.story.category === "kids");
    expect(kids.length).toBeGreaterThan(3);
  });

  it("marks coverage material essential and the rest optional", () => {
    const pkg = buildRoutePackage(JFK_MIA, library);
    expect(pkg.stories.some((s) => s.essential)).toBe(true);
    expect(pkg.stories.some((s) => !s.essential)).toBe(true);
  });

  it("carries far more than one flight can play, for skips and filter changes", () => {
    const pkg = buildRoutePackage(JFK_MIA, library);
    const essentialCount = pkg.stories.filter((s) => s.essential).length;
    expect(pkg.stories.length).toBeGreaterThan(essentialCount);
  });

  it("reports what the budget forced it to leave behind", () => {
    const pkg = buildRoutePackage(JFK_MIA, library, { maxBytes: 5 * 1024 * 1024 });
    expect(pkg.droppedCount).toBeGreaterThan(0);
    expect(pkg.totalBytes).toBeLessThanOrEqual(5 * 1024 * 1024);
  });

  it("never packages a story with no rendered audio", () => {
    const silent = library.map((s) => makeStory({ ...s, audioKey: undefined }));
    expect(buildRoutePackage(JFK_MIA, silent).stories).toEqual([]);
  });

  it("respects measured audio sizes when computing the total", () => {
    const sized = library.map((s) => makeStory({ ...s, audioBytes: 1000 }));
    const pkg = buildRoutePackage(JFK_MIA, sized);
    expect(pkg.totalBytes).toBe(pkg.stories.length * 1000);
  });

  it("fits a realistic three-hour flight inside the default budget", () => {
    const pkg = buildRoutePackage(JFK_MIA, library);
    expect(pkg.totalBytes).toBeLessThan(250 * 1024 * 1024);
    expect(pkg.droppedCount).toBe(0);
  });

  it("can be narrowed to the categories an airline permits", () => {
    const pkg = buildRoutePackage(JFK_MIA, library, {
      categories: ["kids", "history", "nature-science"],
    });
    // True crime has no coverage profile, so nothing schedules it as essential.
    expect(pkg.stories.filter((s) => s.essential && s.story.category === "true-crime")).toEqual([]);
  });

  it("handles a corridor with nothing in it", () => {
    const pkg = buildRoutePackage(JFK_MIA, []);
    expect(pkg.stories).toEqual([]);
    expect(pkg.totalBytes).toBe(0);
    expect(pkg.droppedCount).toBe(0);
  });
});
