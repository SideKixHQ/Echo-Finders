/**
 * Walk mode. The screen you hold while you are on your way to one particular echo.
 *
 * WHY IT EXISTS AT ALL, which is a platform fact rather than a design preference. On iOS,
 * Web Audio and geolocation are suspended the moment the screen locks or the browser goes
 * to the background. Echo Finders is a web app by ADR-0001, chosen for good reasons about
 * people who did not install anything first. So the core promise — pocket the phone and
 * walk until something plays — does not survive a screen lock. ADR-0001 names the
 * mitigation in one line and nothing implemented it until `wake.ts`.
 *
 * If the screen has to stay on for the whole walk, it should be designed for staying on
 * rather than left as a lit street map burning a battery in a pocket. So: near black,
 * because an OLED spends almost nothing on black pixels; one lit object, which is the echo
 * pulling; and type big enough to read at waist height without breaking stride.
 *
 * It is not the rose and it does not replace it. The rose answers "what is around me",
 * which is a survey. This answers "am I still going the right way", which is one question
 * asked over and over, and the honest answer to it is a sentence rather than a diagram.
 *
 * WHAT IT REFUSES TO SAY. The design board promised "it will play by itself when you
 * arrive" unconditionally. Auto-play is off by default, can be narrowed to a chosen few,
 * and cannot happen at all for an echo with no audio rendered — which is most of the
 * library today. `willPlayOnArrival` is the engine's own test, so the sentence and the
 * behaviour cannot come apart. When it will not play, the screen says what will happen
 * instead.
 */

import { useEffect, useRef, useState } from "react";
import {
  aimWords,
  compassWords,
  rarityOf,
  relativeBearing,
  walkDistance,
  type Echo,
} from "@echofinders/core";
import { CATEGORY_ICON } from "./categories";

const RARITY_LABEL: Record<string, string> = {
  common: "Echo",
  uncommon: "Uncommon",
  rare: "Rare",
  singular: "Singular",
};

export interface WalkProps {
  readonly echo: Echo;
  readonly distanceKm: number;
  /** True bearing to the echo, degrees clockwise from north. */
  readonly bearingDeg: number;
  /** Where the listener is facing, or null when there is no compass to ask. */
  readonly headingDeg: number | null;
  readonly needsCompass: boolean;
  readonly onAskCompass: () => void;
  /** Whether the engine will start this one talking on arrival. Asked of the engine. */
  readonly playsItself: boolean;
  /** Of the echoes within range right now, how many are already in hand. */
  readonly syncedNearby: number;
  readonly totalNearby: number;
  /** What the screen is doing about staying awake, and the honest warning when it cannot. */
  readonly awakeNote: string;
  readonly awakeWarning: string;
  readonly onMap: () => void;
  readonly onEnd: () => void;
}

