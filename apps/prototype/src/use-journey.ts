/**
 * React binding for `WalkSession`, whatever the travel mode.
 *
 * Deliberately thin. Every decision — what is near, what is opening, how hard to buzz,
 * what just captured — is made in the engine and arrives as an event; this only keeps the
 * latest of each in state so React can draw it.
 *
 * The iOS build's equivalent hook is the same shape, which is the point of the seam.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  WalkSession,
  type Arriving,
  type CaptureEvent,
  type Echo,
  type Guidance,
  type HapticCue,
  type HapticsSink,
  type ListenerProfile,
  type NearbyEcho,
  type Position,
  type Route,
} from "@echofinders/core";
import { SimulatedJourney } from "./simulated-journey";

export interface WalkState {
  readonly position: Position | null;
  readonly nearby: readonly NearbyEcho[];
  readonly opening: readonly Arriving[];
  readonly guidance: Guidance | null;
  readonly captured: readonly CaptureEvent[];
  readonly lastCapture: CaptureEvent | null;
  /** What the phone would be doing, so the UI can show the haptic it cannot feel. */
  readonly cue: HapticCue | null;
}

/**
 * Everything except true crime, which is opt-in everywhere by design (OPT_IN_CATEGORIES)
 * and has to be chosen rather than defaulted into.
 */
const LISTENER: ListenerProfile = {
  categories: ["history", "food-drink", "people", "built", "land", "arts", "legend", "kids"],
  age: 35,
  density: "immersive",
};

export function useJourney(route: Route, library: readonly Echo[]) {
  const walk = useMemo(() => {
    // `?speed=2` slows the journey so the dwell ring can be watched filling; `?start=0.4`
    // drops in partway along.
    const params = new URLSearchParams(window.location.search);
    const timeScale = Number(params.get("speed"));
    const start = Number(params.get("start"));
    const simulation = new SimulatedJourney(route, {
      ...(Number.isFinite(timeScale) && timeScale > 0 ? { timeScale } : {}),
    });
    if (Number.isFinite(start) && start > 0) simulation.seekTo(start);
    return simulation;
  }, [route]);

  const [state, setState] = useState<WalkState>({
    position: null,
    nearby: [],
    opening: [],
    guidance: null,
    captured: [],
    lastCapture: null,
    cue: null,
  });

  const cueRef = useRef<HapticCue | null>(null);

  const session = useMemo(() => {
    // Stands in for Core Haptics on iOS. Here it only records what would have happened,
    // which is exactly what the visual proximity bar needs to show.
    const haptics: HapticsSink = {
      play: (cue) => {
        cueRef.current = cue;
      },
      stop: () => {
        cueRef.current = null;
      },
    };

    // The mode comes from the route, not from a constant. It is what selects the corridor
    // width, the timing tolerance, the duty cycle and the position source — the whole
    // difference between a walking tour and a flight — and hardcoding it here was the one
    // thing stopping this prototype from exercising the other four.
    return new WalkSession(library, LISTENER, { location: walk, haptics }, { mode: route.mode });
  }, [library, walk, route.mode]);

  useEffect(() => {
    const off = session.subscribe((event) => {
      setState((previous) => {
        switch (event.type) {
          case "position":
            return { ...previous, position: event.position, cue: cueRef.current };
          case "nearby":
            return { ...previous, nearby: event.echoes };
          case "opening":
            return { ...previous, opening: event.arriving };
          case "guidance":
            return { ...previous, guidance: event.guidance, cue: cueRef.current };
          case "captured":
            return {
              ...previous,
              captured: [...previous.captured, event.capture],
              lastCapture: event.capture,
            };
          default:
            return previous;
        }
      });
    });

    session.start();
    return () => {
      off();
      session.stop();
    };
  }, [session]);

  return { state, session, walk };
}
