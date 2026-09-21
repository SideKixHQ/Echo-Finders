import { describe, expect, it } from "vitest";
import { checkEligibility, scoreStory } from "../src/ranking/score.js";
import { buildPlaylist } from "../src/ranking/playlist.js";
import type { CorridorHit } from "../src/geo/corridor.js";
import type { ListenerProfile, Story, TrueCrimeReview } from "../src/types.js";
import { ADULT, CHILD, JFK_MIA, makeStory, storiesAlongJfkMia, TRUE_CRIME_FAN } from "./fixtures.js";

const NOON_UTC = Date.parse("2026-06-15T17:00:00Z");

const REVIEW: TrueCrimeReview = {
  involvesLivingPeople: false,
  convictionStatus: "convicted",
  reviewedBy: "editorial-lead",
  reviewedAt: "2026-08-01",
  contentWarning: "This story describes a violent crime.",
};

const hitFor = (story: Story, crossTrackKm = 5): CorridorHit => ({
  story,
  crossTrackKm,
  alongTrackKm: 500,
  nearestPoint: story.at,
});

describe("checkEligibility", () => {
  const base = { profile: ADULT, playAtMs: NOON_UTC };

  it("passes an approved, corroborated, in-category story", () => {
    const story = makeStory({ id: "ok", at: { lat: 33, lng: -79 } });
    expect(checkEligibility(story, base).eligible).toBe(true);
  });

  it("blocks anything not approved", () => {
    const story = makeStory({ id: "draft", at: { lat: 33, lng: -79 }, editorial: "draft" });
    expect(checkEligibility(story, base).reasons).toContain("not-approved");
  });

  it("blocks unverified and disputed facts", () => {
    for (const factCheck of ["unchecked", "disputed"] as const) {
      const story = makeStory({ id: "shaky", at: { lat: 33, lng: -79 }, factCheck });
      expect(checkEligibility(story, base).reasons).toContain("facts-unverified");
    }
  });

  it("keeps an age-gated story away from a child", () => {
    const story = makeStory({ id: "grim", at: { lat: 33, lng: -79 }, minAge: 16, category: "history" });
    const result = checkEligibility(story, { ...base, profile: CHILD });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("below-min-age");
  });

  it("will not play true crime to someone who never asked for it", () => {
    const story = makeStory({
      id: "crime",
      at: { lat: 33, lng: -79 },
      category: "true-crime",
      minAge: 16,
      trueCrimeReview: REVIEW,
    });
    expect(checkEligibility(story, base).reasons).toContain("opt-in-required");
  });

  it("distinguishes an opt-in category from one simply switched off", () => {
    const musicOff = makeStory({ id: "music", at: { lat: 33, lng: -79 }, category: "music" });
    const narrowed: ListenerProfile = { ...ADULT, categories: ["history"] };
    expect(checkEligibility(musicOff, { ...base, profile: narrowed }).reasons).toContain(
      "category-off",
    );
  });

  it("blocks true crime that lacks a signed human review, even for a fan", () => {
    const story = makeStory({
      id: "unreviewed-crime",
      at: { lat: 33, lng: -79 },
      category: "true-crime",
      minAge: 16,
    });
    const result = checkEligibility(story, { ...base, profile: TRUE_CRIME_FAN });
    expect(result.reasons).toContain("missing-true-crime-review");
  });

  it("does not repeat a story the passenger has already heard", () => {
    const story = makeStory({ id: "repeat", at: { lat: 33, lng: -79 } });
    const repeatListener: ListenerProfile = { ...ADULT, heardStoryIds: ["repeat"] };
    expect(checkEligibility(story, { ...base, profile: repeatListener }).reasons).toContain(
      "already-heard",
    );
  });

  it("requires audio only when the caller asks for it", () => {
    const silent = makeStory({ id: "silent", at: { lat: 33, lng: -79 }, audioKey: undefined });
    expect(checkEligibility(silent, base).eligible).toBe(true);
    expect(checkEligibility(silent, { ...base, requireAudio: true }).reasons).toContain("no-audio");
  });

  it("honours an hours window, including one that wraps midnight", () => {
    const nightOnly = makeStory({
      id: "city-lights",
      at: { lat: 25.79, lng: -80.29 },
      hours: { fromHour: 21, toHour: 5 },
    });
    // 03:00 local solar time at Miami's longitude.
    const night = Date.parse("2026-06-15T08:20:00Z");
    const noon = Date.parse("2026-06-15T17:20:00Z");
    expect(checkEligibility(nightOnly, { ...base, playAtMs: night }).eligible).toBe(true);
    expect(checkEligibility(nightOnly, { ...base, playAtMs: noon }).reasons).toContain(
      "outside-hours",
    );
  });

  it("reports every problem at once, so an editor can fix them in one pass", () => {
    const bad = makeStory({
      id: "bad",
      at: { lat: 33, lng: -79 },
      editorial: "draft",
      factCheck: "disputed",
      minAge: 18,
      category: "true-crime",
    });
    const reasons = checkEligibility(bad, { ...base, profile: CHILD }).reasons;
    expect(reasons.length).toBeGreaterThanOrEqual(4);
  });
});

