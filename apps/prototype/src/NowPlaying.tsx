/**
 * What is in the listener's ears, and what is behind it.
 *
 * The queue is visible on purpose. A listener standing at Bowling Green captures two
 * echoes within seconds and hears one of them — without a line saying the other is next,
 * the second pin going solid in silence looks like a bug. The same goes for one that was
 * given up on: "captured, not heard" is a real state, and an interface that hid it would
 * leave somebody wondering why a story they collected never arrived.
 */

import type { Deferred, PlaybackState, QueuedEcho } from "@echofinders/core";

export interface NowPlayingProps {
  readonly state: PlaybackState;
  readonly waiting: readonly QueuedEcho[];
  readonly deferred: readonly Deferred[];
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onSkip: () => void;
}

export function NowPlaying({
  state,
  waiting,
  deferred,
  onPause,
  onResume,
  onSkip,
}: NowPlayingProps) {
  if (state.kind === "idle") return null;
  const { echo } = state.item;
  const playing = state.kind === "playing";

  return (
    <div className="playing">
      <div className="playing-top">
        <button
          className="playing-button"
          onClick={playing ? onPause : onResume}
          aria-label={playing ? "Pause" : "Resume"}
        >
          {playing ? (
            <svg viewBox="0 0 16 16">
              <rect x="3" y="2" width="3.6" height="12" rx="1" />
              <rect x="9.4" y="2" width="3.6" height="12" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16">
              <path d="M4 2.5v11l9-5.5z" />
            </svg>
          )}
        </button>

        <div className="playing-text">
          <span className="playing-label">{playing ? "Playing" : "Paused"}</span>
          <strong>{echo.title}</strong>
          <span className="playing-place">{echo.point.place}</span>
        </div>

        <button className="playing-skip" onClick={onSkip} aria-label="Skip">
          Skip
        </button>
      </div>

      {waiting.length > 0 && (
        <p className="playing-next">
          Next: {waiting.map((w) => w.echo.title).join(" · ")}
        </p>
      )}

      {deferred.length > 0 && (
        <p className="playing-missed">
          {deferred.length} collected but not heard — in your collection
        </p>
      )}
    </div>
  );
}
