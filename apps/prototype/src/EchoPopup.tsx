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
 * is worse than no button, so there is only ever one primary and it says what is true:
 *
 *   far off      "Walk there · 12 min", and a gold line: it unlocks when you get there
 *   too far      "1,083 km away" and Save, because no walk goes there (`going.ts`)
 *   within reach "hold still": the sync is automatic and happens by standing there
 *   synced       Play, which is the only moment a play button appears at all
 *
 * Under it, four round buttons with their names: Save, Add to route, Share, More. The
 * smaller things a card used to carry as lines of their own (the other maps app, "Not
 * right?", "Know more about this place?") are under More, so the card is the echo and
 * one decision (James, 2026-11: "there has to be a cleaner way to display all that").
 *
 * That is the Assassin's Creed idea in one card: the memory is at the place, you go to the
 * place, and standing there is what unlocks it.
 */

import { useEffect, useRef, useState } from "react";
import { presetFor, rarityOf, type Echo, type TravelMode } from "@echofinders/core";
import { CATEGORY_LABEL } from "./categories";
import { platePng } from "./archive-plate";
import type { PinState } from "./RouteMap";
import { CrimeNote, TruthMark } from "./TruthMark";
import { driveThereUrl } from "./drive-there";
import { MODE_ICON } from "./travel";
import { walkTime } from "./directions";
import { echoLink, shareText } from "./share";
import { farAway, listenLength, tooFarToWalk } from "./going";

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
  /** Opens the route picker (`AddToRoute.tsx`). */
  readonly onAddToRoute?: (echo: Echo) => void;
  /** How many of the listener's routes this echo is already on. */
  readonly inRoutes?: number;
  readonly onPlay: (echo: Echo) => void;
  /**
   * Raise the phone and stand where the photograph was taken.
   *
   * Absent on a journey that carries you — there is no then and now from 35,000 feet — and
   * silently ignored on an echo with no plate, which is most of them today (ADR-0006).
   */
  readonly onCamera?: (echo: Echo) => void;
  /**
   * "Report a problem", under More. Opens the feedback form set to a wrong fact and
   * tagged with this echo (`Feedback.tsx`). Absent when the build has nowhere to send it.
   */
  readonly onReport?: (echo: Echo) => void;
  /** "Know more about this place?": opens the suggestion sheet for this echo's spot. */
  readonly onSuggest?: (echo: Echo) => void;
  readonly onClose: () => void;
  /** Owner mode (`owner.ts`): Play on every card, wherever the listener is. */
  readonly anywhere?: boolean;
  /**
   * The first tap on a locked echo, once ever: the gold line says how echoes unlock and how
   * close this one needs you, with Got it. It lives on the card it explains, not floating
   * over the map bar where it covered the search and the chips.
   */
  readonly tip?: { readonly line: string; readonly onDone: () => void };
}

/**
 * How close is close enough to sync — THE ECHO'S OWN ANSWER, not a constant.
 *
 * This was a flat fifty metres with a comment arguing that the card is the copy rather
 * than the rule and only has to describe the decision readably. The argument is fine and
 * the number was wrong: the engine triggers on `triggerRadiusKm`, which is per echo and
 * ranges from thirty metres to a hundred and fifty. So the card told somebody forty-five
 * metres from a thirty metre doorway to hold still, and nothing happened.
 *
 * Writing the number on screen is what made it obvious. "Syncs when you are within 30 m"
 * is a promise specific enough to be checked, which a vague one never was.
 */
const reachM = (echo: Echo) => Math.round(echo.point.triggerRadiusKm * 1000);

/** What being there means, per mode. */
const ARRIVED: Record<TravelMode, string> = {
  walking: "You are here. Hold still and it syncs.",
  cycling: "You are here. Pull up and it syncs.",
  driving: "You are in it now. It syncs as you go through.",
  flight: "You are over it now.",
  rail: "You are passing it now.",
};

