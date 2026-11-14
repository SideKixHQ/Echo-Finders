/**
 * The walk, for the screens: whether one is on and how, starting it up the permission
 * ladder, and stopping it.
 *
 *   Start      When In Use first if it was never asked (`location.ts` normally has by
 *              now). Then, the first time in a launch that Always is still worth asking
 *              for, our own explanation (`HandsFreeSheet`), and only after "Turn on hands
 *              free" iOS's prompt. Granted: hands free. Refused, "Not now", or iOS will
 *              not ask again: the walk goes on with the app on screen, the fallback line
 *              shows once, and nothing asks again until the next launch.
 *   On screen  The same engine rules, fed while the app is in front, with the screen
 *              held awake for the walk (the engine's `screenAwake`), since a screen that
 *              locks would stop it.
 *   Stop       Ends background updates (`stopLocationUpdatesAsync`) or the on screen
 *              watch. An echo already playing finishes.
 *
 * The app shows the web app (ADR-0012, amended 2026-11-13): the walk starts and stops
 * from the page's Settings › Hands-free (`shell/WebShell.tsx`), and the page decides what
 * a fix means. `resume` starts a hands free walk only if Always is already granted, never
 * asking: it is what runs when the page loads with Hands-free already on.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import * as Location from "expo-location";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { screenAwake } from "@echofinders/core";
import {
  DRIVE_SHEET,
  FRESH_LADDER,
  askOnDrive,
  NO_LOCATION_LINE,
  afterAlwaysAnswer,
  afterExplanation,
  fallbackFor,
  planWalk,
  type LadderSession,
  type WalkPlan,
} from "./logic";
import { isHandsFreeOn, startHandsFree, startOnScreen, stopWalk } from "./task";
import { HandsFreeSheet } from "./sheet";

export type WalkMode = "off" | "hands-free" | "on-screen";

interface Walk {
  readonly mode: WalkMode;
  /** A line to show once with the walk: the fallback, or why it could not start. */
  readonly note: string | null;
  readonly start: () => void;
  /** Start hands free if Always is already granted. Asks nothing. */
  readonly resume: () => void;
  readonly stop: () => void;
  readonly dismissNote: () => void;
  /**
   * A drive, walk or flight began from the page's journey screen (`trip:start`): a hands
   * free walk takes that travel's location settings, and a drive asks for Always (D6).
   */
  readonly tripStarted: (kind: "drive" | "walk" | "flight") => void;
}

const WalkContext = createContext<Walk | null>(null);

/** The ladder this launch has climbed. Module scope, so it lasts as long as the launch. */
let ladder: LadderSession = FRESH_LADDER;

const KEEP_AWAKE_TAG = "echo-finders-walk";

