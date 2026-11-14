/**
 * The iPhone app's walk, the pure half (`apps/ios/src/walk/logic.ts`): what a location
 * update decides (the engine's arrival rules, the same as the web's walk) and the
 * permission ladder for Always (`docs/ios-permissions.md`).
 *
 * Run from the root suite, as `playback.test.ts` is: `logic.ts` imports nothing but the
 * engine.
 */
import { describe, expect, it } from "vitest";
import { WalkSession, type Echo, type LatLng, type LocationSource, type Position } from "@echofinders/core";
import {
  FALLBACK_LINE,
  FRESH_LADDER,
  HANDS_FREE_SHEET,
  NO_LOCATION_LINE,
  DRIVE_SHEET,
  DRIVING_UPDATES,
  askOnDrive,
  updatesFor,
  locationAccessOf,
  WALKING_LINE,
  WALKING_UPDATES,
  WALK_LISTENER,
  WalkJudge,
  afterAlwaysAnswer,
  afterExplanation,
  fallbackFor,
  grantedCapabilities,
  parseRecords,
  planWalk,
  positionOf,
  type Fix,
  type Grant,
} from "../../apps/ios/src/walk/logic.js";

/** Bowling Green, New York. */
const here: LatLng = { lat: 40.7049, lng: -74.0137 };
/** About a kilometre north. */
const away: LatLng = { lat: 40.7139, lng: -74.0137 };

function echo(id: string, at: LatLng, extra: Partial<Echo> = {}): Echo {
  return {
    id,
    title: `Echo ${id}`,
    point: { at, triggerRadiusKm: 0.05, place: "Bowling Green" },
    category: "history",
    era: "colonial",
    tone: "documentary",
    minAge: 0,
    durationS: 120,
    editorial: "approved",
    script: "",
    renders: [{ voiceId: "v", audioKey: `audio/${id}/v.mp3`, durationS: 120 }],
    ...extra,
  } as unknown as Echo;
}

/** A fix as expo-location gives it, walking pace unless told otherwise. */
function fix(at: LatLng, timestamp: number, accuracy: number | null = 8, speed: number | null = 1.2): Fix {
  return { coords: { latitude: at.lat, longitude: at.lng, accuracy, speed }, timestamp };
}

const T0 = Date.parse("2026-11-12T15:00:00Z");

describe("positionOf", () => {
  it("is the engine's position, speed in kph", () => {
    const p = positionOf(fix(here, T0, 12, 1.5));
    expect(p).toEqual({ at: here, timestamp: T0, source: "device-gnss", accuracyM: 12, speedKph: 1.5 * 3.6 });
  });

  it("leaves out what iOS does not know rather than saying zero", () => {
    const p = positionOf(fix(here, T0, null, -1));
    expect(p.accuracyM).toBeUndefined();
    expect(p.speedKph).toBeUndefined();
  });
});

