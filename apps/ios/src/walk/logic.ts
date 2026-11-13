/**
 * A walk with the phone in your pocket: the pure half of `task.ts` and `WalkProvider.tsx`.
 *
 * Nothing here touches expo-location; it decides, and the native half does. Kept apart so
 * the root suite can test it (`test/ios/walk.test.ts`): this file imports nothing but the
 * engine.
 *
 * WHAT FIRES AN ECHO. The engine decides, exactly as on the web. The web's walk
 * (`WalkSession.onFix`, `packages/core/src/session/walk.ts`) feeds every fix to the
 * engine's `CaptureTracker` and offers each capture to the queue when
 * `willPlayOnArrival` says it plays; then it tells the queue where you are, so a waiting
 * echo you have walked away from gives up. `WalkJudge` does the same three calls in the
 * same order, on foot, with the web's listener. So the tracker's rules hold unchanged:
 * inside the echo's trigger radius plus a bounded allowance for GPS slack, a fix not too
 * vague for the radius, settled for three seconds, moving no faster than 8 kph (a stop,
 * not a stride), plausible movement, eligible for the listener (age, categories, true
 * crime opt in), and never an echo already found. Rarity is what the engine reports about
 * a capture; it does not gate one. Heading plays no part in arrival on the web either.
 *
 * One difference, and it is the point of the feature: a hands free walk plays what you
 * reach. On the web auto play is off by default because starting audio unasked is right
 * only when someone has asked for it. Starting a hands free walk is that asking ("Echoes
 * start on their own as you reach them"), so the judge asks `willPlayOnArrival` with
 * auto play on. It still refuses an echo with no recording.
 *
 * THE PERMISSION LADDER (`docs/ios-permissions.md`). When In Use on first use (the Map
 * tab asks, `location.ts`). Always only the first time someone starts a hands free walk,
 * after our own explanation (`HANDS_FREE_SHEET`). Refused, or "Not now": the walk goes on
 * with the app on screen, the fallback line shows once, and nothing asks again until the
 * app is next launched. The engine's `capabilitiesToRequest("first-hands-free", granted)`
 * says whether Always is still worth asking for.
 */
import {
  CaptureTracker,
  ECHO_CATEGORIES,
  OPT_IN_CATEGORIES,
  PRIVACY_DEFAULTS,
  capabilitiesToRequest,
  redactRecord,
  willPlayOnArrival,
  type Capability,
  type CaptureRecord,
  type Echo,
  type LatLng,
  type ListenerProfile,
  type Position,
} from "@echofinders/core";

// --- The listener ---------------------------------------------------------------------------

/**
 * The listener the web app's walk uses (`LISTENER` in `apps/prototype/src/use-journey.ts`):
 * every category except true crime, which is opt in everywhere, an adult, immersive. The
 * phone has no kids mode or opt ins yet, so it is the web's default listener exactly.
 */
export const WALK_LISTENER: ListenerProfile = {
  categories: ECHO_CATEGORIES.filter((c) => !OPT_IN_CATEGORIES.includes(c)),
  age: 35,
  density: "immersive",
};

// --- Fixes ------------------------------------------------------------------------------------

/** A fix as expo-location reports it (`LocationObject`), the fields the walk reads. */
export interface Fix {
  readonly coords: {
    readonly latitude: number;
    readonly longitude: number;
    readonly accuracy: number | null;
    /** Metres per second. iOS reports a negative speed when it does not know. */
    readonly speed: number | null;
  };
  /** Epoch milliseconds. */
  readonly timestamp: number;
}

/** The engine's `Position` for a fix. An unknown accuracy or speed is left out, not zero. */
export function positionOf(fix: Fix): Position {
  const { latitude, longitude, accuracy, speed } = fix.coords;
  return {
    at: { lat: latitude, lng: longitude },
    timestamp: fix.timestamp,
    source: "device-gnss",
    ...(accuracy !== null && accuracy >= 0 ? { accuracyM: accuracy } : {}),
    ...(speed !== null && speed >= 0 ? { speedKph: speed * 3.6 } : {}),
  };
}

// --- What a fix decides -----------------------------------------------------------------------

/** What one fix asks of the narrator: echoes to offer, in order, then where you are now. */
export interface WalkStep {
  /** Echoes just reached that play on arrival. Hand each to the narrator's `offer`. */
  readonly offer: readonly Echo[];
  /** Where you are. Hand it to the narrator's `moved`, after the offers. */
  readonly at: LatLng;
  /** Records of every echo this fix opened, played or not, for keeping. */
  readonly found: readonly CaptureRecord[];
}

