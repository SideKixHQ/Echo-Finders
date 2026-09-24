/**
 * An echo, as a card.
 *
 * Rebuilt from the design prototype rather than from function outward, which is what the
 * flat rows this replaces were. The anatomy is theirs: a category tag with a coloured dot
 * and the duration opposite, the title, the teaser doing real work underneath it, the place
 * and distance on a pin, and a row of actions.
 *
 * **Collapsed by default, and that is the correction.** The argument for a full card was
 * that actions are what make a list usable: a row of text is something to read, a card with
 * Listen, Save, Maps and Share is something to use. True, and it ignored the container. At
 * about 180px a card, a sheet showing 300px of list shows *one* echo, so browsing what is
 * around you meant dragging a small window past one story at a time, with no sense of how
 * many there were or what came next. A list you cannot scan is not a list.
 *
 * So the row carries the three things a decision needs at a glance — what kind, how long,
 * what it is called — with the two actions worth having permanently: play on the left,
 * where the plate already is, and save on the right. Five rows fit where one did.
 *
 * Everything else lives one tap down. Opening a row expands it in place with the teaser,
 * the place, the camera strip and the rest of the actions, and only one is open at a time.
 * That keeps "see more details" inside the list instead of behind a navigation, which is
 * what the sheet is for.
 */

import type { Echo } from "@echofinders/core";
import { CATEGORY_ICON, CATEGORY_LABEL } from "./categories";
import { PlateStrip } from "./PlateStrip";
import { shareText } from "./share";

export interface EchoCardProps {
  readonly echo: Echo;
  /** Whether this row is showing its detail. One at a time, owned by the list. */
  readonly open: boolean;
  readonly onOpen: (echoId: string) => void;
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
  open,
  onOpen,
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
      }${open ? " ecard-open" : ""}`}
      aria-label={sealed ? "Sealed echo" : echo.title}
    >
      <div className={`erow cat-${echo.category}`}>
        {/*
          Play, on the plate, in the category's own colour. A sealed echo has nothing to
          play yet, so it shows its category instead and says so in words below.
        */}
        <button
          className="erow-plate"
          disabled={sealed}
          onClick={(e) => {
            e.stopPropagation();
            onPlay(echo);
          }}
          aria-label={sealed ? "Walk to this to sync it" : `Play ${echo.title}`}
        >
          <svg viewBox="0 0 24 24" className={sealed ? "" : "act-fill"}>
            {sealed ? CATEGORY_ICON[echo.category] : <path d="M8 5v14l11-7z" />}
          </svg>
          <i>{clock(echo.durationS)}</i>
        </button>

        {/* The row itself opens the detail, and selects the pin on the map with it. */}
        <button
          className="erow-body"
          onClick={() => {
            onSelect(echo.id);
            onOpen(echo.id);
          }}
          aria-expanded={open}
        >
          <span className={`ecard-tag cat-${echo.category}`}>
            <span className="ecard-dot" />
            {CATEGORY_LABEL[echo.category]}
          </span>
          <strong>{sealed ? (echo.teaser ?? "Something happened here") : echo.title}</strong>
          <small>
            {echo.point.place}
            {distanceM !== null && <> · {distance(distanceM)}</>}
          </small>
        </button>

        <button
          className={saved ? "erow-save on" : "erow-save"}
          onClick={(e) => {
            e.stopPropagation();
            onSave(echo);
          }}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${echo.title} from saved` : `Save ${echo.title}`}
        >
          <svg viewBox="0 0 24 24">
            <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="ecard-detail">
          {!sealed && <p>{echo.summary}</p>}
          {sealed && <p>Walk to the spot. Stand still a moment and it syncs.</p>}

          {!sealed && onCamera && <PlateStrip echo={echo} onOpen={onCamera} />}

          <div className="ecard-acts">
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
            void shareText(echo.title, `${echo.title} — ${echo.point.place}. ${echo.teaser ?? echo.summary}`);
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
        </div>
      )}
    </article>
  );
}

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;

/** Coarse on purpose — a live metre count invites staring at the screen. */
const distance = (metres: number) =>
  metres < 950 ? `${Math.round(metres / 10) * 10}m` : `${(metres / 1000).toFixed(1)}km`;
