/**
 * The map's controls: two round buttons down the right hand side, as the approved map
 * board draws them. "Show where I am" and "Sound", and nothing else.
 *
 * WHY TWO. This column had grown to six: go to my location, the sonar, the street hum,
 * the city heatmap, the compass view and the framing button. Two of them meant "around
 * me" ("Echoes around me" and "Back to what is around you") and nobody could tell them
 * apart, and the stack was tall enough to sit on the pins down the right of the map.
 * Each of the four that left still has a home where somebody would look for it
 * (ADR-0018, amended 2026-11-10):
 *
 *   - **Listen for echoes**, the street hum, is on the compass view, which is where it was
 *     built and the screen it belongs to: it places each echo by the way you are facing.
 *   - **Back to what is around you**, the compass view itself, is a card in the trip sheet
 *     on foot ("Compass view"), and the compass has its own "Show the map" to come back.
 *     With a walk under way the same card goes back to the walk.
 *   - **Echoes around me / Whole journey**, the framing button. Exploring, it is what a
 *     pinch out does now: the map shows numbered clusters and the card that counts what
 *     is on screen. On a route or a planned walk it is a card in the trip sheet ("Whole
 *     journey", "Whole route"), and the locate arrow is the way back, as it always was.
 *   - **Where the echoes are**, the city heatmap, is gone. The zoomed out map answers the
 *     same question with real pins, and the heatmap's own numbers did not hold up ("10
 *     places" over four labelled states, "2567.9km across"). The empty screen's "Show me
 *     where they are" frames the echoes on the map instead.
 *
 * There are no popovers here, and that is still the point: a control on the map does one
 * thing when tapped and says so in its name.
 */

import { memo } from "react";

/**
 * The three screens a walker can be on: what is around you, the street map, and the walk
 * itself. Named here because the trip sheet and App both have to agree on it.
 */
export type WalkingView = "rose" | "map" | "walk";

export interface RailProps {
  /**
   * The map is centred on you and moving with you. Lights the locate arrow, the way every
   * maps app does: filled while it follows, an outline once you have dragged away.
   */
  readonly following?: boolean;
  /** "Go to my location": centre on you at street level, and follow. */
  readonly onLocate?: () => void;
  /**
   * Sound: the sonar, the ping that quickens as you close on a sealed echo.
   *
   * James (2026-10-11): "the sonar noise, you need a way to mute really easy. right on the
   * map". Present whenever the sonar can sound, which is the self-directed modes. Drawn as
   * the board's speaker, crossed when muted, so it reads as sound without a word.
   */
  readonly sonar?: boolean;
  readonly onSonar?: (on: boolean) => void;
}

function RailInner({ following, onLocate, sonar, onSonar }: RailProps) {
  if (!onLocate && onSonar === undefined) return null;
  return (
    <div className="rail">
      {/*
        GO TO MY LOCATION, first in the column and drawn as the arrow every maps app uses,
        so nobody has to read it.
      */}
      {onLocate && (
        <button
          className={following ? "fab fab-locate following" : "fab fab-locate"}
          onClick={onLocate}
          aria-pressed={following ?? false}
          aria-label="Go to my location"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20.5 3.5 3.5 10.6l7.2 2.7 2.7 7.2z" />
          </svg>
        </button>
      )}

      {onSonar !== undefined && (
        <button
          className={sonar ? "fab fab-sonar sounding" : "fab fab-sonar"}
          onClick={() => onSonar(!sonar)}
          aria-pressed={sonar ?? false}
          aria-label={sonar ? "Mute the sonar" : "Turn the sonar on"}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 10v4h4l5 4V6L8 10z" />
            {sonar ? (
              <path className="sonar-ping" d="M16 9a4 4 0 0 1 0 6" />
            ) : (
              <path d="M16.5 9.5l5 5M21.5 9.5l-5 5" />
            )}
          </svg>
        </button>
      )}
    </div>
  );
}

/*
 * Memoised. Nothing here depends on where the listener is, and the app re-renders on every
 * position fix, four times a second, for the life of a journey. Its callbacks are stable
 * in `App`, which is what makes the comparison succeed.
 */
export const Rail = memo(RailInner);