describe("WalkJudge", () => {
  it("offers an echo once you have settled inside it, not on the first fix", () => {
    const judge = new WalkJudge([echo("a", here)]);
    const [first] = judge.update([fix(here, T0)]);
    expect(first!.offer).toEqual([]);
    const [second] = judge.update([fix(here, T0 + 4000)]);
    expect(second!.offer.map((e) => e.id)).toEqual(["a"]);
    expect(second!.at).toEqual(here);
  });

  it("never offers the same echo twice", () => {
    const judge = new WalkJudge([echo("a", here)]);
    judge.update([fix(here, T0), fix(here, T0 + 4000)]);
    const later = judge.update([fix(here, T0 + 8000), fix(here, T0 + 12000)]);
    expect(later.flatMap((s) => s.offer)).toEqual([]);
    expect(judge.found("a")).toBe(true);
  });

  it("takes a batch from the background oldest first, and ignores a fix it has seen", () => {
    const judge = new WalkJudge([echo("a", here)]);
    const steps = judge.update([fix(here, T0 + 4000), fix(here, T0), fix(here, T0)]);
    expect(steps).toHaveLength(2);
    expect(steps[1]!.offer.map((e) => e.id)).toEqual(["a"]);
    expect(judge.update([fix(here, T0 + 4000)])).toEqual([]);
  });

  it("does not open an echo you pass at speed (a bus is not a stop)", () => {
    const judge = new WalkJudge([echo("a", here)]);
    // 30 m in 2 s is 54 kph.
    const north = { lat: here.lat + 0.00027, lng: here.lng };
    const steps = judge.update([fix(north, T0, 8, 15), fix(here, T0 + 2000, 8, 15), fix(north, T0 + 4000, 8, 15)]);
    expect(steps.flatMap((s) => s.offer)).toEqual([]);
  });

  it("does not open an echo from a fix too vague for its radius", () => {
    const judge = new WalkJudge([echo("a", here)]);
    const steps = judge.update([fix(here, T0, 400), fix(here, T0 + 4000, 400)]);
    expect(steps.flatMap((s) => s.offer)).toEqual([]);
  });

  it("does not open an echo out of range", () => {
    const judge = new WalkJudge([echo("a", away)]);
    const steps = judge.update([fix(here, T0), fix(here, T0 + 4000)]);
    expect(steps.flatMap((s) => s.offer)).toEqual([]);
  });

  it("finds but does not offer an echo with no recording", () => {
    const judge = new WalkJudge([echo("a", here, { renders: [] })]);
    const steps = judge.update([fix(here, T0), fix(here, T0 + 4000)]);
    expect(steps.flatMap((s) => s.offer)).toEqual([]);
    expect(steps.flatMap((s) => s.found).map((r) => r.echoId)).toEqual(["a"]);
  });

  it("follows the web listener: true crime is opt in, so it does not open", () => {
    expect(WALK_LISTENER.categories).not.toContain("true-crime");
    const judge = new WalkJudge([echo("a", here, { category: "true-crime" } as Partial<Echo>)]);
    const steps = judge.update([fix(here, T0), fix(here, T0 + 4000)]);
    expect(steps.flatMap((s) => s.found)).toEqual([]);
  });

  it("decides what the web's walk decides, fix for fix", () => {
    const library = [echo("a", here), echo("b", { lat: here.lat + 0.0003, lng: here.lng }), echo("c", away)];
    const path: Fix[] = [];
    for (let i = 0; i < 20; i++) {
      const at = { lat: here.lat + i * 0.00005, lng: here.lng };
      path.push(fix(at, T0 + i * 5000));
    }
    const judge = new WalkJudge(library);
    const ours = judge.update(path).flatMap((s) => s.found.map((r) => r.echoId));

    // The web's walk, auto play on, fed the same fixes.
    let feed: ((p: Position) => void) | null = null;
    const location: LocationSource = {
      watch: (onFix) => {
        feed = onFix;
        return () => undefined;
      },
    };
    const web = new WalkSession(library, WALK_LISTENER, { location }, { mode: "walking", autoPlay: true });
    const theirs: string[] = [];
    web.subscribe((event) => {
      if (event.type === "captured") theirs.push(event.capture.echo.id);
    });
    web.start();
    for (const f of path) feed!(positionOf(f));

    expect(ours.length).toBeGreaterThan(0);
    expect(ours).toEqual(theirs);
  });

  it("restores what an earlier launch found, and keeps no position", () => {
    const first = new WalkJudge([echo("a", here)]);
    first.update([fix(here, T0), fix(here, T0 + 4000)]);
    const kept = first.records;
    expect(kept).toHaveLength(1);
    expect(kept[0]!.stoodAt).toBeUndefined();
    expect(kept[0]!.distanceKm).toBeUndefined();

    const again = new WalkJudge([echo("a", here)], parseRecords(JSON.parse(JSON.stringify({ found: kept }))));
    expect(again.found("a")).toBe(true);
    const steps = again.update([fix(here, T0 + 60000), fix(here, T0 + 64000)]);
    expect(steps.flatMap((s) => s.offer)).toEqual([]);
  });

  it("reads back only records", () => {
    expect(parseRecords(null)).toEqual([]);
    expect(parseRecords({ found: "no" })).toEqual([]);
    expect(parseRecords({ found: [{ echoId: "a", capturedAt: "x" }, { echoId: 3 }, null] })).toEqual([{ echoId: "a", capturedAt: "x" }]);
  });
});

describe("the permission ladder", () => {
  const yes: Grant = { granted: true, canAskAgain: true };
  const notYet: Grant = { granted: false, canAskAgain: true };
  const never: Grant = { granted: false, canAskAgain: false };

  it("asks When In Use first, if it never was", () => {
    expect(planWalk(notYet, notYet, FRESH_LADDER)).toEqual({ kind: "ask-while-using" });
  });

  it("cannot walk when When In Use was refused for good", () => {
    expect(planWalk(never, notYet, FRESH_LADDER)).toEqual({ kind: "no-location" });
  });

  it("explains before asking for Always, the first time a hands free walk starts", () => {
    expect(planWalk(yes, notYet, FRESH_LADDER)).toEqual({ kind: "explain" });
  });

  it("walks hands free once Always is granted, asking nothing", () => {
    expect(planWalk(yes, yes, FRESH_LADDER)).toEqual({ kind: "hands-free" });
  });

  it("goes on screen when iOS will not ask for Always again", () => {
    expect(planWalk(yes, never, FRESH_LADDER)).toEqual({ kind: "on-screen" });
  });

  it("never asks again in the launch after Not now", () => {
    const { session, ask } = afterExplanation(FRESH_LADDER, "not-now");
    expect(ask).toBe(false);
    expect(planWalk(yes, notYet, session)).toEqual({ kind: "on-screen" });
  });

  it("asks iOS after Turn on hands free, and not again in the launch whatever it said", () => {
    const { session, ask } = afterExplanation(FRESH_LADDER, "turn-on");
    expect(ask).toBe(true);
    expect(afterAlwaysAnswer(yes)).toEqual({ kind: "hands-free" });
    // Refused, or Allow Once earlier (iOS answers refused without asking).
    expect(afterAlwaysAnswer(notYet)).toEqual({ kind: "on-screen" });
    expect(planWalk(yes, notYet, session)).toEqual({ kind: "on-screen" });
  });

  it("speaks the engine's language for what is granted", () => {
    expect(grantedCapabilities(yes, notYet)).toEqual(["location-foreground"]);
    expect(grantedCapabilities(yes, yes)).toEqual(["location-foreground", "location-background"]);
    expect(grantedCapabilities(notYet, yes)).toEqual([]);
  });

  it("shows the fallback line once a launch, and only for a walk on screen", () => {
    expect(fallbackFor({ kind: "hands-free" }, FRESH_LADDER).line).toBeNull();
    const first = fallbackFor({ kind: "on-screen" }, FRESH_LADDER);
    expect(first.line).toBe(FALLBACK_LINE);
    expect(fallbackFor({ kind: "on-screen" }, first.session).line).toBeNull();
  });
});

