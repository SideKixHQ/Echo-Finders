/**
 * The control column, as the design has it.
 *
 * A short stack of plain controls down the right-hand side, above the sheet. Every value
 * is from
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
 * **Kids mode and the theme are no longer here.** Board 2's column carries three things,
 * all of them about the map in front of you: where am I, how close in, and is this
 * journey on the phone. Kids mode changes which echoes exist and the theme changes the
 * whole app, so they were two settings parked on the map, and they cost the column a
 * third of its height — the six objects that put a fab over the category chips and left
 * pins hiding behind the stack. They live on the settings tab now, which is where
 * somebody looks for them.
 */

import { memo } from "react";

/**
 * The three screens a walker can be on: what is around you, the street map, and the walk
 * itself. Named here because the Rail and App both have to agree on it.
 */
export type WalkingView = "rose" | "map" | "walk";

export interface RailProps {
  /**
   * The zoom, and how to change it.
   *
   * Board 2 puts a magnifier on this column, between recentre and download, and it was
   * the one control on the board that had never been built. The map HAS been zoomable
   * since it was written — pinch, double tap, scroll wheel — and every one of those is
   * invisible. A gesture nobody is told about is a feature nobody has.
   *
   * Two buttons rather than the board's one, because a map you can only zoom one way is
   * a trap, and joined into a single pill so the column still reads as the board's short
   * stack of round controls rather than growing a sixth object.
   */
  readonly zoom: number;
  readonly onZoom: (next: number) => void;
  readonly minZoom: number;
  readonly maxZoom: number;
  /**
   * The street humming, and the reason it is on this column at all.
   *
   * `hum.ts` is the most ambitious thing in the app: every echo in reach emits a quiet
   * tone placed at its true bearing, one note per category, pentatonic so any combination
   * of them is a chord rather than a cluster; sealed ones are heard through a low-pass
   * with noise under them, and standing in the right place opens the filter. It is the
   * one part of this product that is genuinely immersive rather than a picture of
   * something immersive.
   *
   * It was switched off by default and reachable from exactly one place: a card on the
   * rose. Then the app stopped opening on the rose, and the answer to "why isn't this
   * immersive" became "because the immersion is behind a screen you no longer land on".
   *
   * So it is on the map, on the column, next to the zoom. Off by default still, because
   * it is audio and audio that starts itself is a different kind of rude.
   */
  readonly humming?: boolean;
  readonly onHum?: (on: boolean) => void;
  /** Showing the whole journey rather than following the listener. */
  readonly overview: boolean;
  /**
   * Whether the map has been dragged off centre.
   *
   * Only used to label the recentre button honestly. With a drag in play the button's job
   * is "put me back", whatever the overview is set to, and saying "whole journey" there
   * describes something it is not about to do.
   */
  readonly panned?: boolean;
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
  zoom,
  onZoom,
  minZoom,
  maxZoom,
  humming,
  onHum,
  overview,
  panned,
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
        The hum, at the top of the column, and lit when it is on.

        Top because it is the only control here that changes what the app IS rather than
        what the map shows, and because a listener who never finds it never meets the
        product. The equaliser mark is the rose's own, so the two places agree.
      */}
      {onHum !== undefined && (
        <button
          className={humming ? "fab fab-hum on" : "fab fab-hum"}
          onClick={() => onHum(!humming)}
          aria-pressed={humming ?? false}
          aria-label={humming ? "Stop listening for echoes" : "Listen for echoes"}
        >
          <svg viewBox="0 0 24 24">
            <path d="M4 12h2.5l2-6 3 12 2.5-8 1.5 4H20" />
          </svg>
        </button>
      )}

      {/*
        Zoom, as board 2 draws it: the same magnifier, on the same column.

        A joined pair rather than two fabs. The column is anchored to the bottom and grows
        upward, and a sixth free-standing object put the top one through the category
        chips — measured, not guessed, the last time this column grew. Joined, in and out
        read as one control, which is also what they are.

        Disabled at the limits rather than silently doing nothing, because a button that
        responds to nothing is how somebody decides the map is broken.
      */}
      <div className="fab fab-zoom">
        <button
          onClick={() => onZoom(zoom * 1.6)}
          disabled={zoom >= maxZoom - 1e-6}
          aria-label="Zoom in"
        >
          <svg viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M8 11h6M11 8v6M20.5 20.5L16 16" />
          </svg>
        </button>
        <button
          onClick={() => onZoom(zoom / 1.6)}
          disabled={zoom <= minZoom + 1e-6}
          aria-label="Zoom out"
        >
          {/* The board's own glyph, to the stroke. */}
          <svg viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M8 11h6M20.5 20.5L16 16" />
          </svg>
        </button>
      </div>

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
        aria-label={panned ? "Back to where I am" : overview ? "Follow me" : "Whole journey"}
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
