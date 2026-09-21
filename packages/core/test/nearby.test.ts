import { describe, expect, it } from "vitest";
import { echoUnderfoot, findEchoesNearby } from "../src/ranking/nearby.js";
import { validateEcho, validateLibrary } from "../src/content/validate.js";
import { buildPlaylist } from "../src/ranking/playlist.js";
import type { Echo } from "../src/types.js";
import { ADULT, CHILD, JFK_MIA, MANHATTAN_WALK, makeEcho, echoesAlong } from "./fixtures.js";

const WALL_STREET = { lat: 40.7069, lng: -74.0113 };
const NOON = Date.parse("2026-06-15T17:00:00Z");

const errorsOn = (echo: Echo, field: string) =>
  validateEcho(echo).filter((i) => i.severity === "error" && i.field === field);
const allErrors = (echo: Echo) => validateEcho(echo).filter((i) => i.severity === "error");

describe("findEchoesNearby", () => {
  const library: Echo[] = [
    makeEcho({ id: "underfoot", at: WALL_STREET, triggerRadiusKm: 0.1, quality: 0.4 }),
    makeEcho({
      id: "two-streets-away",
      at: { lat: 40.7089, lng: -74.0101 },
      triggerRadiusKm: 0.1,
      quality: 1,
    }),
    makeEcho({ id: "brooklyn", at: { lat: 40.678, lng: -73.944 }, triggerRadiusKm: 0.1 }),
  ];

  it("finds what is around a point with no route at all", () => {
    const found = findEchoesNearby(WALL_STREET, library, ADULT, { atMs: NOON });
    expect(found.length).toBeGreaterThan(0);
    expect(found.map((n) => n.echo.id)).toContain("underfoot");
  });

  it("excludes what is out of range", () => {
    // Brooklyn is several km away; walking range should not reach it.
    const found = findEchoesNearby(WALL_STREET, library, ADULT, { atMs: NOON });
    expect(found.map((n) => n.echo.id)).not.toContain("brooklyn");
  });

  it("widens with the radius", () => {
    const far = findEchoesNearby(WALL_STREET, library, ADULT, { atMs: NOON, radiusKm: 20 });
    expect(far.map((n) => n.echo.id)).toContain("brooklyn");
  });

  it("lets something remarkable two streets away outrank something dull underfoot", () => {
    // Pure proximity ranking would put the nearest thing first, which in a city centre
    // means the least interesting thing within twenty metres wins. Someone deciding where
    // to walk wants the opposite.
    const found = findEchoesNearby(WALL_STREET, library, ADULT, { atMs: NOON });
    expect(found[0]!.echo.id).toBe("two-streets-away");
  });

  it("reports distance and whether the listener is actually inside the radius", () => {
    const found = findEchoesNearby(WALL_STREET, library, ADULT, { atMs: NOON });
    const underfoot = found.find((n) => n.echo.id === "underfoot")!;
    expect(underfoot.distanceKm).toBeLessThan(0.05);
    expect(underfoot.inRange).toBe(true);

    const away = found.find((n) => n.echo.id === "two-streets-away")!;
    expect(away.inRange).toBe(false);
  });

  it("applies the same safety gates as a route", () => {
    const adult = makeEcho({ id: "adult-only", at: WALL_STREET, minAge: 18 });
    const found = findEchoesNearby(WALL_STREET, [adult], CHILD, { atMs: NOON });
    expect(found).toEqual([]);
  });

  it("honours the result limit", () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      makeEcho({ id: `n${i}`, at: { lat: 40.7069 + i * 0.0001, lng: -74.0113 } }),
    );
    expect(findEchoesNearby(WALL_STREET, many, ADULT, { atMs: NOON, limit: 5 }).length).toBe(5);
  });

  it("returns nothing in the middle of nowhere rather than throwing", () => {
    expect(findEchoesNearby({ lat: 0, lng: -30 }, library, ADULT, { atMs: NOON })).toEqual([]);
  });
});