describe("scoreStory", () => {
  it("prefers a story directly below to one at the corridor edge", () => {
    const story = makeStory({ id: "s", at: { lat: 33, lng: -79 }, triggerRadiusKm: 60 });
    const near = scoreStory(hitFor(story, 2), { profile: ADULT, playAtMs: NOON_UTC });
    const far = scoreStory(hitFor(story, 58), { profile: ADULT, playAtMs: NOON_UTC });
    expect(near.total).toBeGreaterThan(far.total);
    expect(near.proximity).toBeGreaterThan(0.95);
  });

  it("rewards editorial quality above everything else", () => {
    const good = makeStory({ id: "good", at: { lat: 33, lng: -79 }, quality: 1 });
    const weak = makeStory({ id: "weak", at: { lat: 33, lng: -79 }, quality: 0.2 });
    const ctx = { profile: ADULT, playAtMs: NOON_UTC };
    expect(scoreStory(hitFor(good), ctx).total - scoreStory(hitFor(weak), ctx).total).toBeGreaterThan(
      0.25,
    );
  });

  it("all but silences a daylight-dependent story at night", () => {
    const story = makeStory({
      id: "canyon",
      at: { lat: 36.1, lng: -112.1 },
      visibility: "daylight-dependent",
    });
    const day = scoreStory(hitFor(story), { profile: ADULT, playAtMs: Date.parse("2026-06-15T19:00:00Z") });
    const night = scoreStory(hitFor(story), { profile: ADULT, playAtMs: Date.parse("2026-06-15T08:00:00Z") });
    expect(day.visibility).toBeGreaterThan(0.8);
    expect(night.visibility).toBeLessThan(0.2);
  });

  it("stays neutral when it has no interest signal, rather than punishing the story", () => {
    const story = makeStory({ id: "untagged", at: { lat: 33, lng: -79 }, tags: ["obscure"] });
    const score = scoreStory(hitFor(story), {
      profile: { ...ADULT, interests: { jazz: 1 } },
      playAtMs: NOON_UTC,
    });
    expect(score.interest).toBe(0.5);
  });

  it("lifts a story matching a stated interest", () => {
    const story = makeStory({ id: "jazzy", at: { lat: 33, lng: -79 }, tags: ["jazz"] });
    const score = scoreStory(hitFor(story), {
      profile: { ...ADULT, interests: { jazz: 1 } },
      playAtMs: NOON_UTC,
    });
    expect(score.interest).toBe(1);
  });

  it("stays within 0 and 1", () => {
    const story = makeStory({ id: "s", at: { lat: 33, lng: -79 }, quality: 1, visibility: "landmark-visible" });
    const score = scoreStory(hitFor(story, 0), { profile: ADULT, playAtMs: NOON_UTC });
    expect(score.total).toBeLessThanOrEqual(1);
    expect(score.total).toBeGreaterThanOrEqual(0);
  });
});