describe("the walk's settings and words", () => {
  it("listens for a walk, with the background indicator and pausing when still", () => {
    expect(WALKING_UPDATES).toMatchObject({
      accuracy: "high",
      activity: "fitness",
      pausesUpdatesAutomatically: true,
      showsBackgroundLocationIndicator: true,
    });
    expect(WALKING_UPDATES.distanceIntervalM).toBeGreaterThan(0);
    expect(WALKING_UPDATES.distanceIntervalM).toBeLessThanOrEqual(20);
  });

  it("says the approved sentences, with no dashes", () => {
    expect(HANDS_FREE_SHEET).toEqual({
      caps: "HANDS FREE",
      title: "Walk with your phone in your pocket",
      body:
        "Echoes start on their own as you reach them, with the screen off. To do that, Echo Finders needs to know where you are while the app is closed. It is used only to find echoes near you. Your exact location stays on your phone.",
      primary: "Turn on hands free",
      secondary: "Not now",
    });
    expect(FALLBACK_LINE).toBe("Keep Echo Finders on screen while you walk and echoes will still open.");
    const all = [...Object.values(HANDS_FREE_SHEET), FALLBACK_LINE, NO_LOCATION_LINE, ...Object.values(WALKING_LINE)];
    for (const line of all) expect(line).not.toMatch(/[–—]|\s-\s/);
  });
});

describe("location for Echo Finders, as the page is told it (mock 7)", () => {
  const yes = { granted: true, canAskAgain: true, status: "granted" };
  const no = { granted: false, canAskAgain: false, status: "denied" };
  const never = { granted: false, canAskAgain: true, status: "undetermined" };

  it("off when Location Services are off, whatever was granted", () => {
    expect(locationAccessOf(false, yes, yes)).toBe("off");
  });
  it("off when Echo Finders was refused location", () => {
    expect(locationAccessOf(true, no, no)).toBe("off");
  });
  it("nothing to say while it has never been asked: iOS will ask", () => {
    expect(locationAccessOf(true, never, never)).toBeNull();
  });
  it("while using, when Always was not given", () => {
    expect(locationAccessOf(true, yes, no)).toBe("while-using");
  });
  it("always", () => {
    expect(locationAccessOf(true, yes, yes)).toBe("always");
  });
  it("the location line is the approved one", () => {
    expect(NO_LOCATION_LINE).toBe("Turn on location for Echo Finders in iPhone Settings to hear echoes as you go.");
  });
});

describe("a drive starting (D6, mock 1, approved 2026-11-13)", () => {
  const yes = { granted: true, canAskAgain: true };
  const no = { granted: false, canAskAgain: true };
  const never = { granted: false, canAskAgain: false };

  it("asks for Always only with While Using given, Always not, and iOS still able to ask, once a launch", () => {
    expect(askOnDrive(yes, no, FRESH_LADDER)).toBe(true);
    expect(askOnDrive(yes, yes, FRESH_LADDER)).toBe(false);
    expect(askOnDrive(no, no, FRESH_LADDER)).toBe(false);
    expect(askOnDrive(yes, never, FRESH_LADDER)).toBe(false);
    expect(askOnDrive(yes, no, { declined: true, fallbackShown: false })).toBe(false);
  });

  it("says the approved words, verbatim", () => {
    expect(DRIVE_SHEET).toEqual({
      caps: "HANDS FREE",
      title: "Drive with the screen off",
      body: "Echoes start on their own as you reach them, with the screen off or another app open. To do that, Echo Finders needs to know where you are while the app is closed. It is used only to find echoes near you. Your exact location stays on your phone.",
      primary: "Turn on hands free",
      secondary: "Not now",
      note: "Without it, keep Echo Finders on screen in a phone mount and echoes still play.",
    });
    for (const line of Object.values(DRIVE_SHEET)) expect(line).not.toMatch(/[–—]| - /);
  });

  it("listens as a car does on a drive: automotive, never paused, every 20 m; a walk as before", () => {
    expect(updatesFor("drive")).toBe(DRIVING_UPDATES);
    expect(DRIVING_UPDATES).toMatchObject({ activity: "automotiveNavigation", pausesUpdatesAutomatically: false, distanceIntervalM: 20 });
    expect(updatesFor("walk")).toBe(WALKING_UPDATES);
    expect(updatesFor("flight")).toBe(WALKING_UPDATES);
  });
});