describe("echoUnderfoot", () => {
  it("fires only when the listener is genuinely inside a trigger radius", () => {
    const here = makeEcho({ id: "here", at: WALL_STREET, triggerRadiusKm: 0.1 });
    expect(echoUnderfoot(WALL_STREET, [here], ADULT, { atMs: NOON })?.echo.id).toBe("here");
  });

  it("stays silent when the nearest echo is merely nearby", () => {
    // An unprompted interruption about somewhere half a mile away teaches people to
    // ignore the next one.
    const nearish = makeEcho({
      id: "nearish",
      at: { lat: 40.7115, lng: -74.0077 },
      triggerRadiusKm: 0.05,
    });
    expect(echoUnderfoot(WALL_STREET, [nearish], ADULT, { atMs: NOON })).toBeNull();
  });

  it("picks the closest when two radii overlap, not the best", () => {
    const onTopOf = makeEcho({ id: "on-top-of", at: WALL_STREET, triggerRadiusKm: 0.2, quality: 0.3 });
    const alsoCovering = makeEcho({
      id: "also-covering",
      at: { lat: 40.708, lng: -74.0113 },
      triggerRadiusKm: 5,
      quality: 1,
    });
    const found = echoUnderfoot(WALL_STREET, [onTopOf, alsoCovering], ADULT, { atMs: NOON });
    expect(found?.echo.id).toBe("on-top-of");
  });

  it("returns null on an empty library", () => {
    expect(echoUnderfoot(WALL_STREET, [], ADULT, { atMs: NOON })).toBeNull();
  });
});

describe("certainty", () => {
  const legend = (overrides: Partial<Echo> = {}) =>
    makeEcho({
      id: "atchison-house",
      at: { lat: 39.563, lng: -95.121 },
      category: "local-legends",
      certainty: "legend",
      certaintyNote: "Told locally since the 1990s; no contemporary record supports it.",
      ...overrides,
    });

  it("accepts a properly labelled legend", () => {
    expect(allErrors(legend())).toEqual([]);
  });

  it("refuses to let a ghost story call itself documented", () => {
    expect(errorsOn(legend({ certainty: "documented" }), "certainty")).toHaveLength(1);
  });

  it("requires a note saying what is uncertain", () => {
    // "Sources differ" without saying how is not a disclosure.
    expect(errorsOn(legend({ certaintyNote: "  " }), "certaintyNote")).toHaveLength(1);
  });

  it("wants both sides of a contested claim", () => {
    const oneSided = legend({
      category: "history",
      certainty: "contested",
      certaintyNote: "The date is disputed.",
    });
    expect(errorsOn(oneSided, "sources")).toHaveLength(1);
  });

  it("keeps folklore out of true crime", () => {
    // True crime concerns real people and real harm.
    const folklore = legend({ category: "true-crime", minAge: 16 });
    expect(errorsOn(folklore, "certainty")).toHaveLength(1);
  });

  it("lets a documented echo say things plainly, with no note", () => {
    const plain = makeEcho({ id: "plain", at: { lat: 33, lng: -79 }, certainty: "documented" });
    expect(allErrors(plain)).toEqual([]);
  });
});

describe("perspective", () => {
  const company = makeEcho({
    id: "company-account",
    at: { lat: 33.69, lng: -78.89 },
    perspectiveIds: ["workers-account"],
  });
  const workers = makeEcho({
    id: "workers-account",
    at: { lat: 33.69, lng: -78.89 },
    perspectiveIds: ["company-account"],
  });

  it("plays both accounts of one event, unlike duplicates", () => {
    // relatedIds would suppress the second. perspectiveIds must not.
    const { items } = buildPlaylist(JFK_MIA, [company, workers], ADULT);
    expect(items.length).toBe(2);
  });

  it("still suppresses genuine duplicates", () => {
    const a = makeEcho({ id: "dup-a", at: { lat: 33.69, lng: -78.89 }, relatedIds: ["dup-b"] });
    const b = makeEcho({ id: "dup-b", at: { lat: 33.69, lng: -78.89 }, relatedIds: ["dup-a"] });
    expect(buildPlaylist(JFK_MIA, [a, b], ADULT).items.length).toBe(1);
  });

  it("rejects an id that is both a duplicate and a counterpoint", () => {
    const contradictory = makeEcho({
      id: "muddled",
      at: { lat: 33, lng: -79 },
      relatedIds: ["other"],
      perspectiveIds: ["other"],
    });
    expect(errorsOn(contradictory, "perspectiveIds")).toHaveLength(1);
  });

  it("rejects an echo listing itself", () => {
    const selfish = makeEcho({ id: "selfish", at: { lat: 33, lng: -79 }, perspectiveIds: ["selfish"] });
    expect(errorsOn(selfish, "perspectiveIds")).toHaveLength(1);
  });

  it("catches a dangling counterpoint across the library", () => {
    const report = validateLibrary([
      makeEcho({ id: "one", at: { lat: 33, lng: -79 }, perspectiveIds: ["ghost"] }),
    ]);
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.field === "perspectiveIds")).toBe(true);
  });

  it("does not disturb an ordinary route", () => {
    const library = echoesAlong(MANHATTAN_WALK, 20);
    expect(buildPlaylist(MANHATTAN_WALK, library, ADULT).items.length).toBeGreaterThan(3);
  });
});
