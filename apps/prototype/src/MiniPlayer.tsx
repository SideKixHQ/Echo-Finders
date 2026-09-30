/**
 * What is playing, as one line at the bottom of the sheet.
 *
 * THIS USED TO BE A WHOLE SECOND PLAYER, and that was the complaint: "it looks like we
 * have two different audio players now". It was true and it was worse than it looked —
 * the two shared no design language at all. Different waveform (a bar chart here, flowing
 * light there), different speed control (a minus-plus stepper here, a cycling pill
 * there), different transport glyphs, different colours. Two answers to every question,
 * and whichever one you learned first was the wrong one half the time.
 *
 * So there is one player now, `Ribbon`, full screen, and this is its mini bar. That is the
 * relationship every audio app on the phone already teaches: a line that says what is
 * playing with one control on it, and tapping it opens the real thing.
 *
 * It is also what the sheet was already trying to be. The stylesheet hid `.wave`,
 * `.player-row`, `.narrator` and the rest at the peek detent, so at rest this component
 * ALREADY rendered as exactly this one line — and then grew a second full transport if you
 * happened to drag the sheet up. Deleting that growth is most of this change, and the
 * three controls that only lived down there — stop, the narrator, the rating — moved to
 * the full screen player rather than being lost.
 *
 * The orb stays a play/pause, because the one thing worth doing without opening anything
 * is shutting the voice up.
 */

import type { Echo } from "@echofinders/core";
import { CATEGORY_LABEL } from "./categories";

export interface MiniPlayerProps {
  readonly echo: Echo;
  readonly onPlayPause: () => void;
  readonly playing: boolean;
  readonly saved: boolean;
  readonly onSave: () => void;
  /** 0 to 1 through the echo. Drawn as a hairline under the row. */
  readonly progress: number;
  /** The plain-language cut, which changes the title and the running time. */
  readonly simple: boolean;
  /** Open the full player. The whole middle of the row does this. */
  readonly onOpen: () => void;
}

export function MiniPlayer({
  echo,
  onPlayPause,
  playing,
  saved,
  onSave,
  progress,
  simple,
  onOpen,
}: MiniPlayerProps) {
  const durationS = simple ? (echo.simple?.durationS ?? echo.durationS) : echo.durationS;

  return (
    <div className="player">
      <div className="phead">
        <button
          className={playing ? "playing-orb is-playing" : "playing-orb"}
          onClick={onPlayPause}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <svg viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" rx="1.2" />
              <rect x="14" y="4" width="4" height="16" rx="1.2" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/*
          The middle of the row is the way in, and it is a button rather than a tap
          handler on a div so it is reachable by keyboard and announced as what it is.
        */}
        <button className="playing-text" onClick={onOpen} aria-label={`Open the player: ${echo.title}`}>
          <span className={`playing-kicker cat-${echo.category}`}>
            <span className="playing-dot" />
            {CATEGORY_LABEL[echo.category]}
          </span>
          <strong>{simple ? (echo.simple?.title ?? echo.title) : echo.title}</strong>
          <span className="playing-place">
            {echo.point.place} · {clock(durationS)}
            {simple && <> plain-language cut</>}
          </span>
        </button>

        <button
          className={saved ? "phead-mark on" : "phead-mark"}
          onClick={onSave}
          aria-label={saved ? "Remove from saved" : "Save"}
        >
          <svg viewBox="0 0 24 24">
            <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      </div>

      {/*
        How far through, as a hairline rather than a scrubber.

        A mini bar that can be dragged is a mini bar people drag by accident while
        reaching for the sheet. Seeking belongs on the screen with the ribbon on it; this
        only has to answer "how far in am I".
      */}
      <div className="phead-progress" aria-hidden="true">
        <span style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }} />
      </div>
    </div>
  );
}

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
