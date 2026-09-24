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
        aria-label={downloaded ? "Your journey — on this device" : "Download this journey"}
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
