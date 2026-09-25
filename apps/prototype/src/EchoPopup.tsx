/**
 * What you get when you tap a pin.
 *
 * This is the move the whole app was missing. The map has always been the main surface and
 * tapping a pin has always done something — it highlighted the matching row in a list under
 * the sheet, which is an answer to a question nobody asked. The question somebody standing
 * in a street asks is "what is that one, and can I hear it", and until now that took a pin
 * tap, a glance down, and a scroll.
 *
 * So: tap a pin, and the echo itself comes up over the map. Category, title, where it is,
 * how long, what it is about, and one line saying what you can do about it right now. Close
 * it and the map is back.
 *
 * The action line is the interesting part, because this product's rule is that you cannot
 * simply press play on something you are not standing at. A button that is there and refuses
 * is worse than no button, so there is only ever one control and it says what is true:
 *
 *   far off      how far, and which way. Nothing to press.
 *   within reach "hold still" — the sync is automatic and happens by standing there
 *   synced       Play, which is the only moment a play button appears at all
 *
 * That is the Assassin's Creed idea in one card: the memory is at the place, you go to the
 * place, and standing there is what unlocks it.
 */

import type { Echo, TravelMode } from "@echofinders/core";
import { CATEGORY_LABEL } from "./categories";
import type { PinState } from "./RouteMap";

export interface EchoPopupProps {
  readonly echo: Echo;
  /** Straight-line distance from the listener, km. Null when there is no fix yet. */
  readonly distanceKm: number | null;
  readonly state: PinState;
  /** How you are travelling, because it decides what getting there means. */
  readonly mode: TravelMode;
  readonly saved: boolean;
  /** Whether this is the one being walked to. */
  readonly aimed: boolean;
  /**
   * Walk to it. Absent where there is nothing to walk with: on a route that carries you, and
   * once the echo is yours and the walking is over.
   */
  readonly onAim?: (echo: Echo) => void;
  readonly onSave: (echo: Echo) => void;
  readonly onPlay: (echo: Echo) => void;
  readonly onClose: () => void;
}

/**
 * How close is close enough to sync.
 *
 * Matches the tracker's own arrival radius. It is here as a number rather than imported
 * because this is the *copy*, not the rule: the engine decides, and this only has to
 * describe the decision in a way that reads.
 */
const REACH_M = 50;

/** What being there means, per mode. */
const ARRIVED: Record<TravelMode, string> = {
  walking: "You are here. Hold still and it syncs.",
  cycling: "You are here. Pull up and it syncs.",
  driving: "You are in it now. It syncs as you go through.",
  flight: "You are over it now.",
  rail: "You are passing it now.",
};

/** And how you get there. */
const APPROACH: Record<TravelMode, string> = {
  walking: "walk to it to sync",
  cycling: "ride to it to sync",
  driving: "it syncs when you drive through",
  flight: "it opens as you fly over",
  rail: "it opens as you pass",
};

export function EchoPopup({
  echo,
  distanceKm,
  state,
  mode,
  saved,
  aimed,
  onAim,
  onSave,
  onPlay,
  onClose,
}: EchoPopupProps) {
  const metres = distanceKm === null ? null : distanceKm * 1000;
  const synced = state === "captured" || state === "heard";
  const withinReach = metres !== null && metres <= REACH_M;

  return (
    <div className="pop" role="dialog" aria-label={echo.title}>
      <button className="pop-close" onClick={onClose} aria-label="Close">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>

      <span className={`pop-kicker cat-${echo.category}`}>
        <span className="pop-dot" />
        {CATEGORY_LABEL[echo.category]}
      </span>

      <h3>{echo.title}</h3>

      <p className="pop-where">
        {echo.point.place} · {Math.max(1, Math.round(echo.durationS / 60))} min
      </p>

      <p className="pop-teaser">{echo.teaser ?? echo.summary}</p>

      {/*
        One control, and only when there is something to press. The rest of the time this
        is a sentence, because "you are 300 metres away" is information and a greyed-out
        play button is a small insult.
      */}
      {synced ? (
        <button className="pop-go" onClick={() => onPlay(echo)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
          {state === "heard" ? "Play it again" : "Play"}
        </button>
      ) : (
        /*
          Three sentences, because getting there is three different things. A driver is
          never going to stand anywhere, and telling them to walk to something fifteen
          kilometres up the road is the app not knowing what they are doing.
        */
        <p className={withinReach ? "pop-state pop-state-near" : "pop-state"}>
          {withinReach ? ARRIVED[mode] : `${away(metres)} · ${APPROACH[mode]}`}
        </p>
      )}

      {/*
        Take me there.
        This is the moment the street map earns its place: until you have picked something,
        a map answers a question nobody asked, and the second you have, it is the right
        object. Absent once the echo is yours, because there is nowhere left to walk.
      */}
      {onAim && !synced && (
        <button
          className={aimed ? "pop-aim on" : "pop-aim"}
          onClick={() => onAim(echo)}
          aria-pressed={aimed}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 12l4-7-7 4z" />
          </svg>
          {aimed ? "Following this one" : "Take me there"}
        </button>
      )}

      <button
        className={saved ? "pop-save on" : "pop-save"}
        onClick={() => onSave(echo)}
        aria-pressed={saved}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
        {saved ? "Saved" : "Save for later"}
      </button>
    </div>
  );
}

/**
 * Coarse, like everything else that reports distance here.
 *
 * A live metre count invites staring at a screen while walking, which is the one behaviour
 * this product is arranged to prevent.
 */
function away(metres: number | null): string {
  if (metres === null) return "Somewhere near here";
  // Rounded to fifty metres, not bucketed. Buckets were rounding 350m up to "about 500m"
  // while the list two inches below said 350m, which is the kind of disagreement that
  // makes somebody stop believing either number.
  if (metres < 950) return `About ${Math.round(metres / 50) * 50}m away`;
  return `${(metres / 1000).toFixed(1)}km away`;
}
