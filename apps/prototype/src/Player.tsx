/**
 * The transport: where you are in an echo, and everything you can do about it.
 *
 * Built to the design's layout — waveform, elapsed and total, then a row of pills for
 * skipping and speed, then the plain-language switch and the narrator. The ordering is
 * deliberate and theirs: the things you touch while walking sit above the things you set
 * once.
 *
 * The waveform is drawn from the echo's own script rather than from the audio, because
 * there is no audio yet. Bar heights come from the length of each sentence, so the shape is
 * at least *about* this echo rather than decorative noise, and it will be replaced by real
 * amplitude data the moment a render exists. What it gets right today is the only thing a
 * listener reads off it: how far in they are, and how much is left.
 */

import { useMemo } from "react";
import type { Echo } from "@echofinders/core";
import type { Rating } from "./ratings";
import { VOICE_LABEL } from "./voices";
import { CATEGORY_LABEL } from "./categories";

export interface PlayerProps {
  readonly echo: Echo;
  readonly onPlayPause: () => void;
  readonly saved: boolean;
  readonly onSave: () => void;
  /** 0–1 through the echo. */
  readonly progress: number;
  readonly playing: boolean;
  readonly simple: boolean;
  readonly onSimple: (on: boolean) => void;
  readonly rate: number;
  readonly onRate: (rate: number) => void;
  readonly onSeek: (fraction: number) => void;
  readonly onLine: (delta: -1 | 1) => void;
  readonly onNext: () => void;
  /** Private, two-answer, never shown back as a score. See `ratings.ts`. */
  readonly rating: Rating | undefined;
  readonly onRating: (rating: Rating) => void;
}

const BARS = 44;

