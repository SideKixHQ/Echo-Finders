/**
 * The journey, in one line, and it is two different lines depending on who is travelling.
 *
 * WHY IT WAS REBUILT. A photograph of the real thing on a phone: `Battery … ● African … 17m ›`.
 * Two place names cut to one word each with a bullet between them. The bullet is not a
 * separator — it is the PLAYHEAD, sitting on a progress bar with no width, and the
 * arithmetic says exactly why:
 *
 *   .mapbar at 375                     351
 *   less the category filter           131
 *   the chip gets                      212
 *   less padding and four gaps         144 for content
 *   two names capped at 34% each       72 and 72, where "Battery Park" needs about 82
 *   LEFT FOR THE BAR                   minus 39
 *
 * So the bar collapses, its dot survives, and the one picture this component exists to
 * draw — here is the line, here is you on it — is gone. It had six pixels before the
 * filter joined that row and went negative after, which is worth owning: the squeeze was
 * self-inflicted.
 *
 * AND THE DEEPER CAUSE: `short()` returns the airport code when there is one. This was
 * drawn for a flight. "SFO ●———— JFK · 5h19" fits 212px beautifully; "Battery Park ●
 * African Burial Ground" never could. A component built for three-letter codes was reused
 * for street names and nobody re-did the sums.
 *
 * SO IT SPLITS, along the line the app already draws everywhere else:
 *
 *   carried (flight, rail)      origin, bar, destination, time. Unchanged, because a
 *                               passenger cannot look out of the window and know where
 *                               they are — the line IS the orientation, and codes leave
 *                               room for it.
 *   self-directed (foot, car)   the destination and the time left. The origin is history
 *                               the moment you set off, which is why Google Maps and
 *                               Apple Maps both drop it once you are moving and show what
 *                               is ahead instead.
 *
 * Progress on the self-directed line is the CHIP ITSELF filling from the left rather than
 * a bar competing for width. A background cannot be squeezed to minus thirty-nine pixels.
 */

import { presetFor, type Route } from "@echofinders/core";
import { MODE_ICON } from "./travel";

export interface RouteRibbonProps {
  readonly route: Route;
  /** 0–1 along the route. */
  readonly progress: number;
  /** Seconds left, at the route's own pace. */
  readonly remainingS: number;
}

export function RouteRibbon({ route, progress, remainingS }: RouteRibbonProps) {
  const pct = Math.max(0, Math.min(1, progress)) * 100;

  /*
   * Carried, so both ends still earn their place. Codes are three characters and the bar
   * has the room the design drew it with.
   */
  if (!presetFor(route.mode).selfDirected) {
    return (
      <div className="ribbon ribbon-carried">
        <svg className="ribbon-mode" viewBox="0 0 24 24" aria-hidden="true">
          {MODE_ICON[route.mode]}
        </svg>
        <b>{short(route.origin)}</b>
        <span className="ribbon-bar">
          <i style={{ width: `${pct}%` }} />
          <u style={{ left: `${pct}%` }} />
        </span>
        <b>{short(route.destination)}</b>
        <small>{left(remainingS)}</small>
        <Chevron />
      </div>
    );
  }

  return (
    <div className="ribbon ribbon-ahead">
      {/*
        The fill is the progress, and it is behind everything rather than beside it. Marked
        hidden from the accessibility tree because the time left already says the same
        thing in words, and better.
      */}
      <span className="ribbon-fill" style={{ width: `${pct}%` }} aria-hidden="true" />
      <svg className="ribbon-mode" viewBox="0 0 24 24" aria-hidden="true">
        {MODE_ICON[route.mode]}
      </svg>
      {/*
        THE JOURNEY'S NAME, NOT ITS DESTINATION, and that is a correction rather than a
        preference.
        
        It showed the destination, and the destination of a walk is usually an echo:
        checked against the route table, three of the five end at one. So on the Lower
        Manhattan walk this line said "African Burial Ground" while the bar at the bottom
        of the same screen said "African Burial Ground" the moment you stepped to that
        echo. The same words twice, five hundred pixels apart, with two different-looking
        time numbers under them. Spotted by the listener, confirmed in the data.
        
        The name is the better answer anyway. This chip exists to say why these pins and
        not others, and "you are on the Lower Manhattan walk" answers that where "you are
        heading to the African Burial Ground" does not. A journey is an area you move
        through; an echo is a story at a point. Those two can never collide.
      */}
      <b className="ribbon-dest">{journeyName(route)}</b>
      <small>{left(remainingS)}</small>
    </div>
  );
}

/*
 * CARRIED MODES ONLY now, and the reason is width rather than taste.
 *
 * With the category filter taking the room it needs — it is the control people actually
 * use — the journey has whatever is left, and on a 375px phone that is about 204 pixels.
 * The chevron and its gap are 21 of them, which is the difference between "Lower
 * Manhattan" and "Lower Man…". A disclosure arrow is the most expendable thing in that
 * pill: the chip is the only object on the row that names a place, and tapping a thing
 * that names your journey to change your journey needs no arrow to be guessable.
 *
 * It stays on the flight line, where the two codes are short and the space is there.
 *
 * The tap target says so inside the pill, as the roaming chip already does.
 *
 * Route mode carried it as a separate centred line of uppercase aqua UNDER the pill — a
 * whole row of chrome to say the row above it is a button, on the screen with the least
 * room to spare. The chevron is the same promise in eleven pixels, and the button's own
 * label already names it for anything that is not an eye.
 */
const Chevron = () => (
  <svg className="ribbon-more" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 5l7 7-7 7" />
  </svg>
);

/**
 * The shortest true name for a place.
 *
 * The airport code where there is one, because "SFO" is both shorter and what the ticket
 * says. Otherwise the part before the first comma: "African Burial Ground, Duane Street,
 * Manhattan" is a place, a street and a borough, and only the first is the destination.
 */
const short = (place: { code?: string; name: string }) =>
  place.code ?? place.name.split(",")[0]!;

/**
 * What to call the journey, in the width of a chip.
 *
 * Route names are written as "area: what happens on it" — "Lower Manhattan: the Battery
 * to the African Burial Ground", "Ocean Drive: the walk home" — so the part before the
 * colon is the area, which is exactly what this line is for and is always short. The
 * subtitle after it belongs on the package screen, which is one tap away and has room for
 * a sentence.
 *
 * Falls back to the destination for a route with no name, which is what this showed for
 * every route until now.
 */
function journeyName(route: Route): string {
  const name = route.name?.trim();
  if (!name) return short(route.destination);
  return name.split(":")[0]!.trim();
}

function left(seconds: number): string {
  if (seconds <= 30) return "arrived";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}