/**
 * The engine's arrival rules, fed one fix at a time, for a walk on foot.
 *
 * One judge for the life of the app, so an echo found on one walk is not found again on
 * the next, and restored from what earlier launches kept (`records`), so it is not found
 * again tomorrow either.
 *
 * Since 2026-11-13 the app shows the web app, which judges arrival itself; with the screen
 * locked the shell's `PocketJudge` (`shell/logic.ts`) does, from the page's own plan. This
 * class is kept, and tested, as the record of the native walk's rules.
 */
export class WalkJudge {
  private readonly tracker: CaptureTracker;
  private readonly library: readonly Echo[];
  private lastMs = Number.NEGATIVE_INFINITY;

  constructor(library: readonly Echo[], restored: readonly CaptureRecord[] = []) {
    this.library = library;
    this.tracker = CaptureTracker.restore(WALK_LISTENER, restored, { mode: "walking" });
  }

  /**
   * Feed what the phone delivered. In the background iOS can deliver several fixes at
   * once, and on the way back to the foreground one can arrive twice; they are taken
   * oldest first, and anything not newer than the last fix taken is ignored, because the
   * tracker measures speed and dwell from one fix to the next.
   */
  update(fixes: readonly Fix[]): WalkStep[] {
    const steps: WalkStep[] = [];
    for (const fix of [...fixes].sort((a, b) => a.timestamp - b.timestamp)) {
      if (!(fix.timestamp > this.lastMs)) continue;
      if (!Number.isFinite(fix.coords.latitude) || !Number.isFinite(fix.coords.longitude)) continue;
      this.lastMs = fix.timestamp;
      const position = positionOf(fix);
      const captures = this.tracker.update(position, this.library);
      steps.push({
        offer: captures.filter((c) => willPlayOnArrival({ autoPlay: true, echo: c.echo })).map((c) => c.echo),
        at: position.at,
        found: captures.map((c) => c.record),
      });
    }
    return steps;
  }

  /** Has this echo been found already, on this walk or an earlier one? */
  found(echoId: string): boolean {
    return this.tracker.stateOf(echoId) !== "sealed";
  }

  /**
   * What is kept between launches: which echoes were found and when, with the privacy
   * defaults applied, so where you stood is not written down (`recordPrecisePlaces` is off
   * by default, `docs/ios-permissions.md`).
   */
  get records(): CaptureRecord[] {
    return this.tracker.records
      .map((record) => redactRecord(record, PRIVACY_DEFAULTS))
      .filter((record): record is CaptureRecord => record !== null);
  }
}

/** Kept records as read back from disk. Anything that is not one is dropped. */
export function parseRecords(raw: unknown): CaptureRecord[] {
  const list = raw && typeof raw === "object" && "found" in raw ? (raw as { found: unknown }).found : null;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (r): r is CaptureRecord =>
      !!r && typeof r === "object" && typeof (r as CaptureRecord).echoId === "string" && typeof (r as CaptureRecord).capturedAt === "string",
  );
}

// --- How the phone listens --------------------------------------------------------------------

/**
 * Location updates for a walk, in plain words; `task.ts` turns them into expo-location's
 * `LocationTaskOptions`.
 *
 *   accuracy "high"     iOS's nearest ten metres. A walking echo's radius is around a
 *                       hundred and twenty metres and the tracker allows GPS slack of a
 *                       quarter of it, so ten metres is plenty; the best accuracy spends
 *                       more battery to say the same thing.
 *   every 10 m          A fix every seven seconds or so at walking pace, so the three
 *                       second settle inside a radius completes on the second fix in it.
 *                       Standing still sends nothing, which is the battery saving.
 *   fitness             Tells iOS this is someone on foot, which shapes how it filters and
 *                       when it pauses.
 *   pauses when still   iOS powers the GPS down when you have not moved for a while. It
 *                       does not start again by itself: the significant change monitor
 *                       expo-location runs beside it, or the app coming back on screen
 *                       (the walk re-arms then), wakes it.
 *   blue indicator      The status bar says the app is using location in the background,
 *                       for as long as the walk is on.
 *
 * Driving, not built yet, would want: activity "automotive navigation", accuracy
 * "balanced" (a hundred metres is nothing against a three kilometre driving radius),
 * updates every hundred metres or so (about four seconds at ninety kph, still several
 * fixes inside every radius), the engine's mode "driving" (no speed ceiling: passing
 * through is the arrival), and pausing when parked, which iOS does well for cars.
 */
