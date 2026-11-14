/**
 * The narrator: one audio player for the whole app.
 *
 * One, held above the navigator, so an echo keeps playing when you leave its card, lock
 * the screen or switch tabs, and so there is only ever one voice. The card asks it to play
 * an echo; the mini player and the lock screen read and steer the same instance.
 *
 * How it sits with the rest of the phone is decided in `playback.ts`, the pure half:
 *
 *   Other audio      the session ducks: music lowers under an echo and comes back, Maps
 *                    still speaks. Podcasts lower too rather than pausing, because
 *                    expo-audio cannot ask iOS to interrupt spoken audio (`playback.ts`).
 *   Screen locked    the `audio` background mode (app.json, through the expo-audio plugin)
 *                    and a session that plays in the background and through the silent
 *                    switch. A mixable session may start from the background, so a queued
 *                    echo begins with the phone in a pocket.
 *   Lock screen      title, place and the app's icon, with play, pause and skip 15 seconds
 *                    either way (`setActiveForLockScreen`).
 *   A call or Siri   pauses the echo; it plays on after if iOS says it may.
 *   Headphones out   pause (expo-audio does it), and stay paused.
 *   Sound off        mutes, and is remembered (`prefs.ts`).
 *
 * Walks hand echoes in with `offer`: one plays, two wait, and a waiting one is dropped when
 * you have walked on from it (the engine's `PlaybackQueue`, as the web app's walk uses it).
 *
 * THE WEB APP (ADR-0012, amended 2026-11-13). The app shows the web app, and the web app
 * decides what plays: it asks with `playRequest` (the render's key, its address and what
 * the lock screen shows), and hears back through `subscribe` when a file ends, will not
 * play, or the lock screen's Play or Pause was pressed. While the page cannot run (the
 * screen locked) `handOver` takes its plan, so what it queued still plays in order, and
 * `takeBack` returns the queue to it.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { Asset } from "expo-asset";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, type AudioPlayer, type AudioStatus } from "expo-audio";
import type { Deferred, Echo, LatLng, QueuedEcho } from "@echofinders/core";
import type { PlayRequest } from "../../prototype/src/native-bridge-protocol";
import { currentById, renderedAudio } from "./library";
import { echoOfRequest } from "./shell/logic";
import { localUriFor } from "./packs/store";
import {
  IDLE,
  LOCK_SCREEN_OPTIONS,
  audioModeFor,
  hasFinished,
  nextIntent,
  nowPlayingFor,
  playerChange,
  queued,
  walkQueue,
  type AppPhase,
  type Intent,
  type IntentEvent,
  type PlayerReport,
} from "./playback";
import { readSoundOn, writeSoundOn } from "./prefs";

interface Narrator {
  readonly player: AudioPlayer;
  readonly status: AudioStatus;
  /** The echo loaded now, playing or paused. */
  readonly current: Echo | null;
  /** Echoes waiting their turn behind it. */
  readonly waiting: readonly Echo[];
  /** Play an echo now, from the start, or carry on if it is the one loaded. Jumps the queue. */
  readonly play: (echo: Echo) => void;
  /**
   * A walk arrived at an echo: play it if nothing is playing, else queue it. Never cuts off
   * the echo playing. Returns what had to be given up to make room, if anything.
   */
  readonly offer: (echo: Echo) => Deferred | null;
  /** The listener moved: drop waiting echoes they have walked too far from. */
  readonly moved: (at: LatLng) => readonly Deferred[];
  /** Give up on this echo and start the next one waiting. */
  readonly next: () => void;
  readonly toggle: () => void;
  readonly skip: (seconds: number) => void;
  readonly stop: () => void;
  /**
   * The map's Sound control: everything the app says, on or off. It mutes rather than
   * pauses, so an echo carries on in silence and is where you left it in time. On the web
   * the same control mutes the sonar; the phone has no sonar yet, so it covers narration,
   * and will cover the sonar too when it comes. Remembered across launches.
   */
  readonly soundOn: boolean;
  readonly setSoundOn: (on: boolean) => void;
  /** The web app's Pause and Play: nothing happens if it is already so. */
  readonly pause: () => void;
  readonly resume: () => void;
  /** The web app asks: play this render now, from `startAtS`. */
  readonly playRequest: (request: PlayRequest) => void;
  /** Queue this render behind the one playing, as a walk does (the pocket). */
  readonly offerRequest: (request: PlayRequest) => Deferred | null;
  /** Move to this fraction of the file loaded. */
  readonly seekFraction: (fraction: number) => void;
  /** The web app's speed setting. */
  readonly setRate: (rate: number) => void;
  /** The key of the file loaded, or null. */
  readonly loadedKey: () => string | null;
  /** What the player did by itself, for the web app. Returns how to stop listening. */
  readonly subscribe: (listener: (event: NarratorEvent) => void) => () => void;
  /** The page's plan while it cannot run: what is playing, and what waits behind it. */
  readonly handOver: (current: PlayRequest | null, waiting: readonly PlayRequest[]) => void;
  /** The page runs again: it queues for itself, so nothing waits here. */
  readonly takeBack: () => void;
}