export function Player({
  echo,
  onPlayPause,
  saved,
  onSave,
  progress,
  playing,
  simple,
  onSimple,
  rate,
  onRate,
  onSeek,
  onLine,
  onNext,
  rating,
  onRating,
}: PlayerProps) {
  const durationS = simple ? (echo.simple?.durationS ?? echo.durationS) : echo.durationS;
  // Deterministic, and only the script decides it — so there is no reason to split the
  // prose and lay out forty-four bars again every time the playhead moves.
  const heights = useMemo(
    () => barHeights(simple ? (echo.simple?.script ?? echo.script ?? "") : (echo.script ?? "")),
    [echo, simple],
  );
  const played = Math.round(progress * BARS);

  return (
    <div className="player">
      {/* The header stays with the transport rather than above the tabs, so switching to
          the transcript does not lose track of what is actually playing. */}
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
        <div className="playing-text">
          <span className={`playing-kicker cat-${echo.category}`}>
            <span className="playing-dot" />
            {CATEGORY_LABEL[echo.category]}
          </span>
          <strong>{simple ? (echo.simple?.title ?? echo.title) : echo.title}</strong>
          <span className="playing-place">
            {echo.point.place} · {clock(durationS)}
            {simple && <> plain-language cut</>}
          </span>
        </div>
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

      <div
        className="wave"
        role="slider"
        aria-label="Seek"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
        onClick={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          onSeek((e.clientX - box.left) / box.width);
        }}
        /*
          A focusable `role="slider"` that only answers to a mouse is worse than a plain
          button: a screen reader announces something operable and then nothing operates it.
          Five percent a step, ends on Home and End, same as any native range.
        */
        onKeyDown={(e) => {
          const step =
            e.key === "ArrowRight" || e.key === "ArrowUp"
              ? 0.05
              : e.key === "ArrowLeft" || e.key === "ArrowDown"
                ? -0.05
                : null;
          if (step !== null) {
            e.preventDefault();
            onSeek(Math.max(0, Math.min(1, progress + step)));
          } else if (e.key === "Home") {
            e.preventDefault();
            onSeek(0);
          } else if (e.key === "End") {
            e.preventDefault();
            onSeek(1);
          }
        }}
      >
        {heights.map((h, i) => (
          <span
            key={i}
            className={i < played ? "wave-bar wave-on" : "wave-bar"}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>

      <div className="player-time">
        <span>{clock(progress * durationS)}</span>
        <span>{clock(durationS)}</span>
      </div>

      <div className="player-row">
        <button className="pill" onClick={() => onSeek(Math.max(0, progress - 15 / durationS))}>
          <svg viewBox="0 0 24 24">
            <path d="M3 4v6h6M3.5 10a9 9 0 1 1 .5 5" />
          </svg>
          15s
        </button>
        <button className="pill" onClick={() => onLine(-1)}>
          <svg viewBox="0 0 24 24">
            <path d="M17 5v14l-9-7zM6 5v14" />
          </svg>
          Line
        </button>
        <button className="pill" onClick={() => onLine(1)}>
          Line
          <svg viewBox="0 0 24 24">
            <path d="M7 5v14l9-7zM18 5v14" />
          </svg>
        </button>
        <span className="pill pill-rate">
          <button onClick={() => onRate(Math.max(0.7, Math.round((rate - 0.1) * 10) / 10))}>−</button>
          <b>{rate.toFixed(1)}×</b>
          <button onClick={() => onRate(Math.min(2, Math.round((rate + 0.1) * 10) / 10))}>+</button>
        </span>
      </div>

      <div className="player-row player-row-centre">
        <button className="pill" onClick={onNext}>
          Next echo
          <svg viewBox="0 0 24 24">
            <path d="M4 12h15M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      {/*
        The plain-language cut. Not a children's version and not a summary — plainer and
        shorter, which serves tired listeners, second-language listeners and anybody who
        just wants the short one. Disabled rather than hidden where none is written, so the
        absence is a gap in the library rather than a feature nobody knows exists.
      */}
      <button
        className={simple ? "simpaud simpaud-on" : "simpaud"}
        disabled={!echo.simple}
        onClick={() => onSimple(!simple)}
      >
        <svg viewBox="0 0 24 24">
          <path d="M4 14v-3a8 8 0 0 1 16 0v3M4 14a2 2 0 0 0 2 2h1v-5H6a2 2 0 0 0-2 2zM20 14a2 2 0 0 1-2 2h-1v-5h1a2 2 0 0 1 2 2z" />
        </svg>
        <span>
          <strong>{!echo.simple ? "No plain-language cut yet" : simple ? "Simple audio on" : "Simple audio"}</strong>
          <small>{!echo.simple ? "This echo has only the full telling" : simple ? "Tap for the full telling" : "Plain words, shorter"}</small>
        </span>
        {echo.simple && <i>{clock(echo.simple.durationS)}</i>}
      </button>

      {/*
        Asked where the answer is cheap and informed: under the transport, on something the
        listener is in the middle of. Not on a card they have not opened, and not as a modal
        at the end, which is a toll on the moment the story lands.
      */}
      <div className="rate-row">
        <span>Worth stopping for?</span>
        <button
          className={rating === "up" ? "rate-btn on" : "rate-btn"}
          onClick={() => onRating("up")}
          aria-pressed={rating === "up"}
          aria-label="Yes, worth stopping for"
        >
          <svg viewBox="0 0 24 24">
            <path d="M7 22V10l5-8a2.2 2.2 0 0 1 2 2.6L13 9h5.4a2.2 2.2 0 0 1 2.1 2.8l-2 8A2.2 2.2 0 0 1 16.4 22z" />
          </svg>
        </button>
        <button
          className={rating === "down" ? "rate-btn on down" : "rate-btn"}
          onClick={() => onRating("down")}
          aria-pressed={rating === "down"}
          aria-label="No, not worth stopping for"
        >
          <svg viewBox="0 0 24 24">
            <path d="M17 2v12l-5 8a2.2 2.2 0 0 1-2-2.6L11 15H5.6a2.2 2.2 0 0 1-2.1-2.8l2-8A2.2 2.2 0 0 1 7.6 2z" />
          </svg>
        </button>
      </div>

      <div className="narrator">
        <svg viewBox="0 0 24 24">
          <path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
        {VOICE_LABEL[echo.voice ?? ""] ?? "Default narrator"}
      </div>

      <span className="sr-only">{playing ? "Playing" : "Paused"}</span>
    </div>
  );
}

const clock = (seconds: number) =>
  `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, "0")}`;

/**
 * Bar heights from the shape of the script.
 *
 * Sentence lengths, normalised — a stand-in for amplitude that at least varies with this
 * echo rather than being the same wave under every story. Deterministic, so a given echo
 * always looks like itself.
 */
function barHeights(script: string): readonly number[] {
  const sentences = script.split(/(?<=[.!?])\s+/).filter((x) => x.trim().length > 0);
  if (sentences.length === 0) return Array.from({ length: BARS }, () => 40);

  return Array.from({ length: BARS }, (_, i) => {
    const sentence = sentences[Math.floor((i / BARS) * sentences.length)] ?? "";
    // Two overlapping cycles so neighbouring bars differ, which is what makes it read as a
    // waveform rather than a bar chart.
    const wobble = Math.sin(i * 1.7) * 14 + Math.sin(i * 0.6) * 9;
    return Math.max(18, Math.min(100, 34 + Math.min(52, sentence.length / 2.6) + wobble));
  });
}