export const WALKING_UPDATES = {
  accuracy: "high",
  distanceIntervalM: 10,
  activity: "fitness",
  pausesUpdatesAutomatically: true,
  showsBackgroundLocationIndicator: true,
} as const;

// --- The permission ladder --------------------------------------------------------------------

/** A location permission as expo-location reports it, the two fields that matter. */
export interface Grant {
  readonly granted: boolean;
  readonly canAskAgain: boolean;
}

/** What starting a walk should do next. */
export type WalkPlan =
  /** When In Use has not been asked yet: ask it (the first rung). */
  | { readonly kind: "ask-while-using" }
  /** When In Use was refused and iOS will not ask again: the walk cannot start. */
  | { readonly kind: "no-location" }
  /** Show our explanation, then ask for Always. */
  | { readonly kind: "explain" }
  /** Always is granted: walk hands free. */
  | { readonly kind: "hands-free" }
  /** Walk with the app on screen. */
  | { readonly kind: "on-screen" };

/** What this launch remembers of the ladder. A new launch starts afresh. */
export interface LadderSession {
  /** Always was asked for, or the explanation was turned down, during this launch. */
  readonly declined: boolean;
  /** The fallback line has been shown during this launch. */
  readonly fallbackShown: boolean;
}

export const FRESH_LADDER: LadderSession = { declined: false, fallbackShown: false };

/** The capabilities a pair of grants amounts to, in the engine's words. */
export function grantedCapabilities(whileUsing: Grant, always: Grant): Capability[] {
  const granted: Capability[] = [];
  if (whileUsing.granted) granted.push("location-foreground");
  if (whileUsing.granted && always.granted) granted.push("location-background");
  return granted;
}

/** Starting a walk: which rung of the ladder this is. */
export function planWalk(whileUsing: Grant, always: Grant, session: LadderSession): WalkPlan {
  if (!whileUsing.granted) return whileUsing.canAskAgain ? { kind: "ask-while-using" } : { kind: "no-location" };
  const toAsk = capabilitiesToRequest("first-hands-free", grantedCapabilities(whileUsing, always));
  if (!toAsk.some((need) => need.capability === "location-background")) return { kind: "hands-free" };
  if (always.canAskAgain && !session.declined) return { kind: "explain" };
  return { kind: "on-screen" };
}

/** The explanation was answered: "Turn on hands free" goes on to ask iOS, "Not now" does not. */
export function afterExplanation(session: LadderSession, choice: "turn-on" | "not-now"): { session: LadderSession; ask: boolean } {
  return { session: { ...session, declined: true }, ask: choice === "turn-on" };
}

/** iOS answered the Always request (or did not ask, after Allow Once, which reads as refused). */
export function afterAlwaysAnswer(always: Grant): WalkPlan {
  return always.granted ? { kind: "hands-free" } : { kind: "on-screen" };
}

/**
 * The fallback line, once a launch: shown the first time a walk goes on screen only, and
 * not again until the app is next launched.
 */
export function fallbackFor(plan: WalkPlan, session: LadderSession): { line: string | null; session: LadderSession } {
  if (plan.kind !== "on-screen" || session.fallbackShown) return { line: null, session };
  return { line: FALLBACK_LINE, session: { ...session, fallbackShown: true } };
}

// --- The words --------------------------------------------------------------------------------

/** The explanation before iOS asks for Always, as approved (James, 2026-11-12). */
export const HANDS_FREE_SHEET = {
  caps: "HANDS FREE",
  title: "Walk with your phone in your pocket",
  body:
    "Echoes start on their own as you reach them, with the screen off. To do that, Echo Finders needs to know where you are while the app is closed. It is used only to find echoes near you. Your exact location stays on your phone.",
  primary: "Turn on hands free",
  secondary: "Not now",
} as const;

/** `docs/ios-permissions.md`, step 3. */
export const FALLBACK_LINE = "Keep Echo Finders on screen while you walk and echoes will still open.";

/** What the walking bar says, by how the walk is running. */
export const WALKING_LINE = {
  "hands-free": "Hands free. Echoes start as you reach them, even with the screen off.",
  "on-screen": "Echoes start as you reach them while Echo Finders is on screen.",
} as const;

/** When In Use was refused for good: where to fix it. */
export const NO_LOCATION_LINE = "Turn on location for Echo Finders in iPhone Settings to walk with echoes.";