/** What the player tells the web app. */
export type NarratorEvent =
  | { readonly type: "started"; readonly key: string }
  | { readonly type: "ended"; readonly key: string }
  | { readonly type: "failed"; readonly key: string }
  | { readonly type: "progress"; readonly key: string; readonly positionS: number; readonly durationS: number }
  | { readonly type: "remote"; readonly action: "play" | "pause" };

/** How long after the app moves the player itself a change is still its own. */
const SELF_MOVED_MS = 1500;


const NarratorContext = createContext<Narrator | null>(null);

/** The player is a native object the app owns; muting it is a command, not React state. */
function setMuted(player: AudioPlayer, muted: boolean) {
  player.muted = muted;
}

/** expo-audio lowers a player's volume for an interruption; a fresh echo starts at full. */
function setFullVolume(player: AudioPlayer) {
  player.volume = 1;
}

function phaseOf(state: AppStateStatus | string | null | undefined): AppPhase {
  return state === "active" || state === "inactive" ? state : "background";
}

/** The app's icon as a file address, for the lock screen's artwork. */
function useArtworkUrl(): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    Asset.fromModule(require("../assets/icon.png"))
      .downloadAsync()
      .then((asset) => {
        if (!cancelled) setUrl(asset.localUri ?? asset.uri);
      })
      .catch(() => {
        /* The lock screen shows the echo without a picture. */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return url;
}

export function NarratorProvider({ children }: { children: ReactNode }) {
  const player = useAudioPlayer(null, { updateInterval: 500 });
  const status = useAudioPlayerStatus(player);
  const artworkUrl = useArtworkUrl();
  const [current, setCurrent] = useState<Echo | null>(null);
  const [waiting, setWaiting] = useState<readonly Echo[]>([]);
  const [soundOn, setSoundOnState] = useState(readSoundOn);

  const [queue] = useState(walkQueue);
  const intent = useRef<Intent>(IDLE);
  const appPhase = useRef<AppPhase>(phaseOf(AppState.currentState));
  const lastReport = useRef<(PlayerReport & { readonly playbackState?: string }) | null>(null);
  const artwork = useRef<string | null>(null);
  // The web app's renders: which file each queued echo plays, and the one loaded now.
  const sources = useRef(new Map<string, { key: string; uri: string; durationS: number }>());
  const loaded = useRef<{ key: string; durationS: number } | null>(null);
  const rate = useRef(1);
  // When the app itself last moved the player, so its own start or pause is not reported
  // back to the page as the lock screen's.
  const selfMoved = useRef(0);
  const listeners = useRef(new Set<(event: NarratorEvent) => void>());
  const tell = useCallback((event: NarratorEvent) => {
    for (const listener of listeners.current) listener(event);
  }, []);

  /** Feed the intent an event; start the player again if it says to. */
  const dispatch = useCallback(
    (event: IntentEvent) => {
      const result = nextIntent(intent.current, event);
      intent.current = result.intent;
      if (result.resume) {
        setFullVolume(player);
        player.play();
      }
    },
    [player],
  );

  const syncWaiting = useCallback(() => setWaiting(queue.waiting.map((q) => q.echo)), [queue]);

  useEffect(() => setMuted(player, !soundOn), [player, soundOn, current]);

  // The session follows the Sound control: duck others while the echo can be heard, mix
  // with them while it is silent, so nobody's music dips under an echo they cannot hear.
  useEffect(() => {
    setAudioModeAsync(audioModeFor(soundOn)).catch(() => {
      /* Without it the echo still plays, in the foreground. */
    });
  }, [soundOn]);

  const setSoundOn = useCallback((on: boolean) => {
    setSoundOnState(on);
    writeSoundOn(on);
  }, []);

  /** Load an echo into the player and start it, with the lock screen showing it. */
  const start = useCallback(
    (echo: Echo, fromTheTop: boolean, startAtS = 0) => {
      const source = sources.current.get(echo.id);
      const audio = source ? null : renderedAudio(echo);
      const key = source?.key ?? audio?.audioKey;
      if (!key) return;
      if (fromTheTop) {
        // A saved copy first (Settings › Offline echoes), so it plays with no signal.
        player.replace({ uri: localUriFor(key) ?? source?.uri ?? audio!.url });
        player.setPlaybackRate(rate.current);
        loaded.current = { key, durationS: source?.durationS ?? echo.durationS };
        if (startAtS > 0) void player.seekTo(startAtS);
        setCurrent(echo);
        tell({ type: "started", key });
      }
      selfMoved.current = Date.now();
      dispatch({ type: "play" });
      setFullVolume(player);
      player.setActiveForLockScreen(true, nowPlayingFor(echo, artwork.current), LOCK_SCREEN_OPTIONS);
      player.play();
    },
    [dispatch, player, tell],
  );

  const play = useCallback(
    (echo: Echo) => {
      const item = queued(echo, Date.now());
      if (!item) return;
      const same = current?.id === echo.id;
      queue.playNow(item);
      syncWaiting();
      if (same && hasFinished(status)) void player.seekTo(0);
      start(echo, !same);
    },
    [current, player, queue, start, status, syncWaiting],
  );

  const offer = useCallback(
    (echo: Echo): Deferred | null => {
      const item = queued(echo, Date.now());
      if (!item) return null;
      const { started, deferred } = queue.offer(item);
      syncWaiting();
      if (started) start(echo, true);
      return deferred;
    },
    [queue, start, syncWaiting],
  );

  const moved = useCallback(
    (at: LatLng) => {
      const gone = queue.moved(at);
      if (gone.length > 0) syncWaiting();
      return gone;
    },
    [queue, syncWaiting],
  );

  const stop = useCallback(() => {
    dispatch({ type: "stop" });
    player.pause();
    player.clearLockScreenControls();
    queue.clear();
    syncWaiting();
    loaded.current = null;
    sources.current.clear();
    setCurrent(null);
  }, [dispatch, player, queue, syncWaiting]);

  /** A render the web app asked for, as the queue holds it. */
  const itemOf = useCallback((request: PlayRequest): QueuedEcho => {
    const echo = echoOfRequest(request, currentById());
    sources.current.set(echo.id, { key: request.key, uri: request.url, durationS: request.durationS });
    const render = echo.renders?.find((r) => r.audioKey === request.key) ?? { voiceId: "", audioKey: request.key, durationS: request.durationS };
    return { echo, render, atMs: Date.now() };
  }, []);

  const playRequest = useCallback(
    (request: PlayRequest) => {
      setSoundOnState(!request.muted);
      rate.current = request.rate;
      const item = itemOf(request);
      queue.playNow(item);
      syncWaiting();
      start(item.echo, true, request.startAtS);
    },
    [itemOf, queue, start, syncWaiting],
  );

  const offerRequest = useCallback(
    (request: PlayRequest): Deferred | null => {
      const item = itemOf(request);
      const { started, deferred } = queue.offer(item);
      syncWaiting();
      if (started) start(item.echo, true);
      return deferred;
    },
    [itemOf, queue, start, syncWaiting],
  );

  const seekFraction = useCallback(
    (fraction: number) => {
      const total = status.duration > 0 ? status.duration : (loaded.current?.durationS ?? 0);
      void player.seekTo(Math.max(0, Math.min(1, fraction)) * total);
    },
    [player, status.duration],
  );

  const setRate = useCallback(
    (next: number) => {
      rate.current = next;
      player.setPlaybackRate(next);
    },
    [player],
  );

  const pause = useCallback(() => {
    if (!player.playing) return;
    selfMoved.current = Date.now();
    dispatch({ type: "pause" });
    queue.pause();
    player.pause();
  }, [dispatch, player, queue]);

  const resume = useCallback(() => {
    if (!loaded.current || player.playing) return;
    selfMoved.current = Date.now();
    dispatch({ type: "play" });
    queue.resume();
    setFullVolume(player);
    player.play();
  }, [dispatch, player, queue]);

  const loadedKey = useCallback(() => loaded.current?.key ?? null, []);

  const subscribe = useCallback((listener: (event: NarratorEvent) => void) => {
    listeners.current.add(listener);
    return () => void listeners.current.delete(listener);
  }, []);

  const handOver = useCallback(
    (now: PlayRequest | null, waiting: readonly PlayRequest[]) => {
      const playing = queue.nowPlaying;
      // The page's queue, behind what is playing here now; nothing restarts.
      queue.clear();
      if (playing && now && loaded.current?.key === now.key) queue.offer(playing);
      for (const request of waiting) queue.offer(itemOf(request));
      syncWaiting();
    },
    [itemOf, queue, syncWaiting],
  );

  const takeBack = useCallback(() => {
    const playing = queue.nowPlaying;
    queue.clear();
    if (playing) queue.offer(playing);
    syncWaiting();
  }, [queue, syncWaiting]);

  const next = useCallback(() => {
    const item = queue.skip();
    syncWaiting();
    if (item) start(item.echo, true);
    else stop();
  }, [queue, start, stop, syncWaiting]);

  const toggle = useCallback(() => {
    if (!current) return;
    if (status.playing) {
      dispatch({ type: "pause" });
      queue.pause();
      player.pause();
    } else play(current);
  }, [current, dispatch, play, player, queue, status.playing]);

  const skip = useCallback(
    (seconds: number) => {
      const end = status.duration > 0 ? status.duration : Number.POSITIVE_INFINITY;
      void player.seekTo(Math.max(0, Math.min(end, status.currentTime + seconds)));
    },
    [player, status.currentTime, status.duration],
  );

  // Every status update, straight from the player rather than through a render, so it
  // runs with the screen locked (the app is still playing when an echo ends): an echo that
  // ran out hands over to the next one waiting, and a stop or start nobody asked for (a
  // call, headphones out, the lock screen) goes to the intent.
  useEffect(() => {
    const subscription = player.addListener("playbackStatusUpdate", (now) => {
      const before = lastReport.current;
      lastReport.current = now;
      if (now.playbackState === "failed" && before?.playbackState !== "failed" && loaded.current) {
        tell({ type: "failed", key: loaded.current.key });
        return;
      }
      if (now.didJustFinish && !before?.didJustFinish) {
        if (loaded.current) tell({ type: "ended", key: loaded.current.key });
        const following = queue.finished();
        syncWaiting();
        if (following) start(following.echo, true);
        else dispatch({ type: "pause" });
        return;
      }
      if (!before) return;
      const change = playerChange(before, now);
      const ours = Date.now() - selfMoved.current < SELF_MOVED_MS;
      if (change === "halted") {
        dispatch({ type: "halted", volume: player.volume, app: appPhase.current });
        // Paused by the listener (lock screen, headphones), not by a call: the page pauses too.
        if (!ours && intent.current.want === "paused") tell({ type: "remote", action: "pause" });
      } else if (change === "started") {
        dispatch({ type: "started" });
        if (!ours) tell({ type: "remote", action: "play" });
      }
      if (loaded.current && Math.floor(now.currentTime) !== Math.floor(before.currentTime)) {
        tell({ type: "progress", key: loaded.current.key, positionS: now.currentTime, durationS: now.duration });
      }
    });
    return () => subscription.remove();
  }, [dispatch, player, queue, start, syncWaiting, tell]);

  // After an interruption: look again whenever the app changes phase, and every second
  // while one is open, for the volume coming back (iOS said resume) or the app returning.
  useEffect(() => {
    const check = () => dispatch({ type: "check", volume: player.volume, app: appPhase.current });
    const subscription = AppState.addEventListener("change", (state) => {
      appPhase.current = phaseOf(state);
      check();
    });
    const timer = setInterval(() => {
      if (intent.current.interrupted) check();
    }, 1000);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [dispatch, player]);

  // The icon arrives a moment after launch; give it to an echo already on the lock screen.
  useEffect(() => {
    artwork.current = artworkUrl;
    if (current && artworkUrl) player.updateLockScreenMetadata(nowPlayingFor(current, artworkUrl));
  }, [artworkUrl, current, player]);

  const value = useMemo(
    () => ({
      player,
      status,
      current,
      waiting,
      play,
      offer,
      moved,
      next,
      toggle,
      skip,
      stop,
      soundOn,
      setSoundOn,
      pause,
      resume,
      playRequest,
      offerRequest,
      seekFraction,
      setRate,
      loadedKey,
      subscribe,
      handOver,
      takeBack,
    }),
    [player, status, current, waiting, play, offer, moved, next, toggle, skip, stop, soundOn, setSoundOn, pause, resume, playRequest, offerRequest, seekFraction, setRate, loadedKey, subscribe, handOver, takeBack],
  );
  return <NarratorContext.Provider value={value}>{children}</NarratorContext.Provider>;
}

export function useNarrator(): Narrator {
  const narrator = useContext(NarratorContext);
  if (!narrator) throw new Error("useNarrator outside NarratorProvider");
  return narrator;
}

/** "1:07". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
