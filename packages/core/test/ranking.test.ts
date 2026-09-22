import { describe, expect, it } from "vitest";
import { checkEligibility, scoreEcho } from "../src/ranking/score.js";
import type { EligibilityContext, ScoreContext } from "../src/ranking/score.js";
import { buildPlaylist } from "../src/ranking/playlist.js";
import type { CorridorHit } from "../src/geo/corridor.js";
import type { ListenerProfile, Echo, TrueCrimeReview } from "../src/types.js";
import {
  ADULT,
  CHILD,
  JFK_MIA,
  MANHATTAN_WALK,
  makeEcho,
  echoesAlongJfkMia,
  TRUE_CRIME_FAN,
} from "./fixtures.js";
import { buildRouteGeometry, pointAtDistance } from "../src/geo/corridor.js";
import { RouteProfile } from "../src/route/profile.js";

const NOON_UTC = Date.parse("2026-06-15T17:00:00Z");

const REVIEW: TrueCrimeReview = {
  involvesLivingPeople: false,
  convictionStatus: "convicted",
  reviewedBy: "editorial-lead",
  reviewedAt: "2026-08-01",
  contentWarning: "This echo describes a violent crime.",
};

const hitFor = (echo: Echo, crossTrackKm = 5): CorridorHit => ({
  echo,
  crossTrackKm,
  alongTrackKm: 500,
  nearestPoint: echo.point.at,
});

