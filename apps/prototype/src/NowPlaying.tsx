/**
 * What is in the listener's ears, and what is behind it.
 *
 * The queue is visible on purpose. A listener standing at Bowling Green captures two
 * echoes within seconds and hears one of them — without a line saying the other is next,
 * the second pin going solid in silence looks like a bug. The same goes for one that was
 * given up on: "captured, not heard" is a real state, and an interface that hid it would
 * leave somebody wondering why a story they collected never arrived.
 */

import type { Deferred, Echo, PlaybackState, QueuedEcho } from "@echofinders/core";
import { CATEGORY_LABEL } from "./categories";

export interface NowPlayingProps {
  readonly state: PlaybackState;
  readonly waiting: readonly QueuedEcho[];
  readonly deferred: readonly Deferred[];
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onSkip: () => void;
  /** How far through, 0–1. The one thing a now-playing row exists to say and had not been. */
  readonly progress: number;
  readonly saved: boolean;
  readonly onSave: (echo: Echo) => void;
}

export function NowPlaying({
  state,
  waiting,
  deferred,
  onPause,
  onResume,
  onSkip,
  progress,
  saved,
  onSave,
}: NowPlayingProps) {
  if (state.kind === "idle") return null;
  const { echo } = state.item;
  const playing = state.kind === "playing";

  return (
    <div className="playing">
      <div className="playing-top">
        <button
          className="playing-orb"
          onClick={playing ? onPause : onResume}
          aria-label={playing ? "Pause" : "Resume"}
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

        <div className="playing-text">
          <span className={`playing-kicker cat-${echo.category}`}>
            <span className="playing-dot" />
            {CATEGORY_LABEL[echo.category]}
          </span>
          <strong>{echo.title}</strong>
          <span className="playing-place">
            {echo.point.place} · {clock(echo.durationS * progress)} / {clock(echo.durationS)}
          </span>
        </div>

        {/*
          Keep, then skip, in that order. Saving is the one of the two that cannot be
          undone by walking on — an echo you skip is still in the collection, and an echo
          you meant to keep and did not is gone with the route.
        */}
        <button
          className={saved ? "playing-mark on" : "playing-mark"}
          onClick={() => onSave(echo)}
          aria-pressed={saved}
          aria-label={saved ? "Saved" : "Save this echo"}
        >
          <svg viewBox="0 0 24 24">
            <path d="M18 21l-6-3.6L6 21V5.4A1.4 1.4 0 0 1 7.4 4h9.2A1.4 1.4 0 0 1 18 5.4z" />
          </svg>
        </button>

        <button className="playing-mark" onClick={onSkip} aria-label="Skip to the next">
          <svg viewBox="0 0 24 24">
            <path d="M6 5l10 7-10 7zM18 5v14" />
          </svg>
        </button>
      </div>

      {/*
        How far through. A row that named a nine-minute story and then said nothing about
        where in it you were is the one question a listener actually has while walking —
        whether to wait for the end of this before crossing the road.
      */}
      <div className="playing-track">
        <span style={{ width: `${(Math.max(0, Math.min(1, progress)) * 100).toFixed(1)}%` }} />
      </div>

      {waiting.length > 0 && (
        <p className="playing-next">Next: {waiting.map((w) => w.echo.title).join(" · ")}</p>
      )}

      {deferred.length > 0 && (
        <p className="playing-missed">
          {deferred.length} collected but not heard — in your collection
        </p>
      )}
    </div>
  );
}

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
