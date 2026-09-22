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
  type TonesSink,
  type PlaybackState,
  type QueuedEcho,
  type Deferred,
  type ListenerProfile,
  type NearbyEcho,
  type Position,
  type Route,
} from "@echofinders/core";
import { SimulatedJourney } from "./simulated-journey";
import { EchoTone } from "./echo-tone";
import { SpeechAudio } from "./speech-audio";

export interface WalkState {
  readonly position: Position | null;
  readonly nearby: readonly NearbyEcho[];
  readonly opening: readonly Arriving[];
  readonly guidance: Guidance | null;
  readonly captured: readonly CaptureEvent[];
  readonly lastCapture: CaptureEvent | null;
  /** What the phone would be doing, so the UI can show the haptic it cannot feel. */
  readonly cue: HapticCue | null;
  readonly playback: PlaybackState;
  readonly waiting: readonly QueuedEcho[];
  /** Captured but never heard — the one place the collection and the listening diverge. */
  readonly deferred: readonly Deferred[];
}

/**
 * Everything except true crime, which is opt-in everywhere by design (OPT_IN_CATEGORIES)
 * and has to be chosen rather than defaulted into.
 */
export const LISTENER: ListenerProfile = {
  categories: ["history", "food-drink", "people", "built", "land", "arts", "legend", "kids"],
  age: 35,
  density: "immersive",
};

export interface JourneyControls {
  /** Play the proximity cue. */
  readonly sound: boolean;
  /** Whether narration is audible at all. Not the same as whether it starts by itself. */
  readonly narrate: boolean;
  /**
   * Start a captured echo without being asked.
   *
   * Off by default, and that is the product rule rather than a preference: finding an echo
   * and hearing it are separate acts. Capture-by-arrival (ADR-0010) collects the thing as
   * you walk up to it, which is the game; narration is a decision, because starting it
   * unasked talks over a conversation, a podcast, or somebody standing in a memorial.
   *
   * It exists at all because the hands-free case is real — phone pocketed, screen off,
   * walking — and `PrivacySettings.handsFree` is where a listener asks for it. That setting
   * defaults to false and needs background location, which is exactly the kind of thing
   * that deserves a deliberate choice.
   */
  readonly handsFree: boolean;
  /** The listener pressed pause on the simulation itself. */
  readonly paused: boolean;
}

export function useJourney(
  route: Route,
  library: readonly Echo[],
  { sound, narrate, handsFree, paused }: JourneyControls,
) {
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
    playback: { kind: "idle" },
    waiting: [],
    deferred: [],
  });

  const cueRef = useRef<HapticCue | null>(null);

  // One renderer for the life of the component: creating an AudioContext per session would
  // hit the browser's limit within a few mode switches.
  const toneRenderer = useMemo(() => new EchoTone(), []);
  useEffect(() => {
    toneRenderer.setMuted(!sound);
  }, [toneRenderer, sound]);

  const speech = useMemo(() => new SpeechAudio(library), [library]);
  useEffect(() => {
    speech.setMuted(!narrate);
  }, [speech, narrate]);

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

    const tones: TonesSink = {
      play: (cue) => toneRenderer.play(cue),
      stop: () => toneRenderer.stop(),
    };

    // The mode comes from the route, not from a constant. It is what selects the corridor
    // width, the timing tolerance, the duty cycle and the position source — the whole
    // difference between a walking tour and a flight — and hardcoding it here was the one
    // thing stopping this prototype from exercising the other four.
    return new WalkSession(
      library,
      LISTENER,
      { location: walk, haptics, tones, audio: speech },
      { mode: route.mode, autoPlay: handsFree },
    );
  }, [library, walk, route.mode, toneRenderer, speech, handsFree]);

  // Hold the walk while something is being narrated.
  //
  // A demo-only device, and one the real product does not need: out on a street you walk
  // and listen at the same time, in real time. Here the map runs at fourteen times life so
  // fifty minutes fits in three, and narration cannot be compressed with it — a listener
  // would capture twelve echoes in the time it takes to narrate one, and the queue would
  // spend the whole walk giving up on things. Holding the map while an echo talks keeps
  // both halves honest: you hear the whole story, then the walk carries on.
  // The manual pause and the narration hold are OR-ed in one place, because two callers
  // setting the same flag independently means whichever ran last wins — and the walk would
  // resume itself the moment an echo finished, whatever the listener had asked for.
  useEffect(() => {
    walk.setPaused(paused || state.playback.kind === "playing");
  }, [walk, paused, state.playback.kind]);

  useEffect(() => {
    // A new session is a new journey: different route, different collection, and nothing
    // in the listener's ears. The engine already clears itself on stop — this is the view
    // catching up, and without it switching mode leaves the last journey's echo showing as
    // "playing" over a map it is nowhere near.
    setState({
      position: null,
      nearby: [],
      opening: [],
      guidance: null,
      captured: [],
      lastCapture: null,
      cue: null,
      playback: { kind: "idle" },
      waiting: [],
      deferred: [],
    });

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
          case "playback":
            return { ...previous, playback: event.state, waiting: event.waiting };
          case "deferred":
            return { ...previous, deferred: [...previous.deferred, event.deferred] };
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