describe("buildPlaylist", () => {
  const library = storiesAlongJfkMia(120);

  it("produces a flight's worth of listening", () => {
    const playlist = buildPlaylist(JFK_MIA, library, ADULT);
    expect(playlist.items.length).toBeGreaterThan(10);
    expect(playlist.journeyId).toBe(JFK_MIA.id);
  });

  it("never overlaps two stories", () => {
    const { items } = buildPlaylist(JFK_MIA, library, ADULT);
    for (let i = 1; i < items.length; i++) {
      expect(items[i]!.startS).toBeGreaterThanOrEqual(items[i - 1]!.endS);
    }
  });

  it("keeps everything inside the listening window", () => {
    const { items } = buildPlaylist(JFK_MIA, library, ADULT);
    for (const item of items) {
      expect(item.startS).toBeGreaterThan(600);
      expect(item.endS).toBeLessThanOrEqual(JFK_MIA.durationS);
    }
  });

  it("never plays the same story twice", () => {
    const { items } = buildPlaylist(JFK_MIA, library, ADULT);
    const ids = items.map((i) => i.story.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("plays each story near the place it is about", () => {
    const { items } = buildPlaylist(JFK_MIA, library, ADULT);
    for (const item of items) {
      const midpoint = item.startS + item.story.durationS / 2;
      expect(Math.abs(midpoint - item.nearestS)).toBeLessThanOrEqual(600);
    }
  });

  it("varies categories instead of running four histories together", () => {
    const { items } = buildPlaylist(JFK_MIA, library, ADULT);
    let repeats = 0;
    for (let i = 1; i < items.length; i++) {
      if (items[i]!.story.category === items[i - 1]!.story.category) repeats++;
    }
    expect(repeats / items.length).toBeLessThan(0.2);
  });

  it("talks more on immersive than on light", () => {
    const light = buildPlaylist(JFK_MIA, library, { ...ADULT, density: "light" });
    const immersive = buildPlaylist(JFK_MIA, library, { ...ADULT, density: "immersive" });
    expect(immersive.totalAudioS).toBeGreaterThan(light.totalAudioS * 1.5);
  });

  it("leaves most of the flight silent even at the busiest setting", () => {
    // Silence is a feature. A passenger should be able to look out of the window.
    const immersive = buildPlaylist(JFK_MIA, library, { ...ADULT, density: "immersive" });
    expect(immersive.totalAudioS).toBeLessThan(JFK_MIA.durationS * 0.7);
  });

  it("holds back a reserve for in-flight filter changes", () => {
    const playlist = buildPlaylist(JFK_MIA, library, ADULT);
    expect(playlist.reserve.length).toBeGreaterThan(playlist.items.length);
    const scheduled = new Set(playlist.items.map((i) => i.story.id));
    for (const story of playlist.reserve) expect(scheduled.has(story.id)).toBe(false);
  });

  it("keeps a child's flight free of adult material", () => {
    const adultLibrary = [
      ...storiesAlongJfkMia(40, ["kids", "nature-science"]),
      ...storiesAlongJfkMia(40, ["true-crime"]).map((s) =>
        makeStory({ ...s, id: `tc-${s.id}`, minAge: 16, trueCrimeReview: REVIEW }),
      ),
    ];
    const playlist = buildPlaylist(JFK_MIA, adultLibrary, CHILD);
    expect(playlist.items.length).toBeGreaterThan(0);
    for (const item of playlist.items) {
      expect(item.story.category).not.toBe("true-crime");
      expect(item.story.minAge).toBeLessThanOrEqual(CHILD.age);
    }
  });

  it("gives a true-crime fan true crime, once they have opted in", () => {
    const crimeLibrary = storiesAlongJfkMia(60, ["true-crime"]).map((s) =>
      makeStory({ ...s, minAge: 16, trueCrimeReview: REVIEW }),
    );
    expect(buildPlaylist(JFK_MIA, crimeLibrary, ADULT).items.length).toBe(0);
    expect(buildPlaylist(JFK_MIA, crimeLibrary, TRUE_CRIME_FAN).items.length).toBeGreaterThan(0);
  });

  it("does not cover the same subject twice", () => {
    const a = makeStory({ id: "river-a", at: { lat: 33.69, lng: -78.89 }, relatedIds: ["river-b"] });
    const b = makeStory({ id: "river-b", at: { lat: 33.7, lng: -78.9 }, relatedIds: ["river-a"] });
    const { items } = buildPlaylist(JFK_MIA, [a, b], ADULT);
    expect(items.length).toBe(1);
  });

  it("skips stories the passenger has already heard on an earlier flight", () => {
    const heard = library.slice(0, 40).map((s) => s.id);
    const { items } = buildPlaylist(JFK_MIA, library, { ...ADULT, heardStoryIds: heard });
    for (const item of items) expect(heard).not.toContain(item.story.id);
  });

  it("fills the flight steadily instead of holding out for the single best story", () => {
    // Regression: a candidate placed at its ideal time in the future has zero timing
    // drift, so without a cost on silence the scheduler picks the highest-scoring story
    // in the whole remaining flight and skips everything before it. The symptom was ~9
    // stories, evenly spaced 19 minutes apart, each one a maximum on every scoring axis.
    const { items } = buildPlaylist(JFK_MIA, library, { ...ADULT, density: "immersive" });

    expect(items.length).toBeGreaterThan(30);

    const gaps = items.slice(1).map((item, i) => item.startS - items[i]!.endS);
    const medianGap = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)]!;
    // "immersive" on 90-second stories implies roughly a 48-second gap.
    expect(medianGap).toBeLessThan(180);
  });

  it("still waits when there is genuinely nothing to play", () => {
    // The dead-air penalty must not force a story to play wildly out of position just to
    // avoid silence: one story mid-route should stay near where it belongs.
    const lonely = makeStory({ id: "lonely", at: { lat: 33.69, lng: -78.89 } });
    const { items } = buildPlaylist(JFK_MIA, [lonely], ADULT);
    expect(items.length).toBe(1);
    const midpoint = items[0]!.startS + items[0]!.story.durationS / 2;
    expect(Math.abs(midpoint - items[0]!.nearestS)).toBeLessThanOrEqual(600);
  });

  it("copes with an empty library rather than throwing", () => {
    const playlist = buildPlaylist(JFK_MIA, [], ADULT);
    expect(playlist.items).toEqual([]);
    expect(playlist.totalAudioS).toBe(0);
  });

  it("crosses a long empty stretch without stalling", () => {
    // Two clusters with an ocean between them: the scheduler must jump the gap, not
    // crawl through it.
    const clustered = [
      ...storiesAlongJfkMia(10).slice(0, 5),
      ...storiesAlongJfkMia(10).slice(-5),
    ];
    const { items } = buildPlaylist(JFK_MIA, clustered, ADULT);
    expect(items.length).toBeGreaterThan(2);
  });

  it("refuses a flight plan with an unparseable departure time", () => {
    expect(() => buildPlaylist({ ...JFK_MIA, departureAt: "not a date" }, library, ADULT)).toThrow(
      /departureAt/,
    );
  });

  it("can require rendered audio, for route packaging", () => {
    const silent = library.map((s) => makeStory({ ...s, audioKey: undefined }));
    expect(buildPlaylist(JFK_MIA, silent, ADULT, { requireAudio: true }).items.length).toBe(0);
    expect(buildPlaylist(JFK_MIA, silent, ADULT).items.length).toBeGreaterThan(0);
  });
});
