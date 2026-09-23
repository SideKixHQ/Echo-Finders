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
  rarityOf,
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
  type CaptureRecord,
  type PrivacySettings,
} from "@echofinders/core";
import { SimulatedJourney } from "./simulated-journey";
import { EchoTone } from "./echo-tone";
import { SpeechAudio } from "./speech-audio";
import { IndexedDbCollection } from "./collection-store";

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

/** The age kids mode claims. Under every `minAge` the library sets above zero. */
export const KIDS_AGE = 8;

/**
 * The listener, as the engine sees them.
 *
 * Kids mode is an *age*, not a filter, and that difference is the whole point. A filter is
 * a view over a library that still contains everything — turn it off, or open a deep link,
 * or restore a session, and the library is all there. An age goes through
 * `checkEligibility`, which is a hard gate the scheduler, the capture tracker, the nearby
 * list and the package builder all run: an echo above it cannot be ranked, cannot be
 * captured, cannot be packaged and cannot be played, because every one of those asks the
 * same question first.
 *
 * So switching it on does not hide the Dakota. It makes the Dakota ineligible, everywhere,
 * by the same mechanism that has always kept true crime away from a seven-year-old.
 */
export const listenerFor = (kids: boolean): ListenerProfile =>
  kids ? { ...LISTENER, age: KIDS_AGE } : LISTENER;

export interface JourneyControls {
  /** Play the proximity cue. */
  readonly sound: boolean;
  /** Whether narration is audible at all. Not the same as whether it starts by itself. */
  readonly narrate: boolean;
  /**
   * Start captured echoes without being asked, one after another.
   *
   * Off by default, and that is the product rule rather than a preference: finding an echo
   * and hearing it are separate acts. Capture-by-arrival (ADR-0010) collects the thing as
   * you walk up to it, which is the game; narration is a decision, because starting it
   * unasked talks over a conversation, a podcast, or somebody standing in a memorial.
   */
  readonly autoPlay: boolean;
  /** Echoes picked in advance. Undefined means no restriction; empty means none. */
  readonly chosen?: ReadonlySet<string>;
  /** The listener pressed pause on the simulation itself. */
  readonly paused: boolean;
  /** Playback speed, as a multiplier. Takes effect on the next echo — see `SpeechAudio`. */
  readonly rate?: number;
  /** What the listener has agreed to have remembered. Decides what reaches storage. */
  readonly privacy: PrivacySettings;
  /** Kids mode: an age the engine gates on, not a filter over the view. */
  readonly kids: boolean;
}

export function useJourney(
  route: Route,
  library: readonly Echo[],
  { sound, narrate, autoPlay, chosen, paused, rate = 1, privacy, kids }: JourneyControls,
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

  // The collection survives a refresh, so it has to be read before the session exists.
  //
  // `null` means still reading. The session is built either way rather than blocking the
  // whole app on a disk read — it rebuilds once records arrive, which is free, because a
  // read completes in milliseconds and nothing can have been captured yet.
  const store = useMemo(() => new IndexedDbCollection(`route:${route.id}`), [route.id]);
  const [restored, setRestored] = useState<readonly CaptureRecord[] | null>(null);
  useEffect(() => {
    let live = true;
    setRestored(null);
    void store.load().then((records) => {
      if (live) setRestored(records);
    });
    return () => {
      live = false;
    };
  }, [store]);

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
  // Released on unmount, because an AudioContext is not garbage: browsers cap them per
  // page, and one left open per mount is a limit reached by clicking around.
  useEffect(() => () => void toneRenderer.dispose(), [toneRenderer]);

  const speech = useMemo(() => new SpeechAudio(library), [library]);
  useEffect(() => {
    speech.setMuted(!narrate);
  }, [speech, narrate]);
  useEffect(() => {
    speech.setRate(rate);
  }, [speech, rate]);

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
      listenerFor(kids),
      { location: walk, haptics, tones, audio: speech, collection: store },
      {
        mode: route.mode,
        // Restored before the first fix, so echoes found on a previous visit stay found
        // rather than opening a second time.
        ...(restored && restored.length > 0 ? { captured: restored } : {}),
      },
    );
    // `autoPlay` and `chosen` are deliberately *not* dependencies and not constructor
    // arguments. They change while somebody is walking — every tick in the plan, every
    // flick of the switch — and a new `WalkSession` is a new `CaptureTracker`: rebuilding
    // it to carry one boolean threw away the whole collection, stopped whatever was
    // playing, and reset the map, silently. They are applied below instead.
  }, [library, walk, route.mode, toneRenderer, speech, store, restored, kids]);

  useEffect(() => {
    session.setAutoPlay(autoPlay);
  }, [session, autoPlay]);

  useEffect(() => {
    session.setAutoPlayOnly(chosen ? [...chosen] : undefined);
  }, [session, chosen]);

  // Applied live, and it rewrites what is already on disk. Turning "remember where I was
  // standing" off has to erase the positions already stored, not merely stop adding to
  // them — otherwise the setting is a promise about the future and a lie about the past.
  useEffect(() => {
    session.setPrivacy(privacy);
  }, [session, privacy]);

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
    //
    // Except for what was restored. `captured` is built from capture *events*, and a
    // restored record never fires one — the echo was found on a previous visit, not on this
    // one. So a collection that persisted perfectly still showed as empty until this seeded
    // it: the engine knew, and only the screen did not.
    setState({
      position: null,
      nearby: [],
      opening: [],
      guidance: null,
      captured: (restored ?? []).flatMap((record) => {
        const echo = library.find((e) => e.id === record.echoId);
        // An echo that has left the library — renamed, unpublished, or filtered out of this
        // build — leaves its record on disk and out of the view. Dropping it silently is
        // right: we cannot show a story we no longer have.
        return echo ? [{ echo, record, rarity: rarityOf(echo) }] : [];
      }),
      // Deliberately null. `lastCapture` drives the "Found" card, which is about a moment
      // that just happened; something found last week has not just happened.
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
  }, [session, restored, library]);

  return { state, session, walk, store, restoring: restored === null };
}
