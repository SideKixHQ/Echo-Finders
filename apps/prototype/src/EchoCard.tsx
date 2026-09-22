/**
 * An echo, as a card.
 *
 * Rebuilt from the design prototype rather than from function outward, which is what the
 * flat rows this replaces were. The anatomy is theirs: a category tag with a coloured dot
 * and the duration opposite, the title, the teaser doing real work underneath it, the place
 * and distance on a pin, and a row of actions.
 *
 * The actions are the part a list cannot have and the reason this is worth the space. A row
 * of text is something to read; a card with Listen, Save, Maps and Share on it is something
 * to *use*, and the difference is whether anybody does anything.
 */

import type { Echo } from "@echofinders/core";
import { CATEGORY_LABEL } from "./categories";

export interface EchoCardProps {
  readonly echo: Echo;
  /** Metres from the listener, or null when it is not on this route. */
  readonly distanceM: number | null;
  /** Sealed echoes show their teaser instead of their title, and cannot be played. */
  readonly sealed: boolean;
  readonly playing: boolean;
  readonly selected: boolean;
  readonly saved: boolean;
  readonly onPlay: (echo: Echo) => void;
  readonly onSave: (echo: Echo) => void;
  readonly onSelect: (echoId: string) => void;
}

export function EchoCard({
  echo,
  distanceM,
  sealed,
  playing,
  selected,
  saved,
  onPlay,
  onSave,
  onSelect,
}: EchoCardProps) {
  return (
    <article
      className={`ecard${playing ? " ecard-playing" : ""}${sealed ? " ecard-sealed" : ""}${
        selected ? " ecard-selected" : ""
      }`}
      onClick={() => onSelect(echo.id)}
    >
      <div className="ecard-top">
        <span className={`ecard-tag cat-${echo.category}`}>
          <span className="ecard-dot" />
          {CATEGORY_LABEL[echo.category]}
        </span>
        <span className="ecard-dur">{clock(echo.durationS)}</span>
      </div>

      {/* Sealed keeps its promise: you can see something is there and roughly what kind of
          thing, and finding out means going. Spoiling the title removes the reason to walk. */}
      <h4>{sealed ? (echo.teaser ?? "Something happened here") : echo.title}</h4>
      {!sealed && <p>{echo.summary}</p>}

      <div className="ecard-place">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z" />
          <circle cx="12" cy="10" r="2.4" />
        </svg>
        {echo.point.place}
        {distanceM !== null && <> · {distance(distanceM)}</>}
      </div>

      <div className="ecard-acts">
        <button
          className="act act-pri"
          disabled={sealed}
          onClick={(e) => {
            e.stopPropagation();
            onPlay(echo);
          }}
        >
          <svg viewBox="0 0 24 24" className="act-fill">
            <path d="M8 5v14l11-7z" />
          </svg>
          {sealed ? "Walk to open" : playing ? "Playing" : "Listen"}
        </button>
        <button
          className={saved ? "act act-on" : "act"}
          onClick={(e) => {
            e.stopPropagation();
            onSave(echo);
          }}
        >
          <svg viewBox="0 0 24 24">
            <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
          {saved ? "Saved" : "Save"}
        </button>
        <button className="act" onClick={(e) => e.stopPropagation()}>
          <svg viewBox="0 0 24 24">
            <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z" />
            <circle cx="12" cy="10" r="2.4" />
          </svg>
          Maps
        </button>
        <button className="act act-icon" aria-label="Share" onClick={(e) => e.stopPropagation()}>
          <svg viewBox="0 0 24 24">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
          </svg>
        </button>
      </div>
    </article>
  );
}

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;

/** Coarse on purpose — a live metre count invites staring at the screen. */
const distance = (metres: number) =>
  metres < 950 ? `${Math.round(metres / 10) * 10}m` : `${(metres / 1000).toFixed(1)}km`;