export function Walk({
  echo,
  distanceKm,
  bearingDeg,
  headingDeg,
  needsCompass,
  onAskCompass,
  playsItself,
  syncedNearby,
  totalNearby,
  awakeNote,
  awakeWarning,
  onMap,
  onEnd,
}: WalkProps) {
  const locked = usePocketLock();
  const far = walkDistance(distanceKm);
  const aimed = headingDeg !== null;
  const relative = aimed ? relativeBearing(bearingDeg, headingDeg) : 0;

  return (
    <div className={locked.on ? "walk walk-locked" : "walk"}>
      {/*
        Says out loud that it is holding the screen on, and why. An app that quietly stops
        your phone sleeping and does not mention it feels broken or dishonest, and this one
        is doing it for the whole length of a walk.
      */}
      {(awakeNote || awakeWarning) && (
        <p className={awakeWarning ? "walk-awake walk-awake-warn" : "walk-awake"}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {awakeWarning ? (
              <path d="M12 8v5M12 16.5v.01M12 3.5l9 16H3l9-16z" />
            ) : (
              <path d="M12 3v3M12 18v3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M3 12h3M18 12h3M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
            )}
          </svg>
          <span>{awakeWarning || awakeNote}</span>
        </p>
      )}

      {/*
        Everything from here to the progress bar is one block that centres itself in
        whatever room is left over. Pinned to the top, it left a two-hundred pixel hole
        above the controls on a 844pt phone and the screen read as unfinished.
      */}
      <div className="walk-main">
      {/*
        The kicker, the arrow, the number and the words are ONE object: the echo, pulling.
        Spread apart by the layout they became four separate announcements and the screen
        stopped having a subject.
      */}
      <div className="walk-head">
      <p className="walk-kicker mono">Walking to</p>

      <div className="walk-aim">
        <div className="walk-glow" aria-hidden="true" />
        {/*
          The arrow rotates, and the ROTATION IS ON A GROUP INSIDE THE SVG, never on the
          <svg> itself. Rotating the element rotates its box too, and the corners of a
          square box leave the viewBox at 45 degrees: the point of the arrow gets sliced
          off at exactly the angles it matters most. Found by rendering it, not by reading
          it.
        */}
        <svg viewBox="0 0 120 120" className="walk-arrow" aria-hidden="true">
          <g transform={`rotate(${relative} 60 60)`} className={aimed ? "" : "walk-arrow-lost"}>
            {/*
              ONE path, filled and stroked, not an outline with a second shape nested
              inside it. The design board drew two and at every angle off the vertical the
              inner shape fell out of step with the outer one and the arrow read as a torn
              kite. Rendering it at eight bearings side by side is what showed it; at 0
              degrees, which is the only angle a static board ever shows, the two-path
              version looks fine.
            */}
            <path className="walk-arrow-mark" d="M60 16 L90 100 L60 82 L30 100 Z" />
          </g>
        </svg>
      </div>

      <p className="walk-far">
        <b>{far.value}</b>
        {far.unit && <i>{far.unit}</i>}
      </p>

      {/*
        With a compass this is left and right, relative to the body. Without one there is
        no left, because left is relative to a body we cannot see — so it falls back to a
        true bearing, which is still actionable if you can find north, and offers the one
        button that can fix it. Inventing a left would be worse than admitting there is
        none.
      */}
      {aimed ? (
        <p className="walk-turn mono">{aimWords(relative)}</p>
      ) : needsCompass ? (
        <button className="walk-compass" onClick={onAskCompass}>
          Use the compass to point the way
        </button>
      ) : (
        <p className="walk-turn mono walk-turn-flat">{compassWords(bearingDeg)} of you</p>
      )}
      </div>

      <div className="walk-foot">
      <article className="walk-card">
        <p className="walk-card-kick mono">
          <span className="walk-card-glyph" aria-hidden="true">
            <svg viewBox="0 0 24 24">{CATEGORY_ICON[echo.category]}</svg>
          </span>
          {RARITY_LABEL[rarityOf(echo)] ?? "Echo"}
        </p>
        <h2>{echo.title}</h2>
        <p className="walk-card-note mono">
          {playsItself
            ? "It will play by itself when you arrive"
            : "It goes into My Echoes when you arrive, to play when you like"}
        </p>
      </article>

      {totalNearby > 0 && (
        <div className="walk-progress">
          <span className="walk-bar">
            <span style={{ width: `${Math.round((syncedNearby / totalNearby) * 100)}%` }} />
          </span>
          {/*
            Not "3 of 5 on your route". There is no route in free roam, and inventing one
            would be the fiction the whole review was about. This counts what is honestly
            countable: of the echoes within reach of where you are standing, how many you
            already hold.
          */}
          <span className="walk-count mono">
            {syncedNearby} of {totalNearby} near here
          </span>
        </div>
      )}
      </div>
      </div>

      {/*
        Pocket safe. The screen is on for the length of a walk and the phone is going in a
        pocket, so a thigh must not be able to end it. Double tap because a single tap is
        exactly what a thigh does.
      */}
      <button className="walk-lock" onClick={locked.tap} aria-pressed={locked.on}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          {locked.on ? (
            <>
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </>
          ) : (
            <>
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 7.9-.7" />
            </>
          )}
        </svg>
        {locked.on
          ? locked.armed
            ? "Tap again to unlock"
            : "Touch locked for your pocket · double tap to use"
          : "Lock for your pocket"}
      </button>

      <div className="walk-acts">
        <button className="walk-map" onClick={onMap}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3-6-3zM9 3v15M15 6v15" />
          </svg>
          Show the map
        </button>
        <button className="walk-end" onClick={onEnd}>
          End walk
        </button>
      </div>

      {/*
        The shield. While locked it sits over everything and swallows the tap, so nothing
        underneath can fire; the lock button is re-exposed by the double tap rather than by
        being outside the shield, because a target a thigh can reach is not locked.

        It says nothing itself. It had a pill reading "tap again to unlock", which landed
        directly on top of the lock button already saying exactly that, across the progress
        bar. The lock button is where the thumb is going anyway, so the message lives
        there and the shield is only a shield.
      */}
      {locked.on && (
        <button
          className="walk-shield"
          onClick={locked.tap}
          aria-label={
            locked.armed ? "Tap again to unlock the screen" : "Screen locked. Double tap to unlock."
          }
        />
      )}
    </div>
  );
}

/**
 * Double tap to unlock, and the first tap says so.
 *
 * A silent first tap is indistinguishable from a broken screen, which is how a "safety"
 * feature becomes the bug report. So the first tap arms the lock and puts the instruction
 * on screen; the second within the window opens it; and a thigh that taps once gets a
 * message nobody sees, which costs nothing.
 *
 * 600ms, not the 300ms a double-click usually gets: this is a thumb finding a phone that
 * has just come out of a pocket, not a mouse.
 */
const ARM_MS = 600;

function usePocketLock() {
  const [on, setOn] = useState(false);
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | null>(null);

  // Cleared on unmount, or a walk that ends mid-arm leaves a timer writing to a component
  // that is no longer there.
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const tap = () => {
    if (!on) {
      setOn(true);
      setArmed(false);
      return;
    }
    if (armed) {
      if (timer.current !== null) window.clearTimeout(timer.current);
      setOn(false);
      setArmed(false);
      return;
    }
    setArmed(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setArmed(false), ARM_MS);
  };

  return { on, armed, tap };
}