export function WalkProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<WalkMode>("off");
  const [note, setNote] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  // The drive's sheet (D6), and how you travel now: hands free takes its settings from it.
  const [askingDrive, setAskingDrive] = useState(false);
  const travel = useRef<"drive" | "walk" | "flight">("walk");
  const [active, setActive] = useState(AppState.currentState === "active");
  const busy = useRef(false);

  // A hands free walk outlives the app's screens, and a relaunch: pick it up.
  useEffect(() => {
    let live = true;
    void isHandsFreeOn().then((on) => {
      if (live && on) setMode("hands-free");
    });
    return () => {
      live = false;
    };
  }, []);

  /** Go ahead with a plan the ladder settled on. */
  const go = useCallback(async (plan: WalkPlan) => {
    if (plan.kind === "hands-free") {
      try {
        await startHandsFree(travel.current);
        setMode("hands-free");
        return;
      } catch {
        // Background updates would not start (location services off, say): on screen instead.
        plan = { kind: "on-screen" };
      }
    }
    if (plan.kind === "on-screen") {
      const fallback = fallbackFor(plan, ladder);
      ladder = fallback.session;
      if (fallback.line) setNote(fallback.line);
      try {
        await startOnScreen();
        setMode("on-screen");
      } catch {
        setMode("off");
      }
      return;
    }
    if (plan.kind === "no-location") setNote(NO_LOCATION_LINE);
  }, []);

  const start = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    void (async () => {
      let whileUsing = await Location.getForegroundPermissionsAsync();
      const always = await Location.getBackgroundPermissionsAsync();
      let plan = planWalk(whileUsing, always, ladder);
      if (plan.kind === "ask-while-using") {
        whileUsing = await Location.requestForegroundPermissionsAsync();
        plan = planWalk(whileUsing, always, ladder);
        if (plan.kind === "ask-while-using") plan = { kind: "no-location" };
      }
      if (plan.kind === "explain") setExplaining(true);
      else await go(plan);
    })()
      .catch(() => setMode("off"))
      .finally(() => {
        busy.current = false;
      });
  }, [go]);

  const resume = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    void (async () => {
      const plan = planWalk(await Location.getForegroundPermissionsAsync(), await Location.getBackgroundPermissionsAsync(), ladder);
      if (plan.kind === "hands-free") await go(plan);
    })()
      .catch(() => undefined)
      .finally(() => {
        busy.current = false;
      });
  }, [go]);

  const answer = useCallback(
    (choice: "turn-on" | "not-now") => {
      setExplaining(false);
      const next = afterExplanation(ladder, choice);
      ladder = next.session;
      void (async () => {
        if (!next.ask) return go({ kind: "on-screen" });
        // After Allow Once, iOS does not ask and answers refused; that is on screen too.
        const always = await Location.requestBackgroundPermissionsAsync().catch(() => null);
        return go(always ? afterAlwaysAnswer(always) : { kind: "on-screen" });
      })();
    },
    [go],
  );

  const stop = useCallback(() => {
    setMode("off");
    setNote(null);
    void stopWalk().catch(() => undefined);
  }, []);

  // Back on screen during a hands free walk: re-arm, which wakes updates iOS paused
  // while you stood still, and notice if the walk was ended from elsewhere.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      setActive(state === "active");
      if (state !== "active" || mode !== "hands-free") return;
      void isHandsFreeOn().then((on) => {
        if (on) return startHandsFree(travel.current).catch(() => undefined);
        setMode("off");
      });
    });
    return () => subscription.remove();
  }, [mode]);

  // On screen, the screen stays on for the walk; hands free, it may lock, which is the point.
  const hold = screenAwake({ walking: mode === "on-screen", playing: false, visible: active, allowed: true }).hold;
  useEffect(() => {
    if (!hold) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    return () => {
      void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
    };
  }, [hold]);

  const dismissNote = useCallback(() => setNote(null), []);

  const tripStarted = useCallback(
    (kind: "drive" | "walk" | "flight") => {
      travel.current = kind;
      void (async () => {
        // Hands free already on: the drive's settings, or back to the walk's.
        if (await isHandsFreeOn()) await startHandsFree(kind).catch(() => undefined);
        if (kind !== "drive" || busy.current) return;
        const whileUsing = await Location.getForegroundPermissionsAsync();
        const always = await Location.getBackgroundPermissionsAsync();
        if (askOnDrive(whileUsing, always, ladder)) setAskingDrive(true);
      })().catch(() => undefined);
    },
    [],
  );

  /** The drive's sheet answered: "Turn on hands free" goes on to iOS's prompt; "Not now" does not. */
  const answerDrive = useCallback(
    (choice: "turn-on" | "not-now") => {
      setAskingDrive(false);
      const next = afterExplanation(ladder, choice);
      ladder = next.session;
      if (!next.ask) return;
      void (async () => {
        const always = await Location.requestBackgroundPermissionsAsync().catch(() => null);
        // Granted, with hands free on in Settings: on with the drive's settings now.
        if (always?.granted && mode !== "off") await go({ kind: "hands-free" });
      })();
    },
    [go, mode],
  );

  const value = useMemo(
    () => ({ mode, note, start, resume, stop, dismissNote, tripStarted }),
    [mode, note, start, resume, stop, dismissNote, tripStarted],
  );
  return (
    <WalkContext.Provider value={value}>
      {children}
      <HandsFreeSheet visible={explaining} onTurnOn={() => answer("turn-on")} onNotNow={() => answer("not-now")} />
      <HandsFreeSheet
        visible={askingDrive && !explaining}
        words={DRIVE_SHEET}
        onTurnOn={() => answerDrive("turn-on")}
        onNotNow={() => answerDrive("not-now")}
      />
    </WalkContext.Provider>
  );
}

export function useWalk(): Walk {
  const walk = useContext(WalkContext);
  if (!walk) throw new Error("useWalk outside WalkProvider");
  return walk;
}
