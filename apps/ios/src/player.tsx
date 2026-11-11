/**
 * The narrator: one audio player for the whole app.
 *
 * One, held above the navigator, so an echo keeps playing when you leave its card, lock
 * the screen or switch tabs, and so there is only ever one voice. The card asks it to play
 * an echo; the mini player and the lock screen read and steer the same instance.
 *
 * With the screen locked: the `audio` background mode (app.json, through the expo-audio
 * plugin) plus an audio session that plays in the background and through the silent switch.
 * Lock screen controls come from `setActiveForLockScreen`, which needs `doNotMix` so iOS
 * ties the Now Playing controls to this player. Narration therefore pauses other audio,
 * which is right for something you are listening to rather than hearing in passing.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, type AudioPlayer, type AudioStatus } from "expo-audio";
import type { Echo } from "@echofinders/core";
import { CATEGORY_LABEL } from "./theme";
import { renderedAudio } from "./library";

interface Narrator {
  readonly player: AudioPlayer;
  readonly status: AudioStatus;
  /** The echo loaded now, playing or paused. */
  readonly current: Echo | null;
  /** Play an echo from the start, or carry on if it is the one loaded. */
  readonly play: (echo: Echo) => void;
  readonly toggle: () => void;
  readonly skip: (seconds: number) => void;
  readonly stop: () => void;
}

const NarratorContext = createContext<Narrator | null>(null);

export function NarratorProvider({ children }: { children: ReactNode }) {
  const player = useAudioPlayer(null, { updateInterval: 500 });
  const status = useAudioPlayerStatus(player);
  const [current, setCurrent] = useState<Echo | null>(null);

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
    }).catch(() => {
      /* Without it the echo still plays, in the foreground. */
    });
  }, []);

  const play = useCallback(
    (echo: Echo) => {
      const audio = renderedAudio(echo);
      if (!audio) return;
      if (current?.id !== echo.id) {
        player.replace({ uri: audio.url });
        setCurrent(echo);
      } else if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.5)) {
        void player.seekTo(0);
      }
      player.setActiveForLockScreen(
        true,
        { title: echo.title, artist: echo.point.place ?? "Echo Finders", albumTitle: CATEGORY_LABEL[echo.category] },
        { showSeekBackward: true, showSeekForward: true },
      );
      player.play();
    },
    [current, player, status.didJustFinish, status.duration, status.currentTime],
  );

  const toggle = useCallback(() => {
    if (!current) return;
    if (status.playing) player.pause();
    else play(current);
  }, [current, play, player, status.playing]);

  const skip = useCallback(
    (seconds: number) => {
      const end = status.duration > 0 ? status.duration : Number.POSITIVE_INFINITY;
      void player.seekTo(Math.max(0, Math.min(end, status.currentTime + seconds)));
    },
    [player, status.currentTime, status.duration],
  );

  const stop = useCallback(() => {
    player.pause();
    player.clearLockScreenControls();
    setCurrent(null);
  }, [player]);

  const value = useMemo(
    () => ({ player, status, current, play, toggle, skip, stop }),
    [player, status, current, play, toggle, skip, stop],
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
