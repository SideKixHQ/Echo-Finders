/**
 * Nothing nearby. The state most of the world is in, and the app had a sentence for it.
 *
 * Twenty-six echoes, all in lower Manhattan. Everybody who opens this anywhere else lands
 * here, so it is not an edge case, it is the first impression for almost every listener we
 * will ever have. A line of grey text at the bottom of a sheet is not an answer to it.
 *
 * It must never read as a failure and it must always offer a next move. Two of them, and
 * both do something:
 *
 *   · Show me where they are — puts the whole library on the map at once. This is the
 *     actual answer to "why is nothing here", and once seen it is not asked again.
 *   · Look further — widens the engine's reach. Shown only when widening would find
 *     something, which the caller works out from the real nearest distance. A "widen to
 *     ten miles" button offered to somebody in Lisbon is theatre.
 *
 * WHAT IS NOT HERE. The design board had a third button, "tell us to come here next".
 * There is no backend to tell, so it would collect a tap and drop it. In its place is the
 * one thing that is both true and worth knowing: how far the nearest echo actually is and
 * where it is. That is a better answer than a button that does nothing, and it is the
 * sentence a person would ask for if they could.
 *
 * This is NOT shown when the listener has simply switched every category off. That is a
 * filter, the map is full of echoes, and hiding the chips behind a full screen would leave
 * nobody a way to switch them back on. The caller separates the two.
 */

import type { Echo } from "@echofinders/core";

export interface NowhereProps {
  /** The closest echo in the whole library, however far off, or null with no fix yet. */
  readonly nearest: { readonly echo: Echo; readonly distanceKm: number } | null;
  /** How far the engine is looking right now, km. */
  readonly reachKm: number;
  readonly onShowAll: () => void;
  /** Widen the search. Given only when it would actually turn something up. */
  readonly onWiden?: (() => void) | undefined;
  readonly widenToKm: number;
}

export function Nowhere({ nearest, reachKm, onShowAll, onWiden, widenToKm }: NowhereProps) {
  return (
    <div className="nowhere">
      {/*
        The graphic and the words are one block that centres itself in whatever room the
        buttons leave, rather than being pinned under the chips with a three-hundred pixel
        hole beneath. Same reasoning as walk mode, found the same way.
      */}
      <div className="nowhere-main">
      <svg className="nowhere-seek" viewBox="0 0 390 400" aria-hidden="true">
        <g className="nowhere-grid">
          <path d="M0 96H390M0 216H390M0 336H390" />
          <path d="M98 0V400M196 0V400M294 0V400" />
        </g>
        {/*
          Rings going OUT, where the sync moment's go in. Same shape, opposite direction,
          and the difference is the whole meaning: this one is still asking.
        */}
        <circle className="nowhere-ring" cx="195" cy="200" r="132" />
        <circle className="nowhere-ring nowhere-ring-2" cx="195" cy="200" r="86" />
        <circle className="nowhere-reach" cx="195" cy="200" r="42" />
        <circle className="nowhere-me" cx="195" cy="200" r="11" />
      </svg>

      <div className="nowhere-say">
        <h1>Nothing within {reach(reachKm)}</h1>
        {/*
          The distance is the honest version of "we are only in lower Manhattan so far".
          It is computed, it changes as the library grows, and it tells somebody in Lisbon
          something they can act on rather than a fact about our roadmap.
        */}
        {nearest ? (
          <p>
            The nearest one is <b>{coarse(nearest.distanceKm)}</b> away, at{" "}
            {nearest.echo.point.place}. That is a real answer rather than a glitch, and it
            will keep changing.
          </p>
        ) : (
          <p>
            We are only in a few places so far. That is a real answer rather than a glitch,
            and it will keep changing.
          </p>
        )}
      </div>
      </div>

      <div className="nowhere-acts">
        <button className="nowhere-go" onClick={onShowAll}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M8 11h6M20.5 20.5L16 16" />
          </svg>
          Show me where they are
        </button>
        {onWiden && (
          <button className="nowhere-widen" onClick={onWiden}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="M11 8v6M8 11h6M20.5 20.5L16 16" />
            </svg>
            Look out to {reach(widenToKm)}
          </button>
        )}
      </div>
    </div>
  );
}

/** A reach, as a person says it. Kilometres, rounded to something sayable. */
function reach(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  if (km < 10) return `${km.toFixed(1).replace(/\.0$/, "")}km`;
  return `${Math.round(km)}km`;
}

/**
 * How far off, coarsely.
 *
 * Deliberately vague at distance: "340km" and "343km" are the same fact to somebody
 * deciding whether to bother, and the precision would be false anyway once it is a journey
 * rather than a walk.
 */
function coarse(km: number): string {
  if (km < 1) return `${Math.round((km * 1000) / 50) * 50}m`;
  if (km < 10) return `${km.toFixed(1)}km`;
  if (km < 100) return `${Math.round(km)}km`;
  return `${Math.round(km / 10) * 10}km`;
}
