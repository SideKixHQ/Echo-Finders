import { describe, expect, it } from "vitest";
import { buildEchoJourney, estimateBytes } from "../src/pkg/build.js";
import { NOMINAL_DURATION_S } from "../src/types.js";
import type { Echo, TrueCrimeReview } from "../src/types.js";
import { JFK_MIA, makeEcho, echoesAlongJfkMia } from "./fixtures.js";

const REVIEW: TrueCrimeReview = {
  involvesLivingPeople: false,
  convictionStatus: "convicted",
  reviewedBy: "editorial-lead",
  reviewedAt: "2026-08-01",
  contentWarning: "This echo describes a violent crime.",
};

/** A library with something for every audience, as a real corridor would have. */
function mixedLibrary(): Echo[] {
  return [
    ...echoesAlongJfkMia(40, ["history", "nature-science"]),
    ...echoesAlongJfkMia(30, ["kids"]).map((s) =>
      makeEcho({ ...s, id: `kids-${s.id}`, category: "kids", minAge: 0 }),
    ),
    ...echoesAlongJfkMia(30, ["true-crime"]).map((s) =>
      makeEcho({
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
    const echo = makeEcho({ id: "s", at: { lat: 33, lng: -79 }, audioBytes: 12_345 });
    expect(estimateBytes(echo, 64)).toBe(12_345);
  });

  it("falls back to the bitrate assumption", () => {
    const echo = makeEcho({ id: "s", at: { lat: 33, lng: -79 }, format: "short" });
    // 64 kbps is 8,000 bytes/sec; a 90-second short is therefore about 720 KB.
    expect(estimateBytes(echo, 64)).toBe(8000 * NOMINAL_DURATION_S.short);
  });
});

describe("buildEchoJourney", () => {
  const library = mixedLibrary();

  it("carries the route geometry the map needs", () => {
    const pkg = buildEchoJourney(JFK_MIA, library);
    expect(pkg.routeId).toBe(JFK_MIA.id);
    expect(pkg.path.length).toBeGreaterThan(50);
    expect(pkg.bounds.minLat).toBeLessThan(26);
    expect(pkg.bounds.maxLat).toBeGreaterThan(40);
  });

  it("decimates the polyline to the cap", () => {
    const pkg = buildEchoJourney(JFK_MIA, library, { maxPathPoints: 50 });
    expect(pkg.path.length).toBeLessThanOrEqual(50);
    // Endpoints must survive thinning or the drawn line misses the airports.
    expect(pkg.path[0]!.lat).toBeCloseTo(JFK_MIA.origin.at.lat, 4);
    expect(pkg.path.at(-1)!.lat).toBeCloseTo(JFK_MIA.destination.at.lat, 4);
  });

  it("stays inside its size budget", () => {
    const pkg = buildEchoJourney(JFK_MIA, library, { maxBytes: 20 * 1024 * 1024 });
    expect(pkg.totalBytes).toBeLessThanOrEqual(pkg.budgetBytes);
  });

  it("lists echoes in the order the aircraft meets them", () => {
    const pkg = buildEchoJourney(JFK_MIA, library);
    for (let i = 1; i < pkg.echoes.length; i++) {
      expect(pkg.echoes[i]!.alongTrackKm).toBeGreaterThanOrEqual(pkg.echoes[i - 1]!.alongTrackKm);
    }
  });

  it("serves every audience, not just the one with the best echoes", () => {
    // The failure this guards against: spending the whole budget on adult history and
    // leaving a seven-year-old with an empty flight.
    const pkg = buildEchoJourney(JFK_MIA, library);
    const categories = new Set(pkg.echoes.filter((s) => s.essential).map((s) => s.echo.category));
    expect(categories.has("kids")).toBe(true);
    expect(categories.has("true-crime")).toBe(true);
    expect(categories.has("history")).toBe(true);
  });

  it("keeps a child's flight intact even on a tight budget", () => {
    const tight = buildEchoJourney(JFK_MIA, library, { maxBytes: 12 * 1024 * 1024 });
    const kids = tight.echoes.filter((s) => s.echo.category === "kids");
    expect(kids.length).toBeGreaterThan(3);
  });

  it("marks coverage material essential and the rest optional", () => {
    const pkg = buildEchoJourney(JFK_MIA, library);
    expect(pkg.echoes.some((s) => s.essential)).toBe(true);
    expect(pkg.echoes.some((s) => !s.essential)).toBe(true);
  });

  it("carries far more than one flight can play, for skips and filter changes", () => {
    const pkg = buildEchoJourney(JFK_MIA, library);
    const essentialCount = pkg.echoes.filter((s) => s.essential).length;
    expect(pkg.echoes.length).toBeGreaterThan(essentialCount);
  });

  it("reports what the budget forced it to leave behind", () => {
    const pkg = buildEchoJourney(JFK_MIA, library, { maxBytes: 5 * 1024 * 1024 });
    expect(pkg.droppedCount).toBeGreaterThan(0);
    expect(pkg.totalBytes).toBeLessThanOrEqual(5 * 1024 * 1024);
  });

  it("never packages an echo with no rendered audio", () => {
    const silent = library.map((s) => makeEcho({ ...s, audioKey: undefined }));
    expect(buildEchoJourney(JFK_MIA, silent).echoes).toEqual([]);
  });

  it("respects measured audio sizes when computing the total", () => {
    const sized = library.map((s) => makeEcho({ ...s, audioBytes: 1000 }));
    const pkg = buildEchoJourney(JFK_MIA, sized);
    expect(pkg.totalBytes).toBe(pkg.echoes.length * 1000);
  });

  it("fits a realistic three-hour flight inside the default budget", () => {
    const pkg = buildEchoJourney(JFK_MIA, library);
    expect(pkg.totalBytes).toBeLessThan(250 * 1024 * 1024);
    expect(pkg.droppedCount).toBe(0);
  });

  it("can be narrowed to the categories an airline permits", () => {
    const pkg = buildEchoJourney(JFK_MIA, library, {
      categories: ["kids", "history", "nature-science"],
    });
    // True crime has no coverage profile, so nothing schedules it as essential.
    expect(pkg.echoes.filter((s) => s.essential && s.echo.category === "true-crime")).toEqual([]);
  });

  it("handles a corridor with nothing in it", () => {
    const pkg = buildEchoJourney(JFK_MIA, []);
    expect(pkg.echoes).toEqual([]);
    expect(pkg.totalBytes).toBe(0);
    expect(pkg.droppedCount).toBe(0);
  });
});
