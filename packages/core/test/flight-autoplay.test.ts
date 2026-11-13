/**
 * Flights play by themselves (James, 2026-11-13, decision 8): on a carried route, each
 * chosen echo plays when the flight reaches its moment.
 */
import { describe, expect, it } from "vitest";
import { WalkSession } from "../src/session/walk.js";
import { buildRouteGeometry, pointAtDistance } from "../src/geo/corridor.js";
import { upcomingOnRoute } from "../src/ranking/upcoming.js";
import type { AudioSink, LocationSource } from "../src/session/adapters.js";
import type { Position } from "../src/types.js";
import { ADULT, JFK_MIA, echoesAlongJfkMia } from "./fixtures.js";

const START = Date.parse("2026-06-15T14:00:00Z");
const LINE = buildRouteGeometry(JFK_MIA);
const LIBRARY = echoesAlongJfkMia(8);
/** The moments Coming up offers, in order. */
const MOMENTS = upcomingOnRoute(JFK_MIA, LIBRARY, ADULT, 0, { limit: 99, minLeadS: -Infinity });

class Plane implements LocationSource {
  private onFix: ((p: Position) => void) | null = null;
  watch(onFix: (p: Position) => void) {
    this.onFix = onFix;
    return () => void (this.onFix = null);
  }
  /** The aircraft, `km` along the route. */
  at(km: number, t = 0) {
    this.onFix?.({ at: pointAtDistance(LINE, km), timestamp: START + t * 1000, source: "dead-reckoned" });
  }
}

function flight({ autoPlay = true, only }: { autoPlay?: boolean; only?: readonly string[] } = {}) {
  const plane = new Plane();
  const played: string[] = [];
  let finish: () => void = () => {};
  const audio: AudioSink = {
    play: (key) => void played.push(key),
    pause: () => {},
    resume: () => {},
    stop: () => {},
    chime: () => {},
    ended: (h) => {
      finish = h;
      return () => {};
    },
  } as AudioSink;
  const session = new WalkSession(LIBRARY, ADULT, { location: plane, audio }, {
    mode: "flight",
    route: JFK_MIA,
    autoPlay,
    ...(only ? { autoPlayOnly: only } : {}),
  });
  session.start();
  return { plane, played, session, finish: () => finish() };
}

describe("a flight plays each echo at its moment", () => {
  it("has moments to play: the fixture's echoes are on the route's plan", () => {
    expect(MOMENTS.length).toBeGreaterThan(2);
  });

  it("plays nothing before the first moment, then the first echo when the flight reaches it", () => {
    const f = flight();
    const first = MOMENTS[0]!;
    f.plane.at(first.atKm - 20, 0);
    expect(f.played).toEqual([]);
    f.plane.at(first.atKm + 1, 60);
    expect(f.played).toEqual([`audio/${first.echo.id}.opus`]);
    expect(f.session.nowPlaying?.echo.id).toBe(first.echo.id);
  });

  it("plays each in turn as the flight goes on, one at a time", () => {
    const f = flight();
    for (const [i, m] of MOMENTS.slice(0, 3).entries()) {
      f.plane.at(m.atKm + 1, i * 600);
      f.finish();
    }
    expect(f.played.slice(0, 3)).toEqual(MOMENTS.slice(0, 3).map((m) => `audio/${m.echo.id}.opus`));
  });

  it("plays only the chosen few", () => {
    const chosen = MOMENTS[1]!.echo.id;
    const f = flight({ only: [chosen] });
    for (const [i, m] of MOMENTS.slice(0, 3).entries()) f.plane.at(m.atKm + 1, i * 600);
    expect(f.played).toEqual([`audio/${chosen}.opus`]);
  });

  it("plays nothing by itself with the switch off", () => {
    const f = flight({ autoPlay: false });
    for (const [i, m] of MOMENTS.entries()) f.plane.at(m.atKm + 1, i * 600);
    expect(f.played).toEqual([]);
  });

  it("lets a moment long behind go, when the journey is joined part way", () => {
    const f = flight();
    const last = MOMENTS[MOMENTS.length - 1]!;
    // Joined three hundred km past the first moment: the flight's tolerance is ten minutes
    // at 850 km/h, about 140 km.
    f.plane.at(MOMENTS[0]!.atKm + 300, 0);
    expect(f.played).not.toContain(`audio/${MOMENTS[0]!.echo.id}.opus`);
    f.finish();
    f.plane.at(last.atKm + 1, 3600);
    expect(f.played).toContain(`audio/${last.echo.id}.opus`);
  });

  it("does not play one again that was already heard on this flight", () => {
    const f = flight();
    const first = MOMENTS[0]!;
    f.session.play(first.echo);
    f.finish();
    f.plane.at(first.atKm + 1, 60);
    expect(f.played).toEqual([`audio/${first.echo.id}.opus`]);
  });
});
