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
import { PlateStrip } from "./PlateStrip";

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
  /** Open the camera on this echo. Absent where there is no camera to open. */
  readonly onCamera?: (echo: Echo) => void;
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
  onCamera,
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

      {!sealed && onCamera && <PlateStrip echo={echo} onOpen={onCamera} />}

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
        {/*
          Both of these were drawn from the design and wired to nothing: they stopped the
          click from reaching the card and did not a thing else. A control that answers a
          tap with silence is worse than one that is not there, because the second time
          somebody presses it they conclude the app is broken rather than the button.

          Maps hands the point to whatever the phone uses for directions — this is the one
          place the product should send you *away*, because walking to an echo is the
          entire game and we do not draw turn-by-turn. Share copies the place and the
          teaser where the native sheet is unavailable, which is every desktop browser.
        */}
        <button
          className="act"
          onClick={(e) => {
            e.stopPropagation();
            const { lat, lng } = echo.point.at;
            window.open(
              `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
              "_blank",
              "noopener,noreferrer",
            );
          }}
        >
          <svg viewBox="0 0 24 24">
            <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z" />
            <circle cx="12" cy="10" r="2.4" />
          </svg>
          Maps
        </button>
        <button
          className="act act-icon"
          aria-label="Share"
          onClick={(e) => {
            e.stopPropagation();
            void share(echo);
          }}
        >
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

/**
 * Share, with the two fallbacks a browser needs.
 *
 * `navigator.share` is the right thing on a phone and does not exist on most desktops;
 * the clipboard is the right thing there and is refused without a secure context. Past
 * both, do nothing quietly rather than throwing — a share that fails is not worth an
 * error, and a rejected native sheet is usually somebody changing their mind.
 */
async function share(echo: Echo): Promise<void> {
  const text = `${echo.title} — ${echo.point.place}. ${echo.teaser ?? echo.summary}`;
  if (typeof navigator === "undefined") return;
  try {
    if (typeof navigator.share === "function") {
      await navigator.share({ title: echo.title, text });
      return;
    }
    await navigator.clipboard?.writeText(text);
  } catch {
    /* cancelled, or no clipboard. Neither is worth interrupting a walk for. */
  }
}

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;

/** Coarse on purpose — a live metre count invites staring at the screen. */
const distance = (metres: number) =>
  metres < 950 ? `${Math.round(metres / 10) * 10}m` : `${(metres / 1000).toFixed(1)}km`;