/** Why there is no Play yet, in the gold line under the way there. */
const UNLOCKS: Record<TravelMode, string> = {
  walking: "Unlocks when you get there",
  cycling: "Unlocks when you get there",
  driving: "Unlocks as you drive through",
  flight: "Unlocks as you fly over",
  rail: "Unlocks as you pass",
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
  onAddToRoute,
  inRoutes = 0,
  onPlay,
  onCamera,
  onReport,
  onSuggest,
  onClose,
  anywhere = false,
  tip,
}: EchoPopupProps) {
  const metres = distanceKm === null ? null : distanceKm * 1000;
  const synced = state === "captured" || state === "heard";
  const reach = reachM(echo);
  const withinReach = metres !== null && metres <= reach;
  const rarity = rarityOf(echo);
  const photo = echo.archive?.[0];
  const playable = synced || anywhere;
  const ground = mode === "walking" || mode === "cycling" || mode === "driving";
  /*
    Somewhere looked up, a city away: there is no walk to offer. Searching Boston from
    Wilmington offered "Walk there", and the walk it started said "Too far to walk". So the
    card says the distance plainly and the one useful thing is keeping it for later.
  */
  const tooFar = !playable && !withinReach && mode !== "driving" && onAim !== undefined && tooFarToWalk(distanceKm);
  const [more, setMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  /*
    The menu shuts on a tap anywhere else, and on Escape without taking the card with it.
  */
  useEffect(() => {
    if (!more) return;
    const away = (e: PointerEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setMore(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setMore(false);
      moreRef.current?.querySelector<HTMLButtonElement>(".pop-more")?.focus();
    };
    document.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc, true);
    return () => {
      document.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", esc, true);
    };
  }, [more]);

  // Closing one card and opening another starts with the menu shut.
  useEffect(() => setMore(false), [echo.id]);

  /*
    What did not earn a place on the card itself: the other maps app, "Not right?" and
    "Know more about this place?". Each one is still a tap away, under More.
  */
  const label = echo.point.place.split(",")[0] ?? echo.title;
  // Walking stays in the app (James, 2026-11-10: no hand-off to Maps). Driving keeps its maps link.
  const mapsHref = ground && mode === "driving" ? driveThereUrl(echo.point.at, label) : null;
  const hasMore = mapsHref !== null || onReport !== undefined || onSuggest !== undefined;

  return (
    <div className="pop" role="dialog" aria-label={echo.title}>
      {/*
        The photograph, and it is the best idea in the whole design. The card does not
        describe the place it sends you to, it SHOWS you the place — and because ours have
        pasts, the picture is the archive plate rather than a street view. You are hunting
        for the spot this photograph was taken from.

        Absent when no plate has been cleared for this echo (ADR-0006), which is most of
        them today. A card with a grey rectangle saying "no image" is a worse card than one
        that never mentioned a picture.

        THE PLATE IS THE CAMERA BUTTON, when there is a camera to open, and a plain picture
        where there is not: a thing that looks pressable and is not is worse than a thing
        that never claimed to be.
      */}
      {photo &&
        (onCamera ? (
          <button className="pop-plate pop-plate-tap" onClick={() => onCamera(echo)}>
            <img src={platePng(photo.imageKey, "then")} alt="" draggable={false} />
            <span className="mono">
              {photo.year ? `Photographed here, ${photo.year}` : "Photographed here"}
            </span>
            <small className="pop-plate-credit">{plateCredit(photo.credit)}</small>
            <span className="pop-plate-cam" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M4 8h3l1.6-2.2h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
                <circle cx="12" cy="13.5" r="3.4" />
              </svg>
              Then &amp; now
            </span>
          </button>
        ) : (
          <div className="pop-plate">
            <img src={platePng(photo.imageKey, "then")} alt="" draggable={false} />
            <span className="mono">
              {photo.year ? `Photographed here, ${photo.year}` : "Photographed here"}
            </span>
            <small className="pop-plate-credit">{plateCredit(photo.credit)}</small>
          </div>
        ))}

      {/* Floated, so the kicker line is the ✕'s line and a long title wraps clear of it. */}
      <button className="pop-close" onClick={onClose} aria-label="Close">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>

      <span className={`pop-kicker cat-${echo.category}`}>
        {CATEGORY_LABEL[echo.category]}
        {/* The rarity decides whether the walk is worth taking, so it is here, before it. */}
        {rarity !== "common" && <em className="pop-rarity">{rarity}</em>}
        {/* On a short screen the mark rides this line instead of taking its own. */}
        <span className="pop-truth-inline">
          <TruthMark echo={echo} short />
        </span>
      </span>

      <h3>{echo.title}</h3>
      <p className="pop-where">{echo.point.place}</p>
      {/* How long it is, beside the mark, so a long address cannot crop it off. */}
      <span className="pop-truth">
        <TruthMark echo={echo} />
        <span className="pop-len">{listenLength(echo.durationS)}</span>
      </span>

      <p className="pop-teaser">{echo.teaser ?? echo.summary}</p>
      <CrimeNote echo={echo} />

      {/*
        ONE primary, and it says what is true. Synced (or a gift, or the owner): Play. Not
        yet: the way there, with how long it takes, and a line saying why Play is not here.
        Standing on it: no button at all, because the sync is automatic and happens by
        standing there; a "walk there" offered to somebody already there is the screen
        disagreeing with itself.
      */}
      <div className="pop-primary">
        {playable ? (
          <button className="pop-go" onClick={() => onPlay(echo)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
            {state === "heard" ? "Play it again" : "Play"}
          </button>
        ) : withinReach ? (
          <p className="pop-state pop-state-near">{ARRIVED[mode]}</p>
        ) : mode === "driving" ? (
          /*
            A driver is not walked anywhere by the beacon: the drive goes to their own maps
            app (`drive-there.ts`), and the echo keeps playing here.
          */
          <a className="pop-aim" href={driveThereUrl(echo.point.at, label)} target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {MODE_ICON.driving}
            </svg>
            Drive there
          </a>
        ) : tooFar ? (
          <>
            <p className="pop-state pop-far">{farAway(distanceKm ?? 0)}</p>
            <button className={saved ? "pop-aim pop-keep on" : "pop-aim pop-keep"} onClick={() => onSave(echo)} aria-pressed={saved}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
              {saved ? "Saved" : "Save"}
            </button>
          </>
        ) : onAim ? (
          <button className={aimed ? "pop-aim on" : "pop-aim"} onClick={() => onAim(echo)} aria-pressed={aimed}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M21 3L3 10.5l7.5 3L13.5 21z" />
            </svg>
            {aimed ? "Following this one" : goThere(mode, distanceKm)}
          </button>
        ) : (
          // Carried (a flight, a train): nothing to press, only how far it is.
          <p className="pop-state">{away(metres)}</p>
        )}
        {!playable && !withinReach && (
          <p className="pop-lock">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            {tip ? `Echoes unlock where they happened. ${tip.line}.` : tooFar ? "Unlocks when you're there" : UNLOCKS[mode]}
          </p>
        )}
        {tip && !playable && !withinReach && (
          <button className="pop-tip-ok" onClick={tip.onDone}>
            Got it
          </button>
        )}
      </div>

      {/*
        The four things you can do with an echo besides hear it, as round buttons with their
        names under them: an icon alone is a guess, and these are read at arm's length.
      */}
      <div className="pop-acts" ref={moreRef}>
        {/* Too far, Save is the primary above, and a second Save here would be the card twice. */}
        {!tooFar && (
          <button className={saved ? "pop-act on" : "pop-act"} onClick={() => onSave(echo)} aria-pressed={saved}>
            <span className="pop-act-ring" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            </span>
            {saved ? "Saved" : "Save"}
          </button>
        )}
        {onAddToRoute && (
          <button
            className={inRoutes ? "pop-act pop-route on" : "pop-act pop-route"}
            onClick={() => onAddToRoute(echo)}
            aria-haspopup="dialog"
          >
            <span className="pop-act-ring" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <circle cx="6" cy="18" r="2.2" />
                <circle cx="18" cy="6" r="2.2" />
                <path d="M8 18h6.5a3.5 3.5 0 0 0 0-7h-5a3.5 3.5 0 0 1 0-7H16" />
              </svg>
            </span>
            {inRoutes ? (inRoutes === 1 ? "On a route" : `On ${inRoutes} routes`) : "Add to route"}
          </button>
        )}
        <button
          className="pop-act pop-share"
          onClick={() => void shareText(echo.title, echo.teaser ?? echo.summary, echoLink(echo.id))}
        >
          <span className="pop-act-ring" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 15V3M8.5 6.5L12 3l3.5 3.5" />
              <path d="M7 10H5v11h14V10h-2" />
            </svg>
          </span>
          Share
        </button>
        {hasMore && (
          <button
            className={more ? "pop-act pop-more on" : "pop-act pop-more"}
            onClick={() => setMore((m) => !m)}
            aria-haspopup="menu"
            aria-expanded={more}
            aria-controls="pop-menu"
          >
            <span className="pop-act-ring" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="pop-dots">
                <circle cx="5" cy="12" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="19" cy="12" r="2" />
              </svg>
            </span>
            More
          </button>
        )}
        {more && (
          <div className="pop-menu" id="pop-menu" role="menu" aria-label="More for this echo">
            {mapsHref && (
              <a
                className="pop-menu-item"
                role="menuitem"
                href={mapsHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMore(false)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 4L3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z" />
                  <path d="M9 4v13.5M15 6.5V20" />
                </svg>
                Directions in Maps
              </a>
            )}
            {onReport && (
              <button
                className="pop-menu-item"
                role="menuitem"
                onClick={() => {
                  setMore(false);
                  onReport(echo);
                }}
                aria-haspopup="dialog"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 21V4h11l-1.5 4L16 12H5" />
                </svg>
                Report a problem
              </button>
            )}
            {onSuggest && (
              <button
                className="pop-menu-item"
                role="menuitem"
                onClick={() => {
                  setMore(false);
                  onSuggest(echo);
                }}
                aria-haspopup="dialog"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v8M8 12h8" />
                </svg>
                Know more about this place?
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * "Walk there · 12 min": how long, at the pace the engine reckons with
 * (`presetFor(mode).speedKph`), which is the sum the bar under the card does too, so the
 * two never disagree about the same echo. Past ten hours on foot the time is not an
 * answer, so it is left off.
 */
function goThere(mode: TravelMode, distanceKm: number | null): string {
  const verb = mode === "cycling" ? "Ride there" : "Walk there";
  if (distanceKm === null) return verb;
  const seconds = (distanceKm / presetFor(mode).speedKph) * 3600;
  return seconds >= 36000 ? verb : `${verb} · ${walkTime(seconds)}`;
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

/**
 * The photograph's credit, short enough for a corner of the plate.
 *
 * An archive image is shown with its credit or not at all (`parse.ts`), and the card is
 * where most people see it, so the credit is on the photograph itself rather than only in
 * the Then & Now viewfinder. The link at the end of a credit is for a reviewer, not for a
 * phone screen, so it is dropped here; the viewfinder still shows the whole line.
 */
export function plateCredit(credit: string): string {
  return credit
    .replace(/,?\s*https?:\/\/\S+\s*$/, "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim();
}