describe("checkEligibility", () => {
  const base: EligibilityContext = { profile: ADULT, playAtMs: NOON_UTC, mode: "flight" };

  it("passes an approved, corroborated, in-category echo", () => {
    const echo = makeEcho({ id: "ok", at: { lat: 33, lng: -79 } });
    expect(checkEligibility(echo, base).eligible).toBe(true);
  });

  it("blocks anything not approved", () => {
    const echo = makeEcho({ id: "draft", at: { lat: 33, lng: -79 }, editorial: "draft" });
    expect(checkEligibility(echo, base).reasons).toContain("not-approved");
  });

  it("blocks unverified and disputed facts", () => {
    for (const factCheck of ["unchecked", "disputed"] as const) {
      const echo = makeEcho({ id: "shaky", at: { lat: 33, lng: -79 }, factCheck });
      expect(checkEligibility(echo, base).reasons).toContain("facts-unverified");
    }
  });

  it("keeps an age-gated echo away from a child", () => {
    const echo = makeEcho({ id: "grim", at: { lat: 33, lng: -79 }, minAge: 16, category: "history" });
    const result = checkEligibility(echo, { ...base, profile: CHILD });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("below-min-age");
  });

  it("will not play true crime to someone who never asked for it", () => {
    const echo = makeEcho({
      id: "crime",
      at: { lat: 33, lng: -79 },
      category: "true-crime",
      minAge: 16,
      trueCrimeReview: REVIEW,
    });
    expect(checkEligibility(echo, base).reasons).toContain("opt-in-required");
  });

  it("distinguishes an opt-in category from one simply switched off", () => {
    const musicOff = makeEcho({ id: "arts", at: { lat: 33, lng: -79 }, category: "arts" });
    const narrowed: ListenerProfile = { ...ADULT, categories: ["history"] };
    expect(checkEligibility(musicOff, { ...base, profile: narrowed }).reasons).toContain(
      "category-off",
    );
  });

  it("blocks true crime that lacks a signed human review, even for a fan", () => {
    const echo = makeEcho({
      id: "unreviewed-crime",
      at: { lat: 33, lng: -79 },
      category: "true-crime",
      minAge: 16,
    });
    const result = checkEligibility(echo, { ...base, profile: TRUE_CRIME_FAN });
    expect(result.reasons).toContain("missing-true-crime-review");
  });

  it("does not repeat an echo the passenger has already heard", () => {
    const echo = makeEcho({ id: "repeat", at: { lat: 33, lng: -79 } });
    const repeatListener: ListenerProfile = { ...ADULT, heardEchoIds: ["repeat"] };
    expect(checkEligibility(echo, { ...base, profile: repeatListener }).reasons).toContain(
      "already-heard",
    );
  });

  it("requires audio only when the caller asks for it", () => {
    const silent = makeEcho({ id: "silent", at: { lat: 33, lng: -79 }, audioKey: undefined });
    expect(checkEligibility(silent, base).eligible).toBe(true);
    expect(checkEligibility(silent, { ...base, requireAudio: true }).reasons).toContain("no-audio");
  });

  it("honours an hours window, including one that wraps midnight", () => {
    const nightOnly = makeEcho({
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
    const bad = makeEcho({
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

describe("scoreEcho", () => {
  it("prefers an echo directly below to one at the corridor edge", () => {
    const echo = makeEcho({ id: "s", at: { lat: 33, lng: -79 }, triggerRadiusKm: 60 });
    const near = scoreEcho(hitFor(echo, 2), { profile: ADULT, playAtMs: NOON_UTC, mode: "flight" });
    const far = scoreEcho(hitFor(echo, 58), { profile: ADULT, playAtMs: NOON_UTC, mode: "flight" });
    expect(near.total).toBeGreaterThan(far.total);
    expect(near.proximity).toBeGreaterThan(0.95);
  });

  it("rewards editorial quality above everything else", () => {
    const good = makeEcho({ id: "good", at: { lat: 33, lng: -79 }, quality: 1 });
    const weak = makeEcho({ id: "weak", at: { lat: 33, lng: -79 }, quality: 0.2 });
    const ctx: ScoreContext = { profile: ADULT, playAtMs: NOON_UTC, mode: "flight" };
    expect(scoreEcho(hitFor(good), ctx).total - scoreEcho(hitFor(weak), ctx).total).toBeGreaterThan(
      0.25,
    );
  });

  it("all but silences a daylight-dependent echo at night", () => {
    const echo = makeEcho({
      id: "canyon",
      at: { lat: 36.1, lng: -112.1 },
      visibility: "daylight-dependent",
    });
    const day = scoreEcho(hitFor(echo), {
      profile: ADULT,
      playAtMs: Date.parse("2026-06-15T19:00:00Z"),
      mode: "flight",
    });
    const night = scoreEcho(hitFor(echo), {
      profile: ADULT,
      playAtMs: Date.parse("2026-06-15T08:00:00Z"),
      mode: "flight",
    });
    expect(day.visibility).toBeGreaterThan(0.8);
    expect(night.visibility).toBeLessThan(0.2);
  });

  it("stays neutral when it has no interest signal, rather than punishing the echo", () => {
    const echo = makeEcho({ id: "untagged", at: { lat: 33, lng: -79 }, tags: ["obscure"] });
    const score = scoreEcho(hitFor(echo), {
      profile: { ...ADULT, interests: { jazz: 1 } },
      playAtMs: NOON_UTC,
      mode: "flight",
    });
    expect(score.interest).toBe(0.5);
  });

  it("lifts an echo matching a stated interest", () => {
    const echo = makeEcho({ id: "jazzy", at: { lat: 33, lng: -79 }, tags: ["jazz"] });
    const score = scoreEcho(hitFor(echo), {
      profile: { ...ADULT, interests: { jazz: 1 } },
      playAtMs: NOON_UTC,
      mode: "flight",
    });
    expect(score.interest).toBe(1);
  });

  it("stays within 0 and 1", () => {
    const echo = makeEcho({ id: "s", at: { lat: 33, lng: -79 }, quality: 1, visibility: "landmark-visible" });
    const score = scoreEcho(hitFor(echo, 0), {
      profile: ADULT,
      playAtMs: NOON_UTC,
      mode: "flight",
    });
    expect(score.total).toBeLessThanOrEqual(1);
    expect(score.total).toBeGreaterThanOrEqual(0);
  });
});

describe("buildPlaylist", () => {
  const library = echoesAlongJfkMia(120);

  it("produces a flight's worth of listening", () => {
    const playlist = buildPlaylist(JFK_MIA, library, ADULT);
    expect(playlist.items.length).toBeGreaterThan(10);
    expect(playlist.routeId).toBe(JFK_MIA.id);
  });

  it("never overlaps two echoes", () => {
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

  it("never plays the same echo twice", () => {
    const { items } = buildPlaylist(JFK_MIA, library, ADULT);
    const ids = items.map((i) => i.echo.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("plays each echo near the place it is about", () => {
    const { items } = buildPlaylist(JFK_MIA, library, ADULT);
    for (const item of items) {
      const midpoint = item.startS + item.echo.durationS / 2;
      expect(Math.abs(midpoint - item.nearestS)).toBeLessThanOrEqual(600);
    }
  });

  it("varies categories instead of running four histories together", () => {
    const { items } = buildPlaylist(JFK_MIA, library, ADULT);
    let repeats = 0;
    for (let i = 1; i < items.length; i++) {
      if (items[i]!.echo.category === items[i - 1]!.echo.category) repeats++;
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
    const scheduled = new Set(playlist.items.map((i) => i.echo.id));
    for (const echo of playlist.reserve) expect(scheduled.has(echo.id)).toBe(false);
  });

  it("keeps a child's flight free of adult material", () => {
    const adultLibrary = [
      ...echoesAlongJfkMia(40, ["kids", "land"]),
      ...echoesAlongJfkMia(40, ["true-crime"]).map((s) =>
        makeEcho({ ...s, id: `tc-${s.id}`, minAge: 16, trueCrimeReview: REVIEW }),
      ),
    ];
    const playlist = buildPlaylist(JFK_MIA, adultLibrary, CHILD);
    expect(playlist.items.length).toBeGreaterThan(0);
    for (const item of playlist.items) {
      expect(item.echo.category).not.toBe("true-crime");
      expect(item.echo.minAge).toBeLessThanOrEqual(CHILD.age);
    }
  });

  it("gives a true-crime fan true crime, once they have opted in", () => {
    const crimeLibrary = echoesAlongJfkMia(60, ["true-crime"]).map((s) =>
      makeEcho({ ...s, minAge: 16, trueCrimeReview: REVIEW }),
    );
    expect(buildPlaylist(JFK_MIA, crimeLibrary, ADULT).items.length).toBe(0);
    expect(buildPlaylist(JFK_MIA, crimeLibrary, TRUE_CRIME_FAN).items.length).toBeGreaterThan(0);
  });

  it("does not cover the same subject twice", () => {
    const a = makeEcho({ id: "river-a", at: { lat: 33.69, lng: -78.89 }, relatedIds: ["river-b"] });
    const b = makeEcho({ id: "river-b", at: { lat: 33.7, lng: -78.9 }, relatedIds: ["river-a"] });
    const { items } = buildPlaylist(JFK_MIA, [a, b], ADULT);
    expect(items.length).toBe(1);
  });

  it("skips echoes the passenger has already heard on an earlier flight", () => {
    const heard = library.slice(0, 40).map((s) => s.id);
    const { items } = buildPlaylist(JFK_MIA, library, { ...ADULT, heardEchoIds: heard });
    for (const item of items) expect(heard).not.toContain(item.echo.id);
  });

  it("fills the flight steadily instead of holding out for the single best echo", () => {
    // Regression: a candidate placed at its ideal time in the future has zero timing
    // drift, so without a cost on silence the scheduler picks the highest-scoring echo
    // in the whole remaining flight and skips everything before it. The symptom was ~9
    // echoes, evenly spaced 19 minutes apart, each one a maximum on every scoring axis.
    const { items } = buildPlaylist(JFK_MIA, library, { ...ADULT, density: "immersive" });

    expect(items.length).toBeGreaterThan(30);

    const gaps = items.slice(1).map((item, i) => item.startS - items[i]!.endS);
    const medianGap = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)]!;
    // "immersive" on 90-second echoes implies roughly a 48-second gap.
    expect(medianGap).toBeLessThan(180);
  });

  it("still waits when there is genuinely nothing to play", () => {
    // The dead-air penalty must not force an echo to play wildly out of position just to
    // avoid silence: one echo mid-route should stay near where it belongs.
    const lonely = makeEcho({ id: "lonely", at: { lat: 33.69, lng: -78.89 } });
    const { items } = buildPlaylist(JFK_MIA, [lonely], ADULT);
    expect(items.length).toBe(1);
    const midpoint = items[0]!.startS + items[0]!.echo.durationS / 2;
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
      ...echoesAlongJfkMia(10).slice(0, 5),
      ...echoesAlongJfkMia(10).slice(-5),
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
    const silent = library.map((s) => makeEcho({ ...s, audioKey: undefined }));
    expect(buildPlaylist(JFK_MIA, silent, ADULT, { requireAudio: true }).items.length).toBe(0);
    expect(buildPlaylist(JFK_MIA, silent, ADULT).items.length).toBeGreaterThan(0);
  });
});

describe("buildPlaylist on a route with stops", () => {
  const geometry = buildRouteGeometry(MANHATTAN_WALK);

  /** A walk whose third waypoint is a stop the listener stands at for four minutes. */
  const withStop = (dwellS: number) => ({
    ...MANHATTAN_WALK,
    waypoints: MANHATTAN_WALK.waypoints.map((waypoint, i) =>
      i === 2 ? { ...waypoint, dwellS } : waypoint,
    ),
  });

  const atWaypoint = (index: number) =>
    pointAtDistance(geometry, geometry.cumulativeKm[geometry.waypointIndex[index]!]!);

  it("plays two echoes about one corner, because the listener is standing on it", () => {
    // The case that drove the dwell and distance-drift work. Bowling Green carries both
    // the King George statue and the Charging Bull; measured in seconds the second echo is
    // three minutes stale and gets dropped, measured in metres the listener has not moved
    // at all and it is exactly where it belongs.
    const here = atWaypoint(2);
    const pair = [
      makeEcho({ id: "corner-a", at: here, triggerRadiusKm: 0.12, durationS: 90 }),
      makeEcho({ id: "corner-b", at: here, triggerRadiusKm: 0.12, durationS: 90 }),
    ];

    const route = withStop(300);
    const items = buildPlaylist(route, pair, ADULT).items;
    expect(items.map((item) => item.echo.id).sort()).toEqual(["corner-a", "corner-b"]);

    // And both are heard while the listener is still on the corner, rather than one of
    // them trailing after them up the street.
    const profile = RouteProfile.forRoute(route, geometry);
    const arrival = profile.timeAtDistance(geometry.cumulativeKm[geometry.waypointIndex[2]!]!);
    for (const item of items) {
      expect(item.startS).toBeGreaterThanOrEqual(arrival - 60);
      expect(item.endS).toBeLessThanOrEqual(arrival + 300);
    }
  });

  it("plays an echo at the destination, which arrival would otherwise cut off", () => {
    // Regression: the final waypoint's echo is anchored at the very end of the route, so a
    // window that closes on arrival made it the one echo that could never play — on a walk
    // that is the place the whole route was built to reach.
    const destination = MANHATTAN_WALK.waypoints[MANHATTAN_WALK.waypoints.length - 1]!.at;
    const echo = makeEcho({ id: "at-the-end", at: destination, triggerRadiusKm: 0.12 });
    expect(buildPlaylist(MANHATTAN_WALK, [echo], ADULT).items.length).toBe(1);
  });

  it("takes the echo it is about to lose over a better one further along", () => {
    // Regression: greedy scheduling weighs "this one now" against "that one shortly" and
    // never notices that choosing the second forfeits the first. On the real walk it
    // declined the Wall Street echo at zero drift to wait for Trinity Church, and by the
    // time Trinity finished the listener was past the wall for good.
    const perishable = makeEcho({
      id: "perishable",
      at: atWaypoint(2),
      triggerRadiusKm: 0.12,
      durationS: 90,
    });
    // Slightly further on, and scored higher: closer to the line, so a better corridor hit.
    const keeps = makeEcho({
      id: "keeps",
      at: atWaypoint(3),
      triggerRadiusKm: 0.12,
      durationS: 90,
    });

    const ids = buildPlaylist(withStop(0), [perishable, keeps], ADULT).items.map((i) => i.echo.id);
    expect(ids).toContain("perishable");
    expect(ids).toContain("keeps");
  });

  it("does not enforce variety a themed route cannot supply", () => {
    // Eleven of the twelve echoes on the Lower Manhattan walk are history, because the walk
    // is about history. Charging the full same-category penalty anyway bought a change of
    // subject at the price of minutes of silence, and pushed echoes off the route entirely.
    const themed = MANHATTAN_WALK.waypoints.map((waypoint, i) =>
      makeEcho({
        id: `history-${i}`,
        at: waypoint.at,
        triggerRadiusKm: 0.12,
        category: "history",
        durationS: 90,
      }),
    );

    const { items } = buildPlaylist(MANHATTAN_WALK, themed, ADULT);
    expect(items.length).toBeGreaterThanOrEqual(themed.length - 1);
  });
});

describe("dead air pricing", () => {
  it("keeps the flight full: the penalty grows with the wait and is never flattened", () => {
    // Two bugs, one guard. Capping the penalty made every long wait score alike, so the
    // variety rules decided between four minutes of silence and twenty. Flattening its
    // slope — raising the horizon to buy the same fix — cost a fifth of the flight's
    // echoes and tripled the median gap. Both show up here as a sparser flight.
    const library = echoesAlongJfkMia(120);
    const { items } = buildPlaylist(JFK_MIA, library, { ...ADULT, density: "immersive" });

    expect(items.length).toBeGreaterThan(50);

    const gaps = items.slice(1).map((item, i) => item.startS - items[i]!.endS);
    const medianGap = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)]!;
    // "immersive" on 90-second echoes implies roughly a 48-second gap, and with this much
    // material to choose from the scheduler should be sitting right on it.
    expect(medianGap).toBeLessThan(90);
  });
});
