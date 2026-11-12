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
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { Asset } from "expo-asset";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, type AudioPlayer, type AudioStatus } from "expo-audio";
import type { Deferred, Echo, LatLng } from "@echofinders/core";
import { renderedAudio } from "./library";
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
}

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
  const lastReport = useRef<PlayerReport | null>(null);
  const artwork = useRef<string | null>(null);

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
    (echo: Echo, fromTheTop: boolean) => {
      const audio = renderedAudio(echo);
      if (!audio) return;
      if (fromTheTop) {
        // A saved copy first (Settings › Offline echoes), so it plays with no signal.
        player.replace({ uri: localUriFor(audio.audioKey) ?? audio.url });
        setCurrent(echo);
      }
      dispatch({ type: "play" });
      setFullVolume(player);
      player.setActiveForLockScreen(true, nowPlayingFor(echo, artwork.current), LOCK_SCREEN_OPTIONS);
      player.play();
    },
    [dispatch, player],
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
    setCurrent(null);
  }, [dispatch, player, queue, syncWaiting]);

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
      if (now.didJustFinish && !before?.didJustFinish) {
        const following = queue.finished();
        syncWaiting();
        if (following) start(following.echo, true);
        else dispatch({ type: "pause" });
        return;
      }
      if (!before) return;
      const change = playerChange(before, now);
      if (change === "halted") dispatch({ type: "halted", volume: player.volume, app: appPhase.current });
      else if (change === "started") dispatch({ type: "started" });
    });
    return () => subscription.remove();
  }, [dispatch, player, queue, start, syncWaiting]);

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
    }),
    [player, status, current, waiting, play, offer, moved, next, toggle, skip, stop, soundOn, setSoundOn],
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
