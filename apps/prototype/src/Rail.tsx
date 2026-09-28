/**
 * The control column, as the design has it.
 *
 * Four plain toggles down the right-hand side, above the sheet. Every value is from
 * `design/SPEC.md` — 42px, 14px radius, 8px gap, 18px glyphs, aqua when on — rather than
 * from my eye.
 *
 * **There are no popovers, and that is the point of this rewrite.** The version this
 * replaces put a mode picker and a category filter behind two of these buttons, and
 * neither had a way out: not a tap on the map, not a tap on the sheet, not Escape, not
 * even the other rail buttons. The only target that dismissed a panel was the same
 * forty-pixel button that opened it, so in practice it sat over the map until you found
 * that button by accident. That is not a fiddly control, it is one that reads as broken —
 * and the design never had it, because it does not need it:
 *
 *   - **Filtering** is the chip row at the top. Always visible, every category at once,
 *     nothing to open or close.
 *   - **The journey** — which route, and so which travel mode — is chosen on the package
 *     screen, where you are already deciding what to carry. The download button opens it.
 *
 * So the panels are gone rather than fixed. Adding a dismiss would have been the smaller
 * change and the worse one: two ways to filter, and a covered map whenever one was open.
 *
 * Four buttons also fit in a single column at every sheet height, which retires the
 * wrapping this used to need.
 */

import { memo } from "react";

/**
 * The three screens a walker can be on: what is around you, the street map, and the walk
 * itself. Named here because the Rail and App both have to agree on it.
 */
export type WalkingView = "rose" | "map" | "walk";

export interface RailProps {
  readonly theme: "dark" | "light";
  readonly onTheme: (theme: "dark" | "light") => void;
  /** Kids mode, for the whole app. An age the engine gates on, not a filter. */
  readonly kids: boolean;
  readonly onKids: (on: boolean) => void;
  /** Showing the whole journey rather than following the listener. */
  readonly overview: boolean;
  readonly onOverview: (overview: boolean) => void;
  /** The package screen: what the journey weighs, and the route picker with it. */
  readonly onDownload: () => void;
  /** Whether the journey is already on the device. */
  readonly downloaded: boolean;
  /**
   * Walking only: swap between the rose and the street map.
   *
   * Absent on every other mode, because a driver wants the road and a passenger wants the
   * route, and neither has a head they can usefully turn.
   */
  readonly roseView?: WalkingView;
  /**
   * What leaving the map goes back to, in the listener's words.
   *
   * Passed in rather than decided here, because the answer depends on whether a walk is
   * in progress and only App knows that. Hardcoded to "Back to your walk" it promised a
   * walk to everyone who had never started one.
   */
  readonly roseBackLabel?: string;
  /**
   * Open the city: where the echoes are, at the scale where pins stop meaning anything.
   *
   * On the column rather than only on the empty screen, which is where the design puts its
   * one link to it. Somebody standing in the middle of the library never sees the empty
   * screen and would never find the city at all, and "where else is there" is a question
   * you ask most when you are already somewhere good.
   */
  readonly onCity?: () => void;
  readonly onRoseView?: () => void;
}

function RailInner({
  theme,
  onTheme,
  kids,
  onKids,
  overview,
  onOverview,
  onDownload,
  downloaded,
  roseView,
  roseBackLabel,
  onCity,
  onRoseView,
}: RailProps) {
  return (
    <div className="rail">
      {/*
        Kids mode first, because it is the only one here that changes what the app *is*
        rather than what it shows. The others are views over the same library; this one
        narrows the library itself, through the engine's age gate.
      */}
      <button
        className={kids ? "fab on" : "fab"}
        onClick={() => onKids(!kids)}
        aria-pressed={kids}
        aria-label="Kids mode"
      >
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <path d="M9 10h.01M15 10h.01M8.5 14.5a5 5 0 0 0 7 0" />
        </svg>
      </button>

      <button
        className="fab"
        onClick={() => onTheme(theme === "dark" ? "light" : "dark")}
        aria-label={theme === "dark" ? "Light mode" : "Dark mode"}
      >
        {theme === "dark" ? (
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="4.2" />
            <path d="M12 2v2.6M12 19.4V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.6M19.4 12H22M4.2 19.8L6 18M18 6l1.8-1.8" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24">
            <path d="M20 14.5A8.2 8.2 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
          </svg>
        )}
      </button>

      {/*
        Walking's view switch. The rose is the resting screen on foot and the street map is
        a thing you go and get, which is the opposite of every other mode, so the control
        only exists here.
      */}
      {onCity && (
        <button className="fab rail-city" onClick={onCity} aria-label="Where the echoes are">
          {/* A globe: meridians and a waist, which reads at 20px where continents do not. */}
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="8.5" />
            <path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.3 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.3-3.6-8.5S9.6 5.9 12 3.5z" />
          </svg>
        </button>
      )}

      {roseView && onRoseView && (
        <button
          className="fab"
          /*
            A plain toggle, because the way BACK is not always the way you came. Walk mode
            sends you to the street map with a destination on it, and the button that
            leaves the map should hand you back the walk rather than the survey you were
            doing before you picked one. Only App knows which, so App decides and this
            only says which direction it is going.
          */
          onClick={onRoseView}
          aria-pressed={roseView === "map"}
          aria-label={
            roseView === "map"
              ? (roseBackLabel ?? "Back to what is around you")
              : "Show the street map"
          }
        >
          {roseView === "map" ? (
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 12l4-7-7 4z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24">
              <path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3-6-3zM9 3v15M15 6v15" />
            </svg>
          )}
        </button>
      )}

      {/*
        Recentre — the design's "centre on aircraft", and the only button here that puts
        right what the others can break. Tapping a pin, dragging the sheet, changing
        journey: any of them can leave somebody looking at a piece of map they are not
        standing on, and the way back should not be a guess.
      */}
      <button
        className={overview ? "fab on" : "fab"}
        onClick={() => onOverview(!overview)}
        aria-pressed={overview}
        aria-label={overview ? "Follow me" : "Whole journey"}
      >
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="7" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
      </button>

      {/*
        The package, and the route picker with it. An aircraft has no signal and a foreign
        city has no data plan worth using, so carrying the journey is the difference
        between the app working and not (ADR-0003). The design collapses this one at the
        middle detent rather than letting the column grow into the sheet; so does
        `theme.css`.
      */}
      <button
        className="fab rail-pack"
        onClick={onDownload}
        aria-label={downloaded ? "Your journey, on this device" : "Download this journey"}
      >
        {downloaded ? (
          <svg viewBox="0 0 24 24">
            <path d="M12 3.2a8.8 8.8 0 1 1-6.2 2.6" />
            <path d="M8.2 11.8l3 3 5.6-6.4" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24">
            <path d="M12 3v12M7.5 10.5 12 15l4.5-4.5M4 19h16" />
          </svg>
        )}
      </button>
    </div>
  );
}

/*
 * Memoised. Nothing here depends on where the listener is, and the app re-renders on every
 * position fix — four times a second, for the life of a journey. Its callbacks are stable
 * in `App`, which is what makes the comparison succeed.
 */
export const Rail = memo(RailInner);
