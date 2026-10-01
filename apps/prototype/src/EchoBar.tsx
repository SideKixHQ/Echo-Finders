/**
 * One bar, at the bottom of the map, and it is the only chrome down there.
 *
 * WHY THIS EXISTS. A photograph of the real app on a real phone: a category chip row and a
 * journey chip across the top, then the map, then a proximity strip, then the stepper, then
 * the sheet's mini player, then the tab bar. Measured off that screenshot, the map had a
 * third of the screen and the furniture had the rest — on the one product whose entire
 * proposition is "look at what is around you". The report was "the map is the main focus
 * but you have a sheet and the selector and it doesn't make sense, it takes up too much
 * room".
 *
 * Three strips went into this one. They were three because they arrived on three different
 * days, not because they answer three different questions:
 *
 *   the stepper       which echo are we looking at, and take me to the next one
 *   the mini player   what is in my ears, and shut it up
 *   the proximity bar am I getting warmer
 *
 * All three are about ONE echo. So there is one bar about one echo, and the three answers
 * are a row, an orb and a colour rather than 224 pixels of stacked panels. On a 375x667
 * phone that is the difference between 20 percent of the screen being map and 65 percent.
 *
 * THE ORB IS THE CREATURE, and that is the part worth arguing for. It was going to be a
 * play triangle in a circle, which is what every audio app has, and the creature was going
 * to be a separate flourish somewhere. But the creature's eyes ALREADY ARE a pause glyph
 * that swings into a play triangle when you sync it — that is the whole idea of the
 * character (see `Echo.tsx`). A bar that needs a play button and a product that has a
 * character whose face is a play button is not two problems.
 *
 * So the left of the bar is the echo itself, at whichever face matches where you are with
 * it:
 *
 *   sealed    you have not been there. Tapping opens the card, because there is nothing
 *             to play yet and a play button that refuses is worse than no play button.
 *   calling   the proximity cue is warm on this one. It has noticed you.
 *   armed     synced. The face IS the play triangle, and tapping it plays.
 *   playing   talking. Tapping pauses.
 *
 * And the proximity answer rides the same object rather than taking a strip of its own: the
 * orb's halo pulses in time with the cue the engine emitted, in ember, and the creature
 * turns to `calling` when it is warm. Same rhythm as the haptic would be, so the two
 * channels say one thing. This is also the only proximity feedback an iPhone web build
 * has at all (ADR-0011): there is no vibration API in Safari.
 *
 * THE ARROWS STILL WRAP and are still the point. Neither one ever moves and neither one
 * has to be aimed at, which is the whole argument for a stepper over a 41px pin in a pile
 * of twenty six. Nearest first, so the next item is always the cheapest one to go and get.
 */

import { presetFor, rarityOf, type Echo, type Guidance, type TravelMode } from "@echofinders/core";
import { CATEGORY_LABEL } from "./categories";
import { EchoCharacter, type EchoFace } from "./Echo";
import type { PinState } from "./RouteMap";

export interface EchoBarItem {
  readonly echo: Echo;
  /** How far, or null when there is no position fix to measure from. */
  readonly distanceKm: number | null;
}

export interface EchoBarProps {
  readonly items: readonly EchoBarItem[];
  /** Where in the list we are. -1 when nothing has been chosen yet. */
  readonly index: number;
  readonly onStep: (index: number) => void;
  /** Tapping the words. Opens the echo's card, or the player when it is the one playing. */
  readonly onOpen: (echo: Echo) => void;
  readonly stateOf: (echoId: string) => PinState;
  /** What is in the listener's ears, if anything. */
  readonly nowPlaying: Echo | null;
  readonly playing: boolean;
  /** 0 to 1 through the playing echo. Drawn as a hairline under the row. */
  readonly progress: number;
  /** Pause or resume what is already going. */
  readonly onPlayPause: () => void;
  /** Start this one, which also opens the player. */
  readonly onPlay: (echo: Echo) => void;
  /** The plain-language cut, which changes the title and the running time. */
  readonly simple: boolean;
  /**
   * How you are travelling, which is the only way a distance becomes a time.
   *
   * `presetFor(mode).speedKph` is the pace the engine already reckons with — 4.5 on foot,
   * 90 in a car — so "six minutes" here and the arrival the engine predicts cannot drift
   * apart by being worked out twice.
   */
  readonly mode: TravelMode;
  /**
   * The engine's hot-and-cold verdict, carrying the echo it is about.
   *
   * Honoured only when it is about the echo the bar is showing. Warming the bar for one
   * echo while its words describe another is the screen arguing with itself, which is the
   * exact failure the old proximity strip had when a pin was tapped.
   */
  readonly guidance: Guidance | null;
}

/**
 * How much of the bottom this takes, so the map keeps its pins and its credit clear of it.
 *
 * It tracks `--step-h` in `theme.css`, exactly as `NAV_H` in `RouteMap` tracks the tab bar.
 * Change the bar and change both. It replaced 104 of stepper plus a 132 sheet peek plus a
 * 56 guidance strip.
 */
export const ECHOBAR_H = 76;

const RARITY_LABEL: Record<string, string> = { rare: "Rare", singular: "Singular" };

export function EchoBar({
  items,
  index,
  onStep,
  onOpen,
  stateOf,
  nowPlaying,
  playing,
  progress,
  onPlayPause,
  onPlay,
  simple,
  mode,
  guidance,
}: EchoBarProps) {
  /*
   * Nothing chosen yet shows the nearest, which is what the right arrow would give you
   * anyway. An empty bar with two arrows is a control that has to be poked before it says
   * anything.
   */
  const at = index >= 0 ? index : 0;
  const current = items[at];
  if (!current) return null;

  const { echo, distanceKm } = current;
  const state = stateOf(echo.id);
  const isPlaying = nowPlaying?.id === echo.id && playing;
  const isLoaded = nowPlaying?.id === echo.id;
  const synced = state === "captured" || state === "heard";

  /*
   * The cue, but only when it is about this echo.
   *
   * `Guidance` carries its own echo precisely so this check can exist: the engine follows
   * the nearest sealed one, and the bar follows whatever the arrows are on, and those are
   * the same thing most of the time and not all of it.
   */
  const cue =
    guidance && guidance.echo.id === echo.id && guidance.cue.kind !== "none"
      ? guidance.cue
      : null;
  const warm = cue !== null && (cue.kind === "warmer" || cue.kind === "close" || cue.kind === "arrived");

  const face: EchoFace = isPlaying
    ? "playing"
    : synced
      ? "armed"
      : state === "opening" || warm
        ? "calling"
        : "sealed";

  const durationS = simple ? (echo.simple?.durationS ?? echo.durationS) : echo.durationS;
  const rarity = RARITY_LABEL[rarityOf(echo)] ?? "";
  const step = (by: number) => onStep((at + by + items.length) % items.length);

  /*
   * One button, three meanings, and each one is the only thing that could sensibly happen
   * next. It is never a play button that refuses: with nothing synced there is nothing to
   * play, so it opens the card, which is where "take me there" lives.
   */
  const orbLabel = isPlaying
    ? "Pause"
    : isLoaded
      ? `Play: ${echo.title}`
      : synced
        ? `Play: ${echo.title}`
        : `About ${echo.title}`;
  const orbTap = () => {
    if (isLoaded) onPlayPause();
    else if (synced) onPlay(echo);
    else onOpen(echo);
  };

  return (
    <div
      className={warm ? "echobar echobar-warm" : "echobar"}
      data-cue={cue ? cue.kind : "none"}
    >
      <div className="echobar-row">
        {/* Two arrows that never move. The whole argument for this over aiming at a pin. */}
        {items.length > 1 && (
          <button
            className="echobar-arrow"
            onClick={() => step(-1)}
            aria-label="The one before this"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14.5 5L8 12l6.5 7" />
            </svg>
          </button>
        )}

        <div className={`echobar-card cat-${echo.category}`}>
          <div className="echobar-face">
          <button className="echobar-orb" onClick={orbTap} aria-label={orbLabel}>
            {/*
              The halo, pulsing to the engine's own interval, so the bar and the buzz keep
              time. Arrival has no rhythm — `intervalMs` is Infinity, because it is one
              long confirmation rather than a pulse train — and formatting that gave CSS
              "Infinityms", which browsers discard silently. That bug is why this reads the
              interval defensively: the one moment worth marking was the one moment the old
              bar was not animating.
            */}
            {cue && (
              <span
                className="echobar-halo"
                aria-hidden="true"
                style={{
                  animationDuration: Number.isFinite(cue.intervalMs)
                    ? `${Math.max(cue.intervalMs, 220)}ms`
                    : `${Math.max(400, cue.pulseMs * 3)}ms`,
                  ...(Number.isFinite(cue.intervalMs) ? {} : { animationIterationCount: 1 }),
                }}
              />
            )}
            <svg viewBox="-60 -60 120 120" aria-hidden="true">
              <EchoCharacter face={face} r={40} uid="echobar" />
            </svg>
          </button>

          {/*
            The words are the way in, and a button rather than a tap handler on a div so
            they are reachable by keyboard and announced as what they are.
          */}
          <button
            className="echobar-tap"
            onClick={() => onOpen(echo)}
            aria-label={isLoaded ? `Open the player: ${echo.title}` : `Open: ${echo.title}`}
          >
            <span className="echobar-kicker mono">
              <span className="echobar-dot" />
              {rarity && <b>{rarity}</b>}
              <span>{CATEGORY_LABEL[echo.category]}</span>
              {/*
                Where you are in the ring, said as a fact rather than as a progress bar. A
                bar would imply an order worth finishing; this is a ring of places and you
                can get off it anywhere.
              */}
              {items.length > 1 && (
                <em aria-live="polite">
                  {at + 1} of {items.length}
                </em>
              )}
            </span>
            <strong>{simple ? (echo.simple?.title ?? echo.title) : echo.title}</strong>
            {/*
              The place stretches and truncates; the two facts never do.

              Written as one string it came out "Castle Clinton, Battery Par…" on a 375px
              phone — the ellipsis had eaten the distance and the running time, which are
              the two things on this line somebody acts on. Rendered and measured, not
              reasoned about.
            */}
            <span className="echobar-where">
              <span className="echobar-place">{shortPlace(echo.point.place)}</span>
              <span className="echobar-facts">
                {reach(distanceKm, cue?.kind ?? null, presetFor(mode).speedKph)} · {clock(durationS)}
              </span>
            </span>
          </button>
          </div>

          {/*
            How far through, as a hairline rather than a scrubber.

            A bar this small that can be dragged is a bar people drag by accident while
            reaching for the map. Seeking belongs on the screen with the ribbon on it; this
            only has to answer "how far in am I", and only while there is an answer. It
            keeps its height either way, so the bar is exactly one height and the map's
            reserved band never moves under it.
          */}
          <div className="echobar-progress" aria-hidden="true">
            {isLoaded && (
              <span style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }} />
            )}
          </div>
        </div>

        {items.length > 1 && (
          <button className="echobar-arrow" onClick={() => step(1)} aria-label="The next one">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9.5 5L16 12l-6.5 7" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * HOW LONG UNTIL I AM THERE, which is the question, and metres only when minutes are silly.
 *
 * It was metres all the way out, and "390 m" is a measurement rather than an answer:
 * nobody decides anything from it without first dividing by their own walking pace in
 * their head. Six minutes is the decision. It is also the one number this bar was missing
 * — the top of the screen has how long the whole journey has left, the bar had how long
 * the story is, and neither of them is how far away the thing in front of you is in the
 * only unit a person plans with.
 *
 * Near the end it goes back to distance, because minutes stop meaning anything there: "one
 * minute" is noise when you can see the doorway, while "100 m" tells you to look up. And
 * inside the trigger radius it stops being a number at all — a live count that close
 * invites staring at a screen instead of at the thing, which is the one behaviour this
 * whole product is arranged to prevent.
 *
 * The metres are rounded to fifty, which is the echo card's rounding. They are on screen
 * together — tap the bar and the card opens above it — and they disagreed in an early
 * render: "390 m" on the bar over "About 400m away" on the card, about the same echo, two
 * inches apart. That is how somebody stops believing either number.
 */
function reach(distanceKm: number | null, cue: string | null, speedKph: number): string {
  if (cue === "arrived") return "you're here";
  if (cue === "close") return "a few steps";
  if (distanceKm === null) return "near here";
  const m = distanceKm * 1000;
  if (m < 150) return `${Math.max(50, Math.round(m / 50) * 50)} m`;
  const minutes = Math.round((distanceKm / speedKph) * 60);
  if (minutes < 1) return `${Math.round(m / 50) * 50} m`;
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}`;
}

/**
 * The place, to its first comma.
 *
 * "Castle Clinton, Battery Park" is a place and a neighbourhood, and on a 375px phone the
 * bar has about 180 pixels for the whole line — so the ellipsis ate the distance and the
 * running time, which are the two things on it somebody acts on. The first part is the
 * place; the rest is where the place is, and the card one tap away still says all of it.
 */
function shortPlace(place: string): string {
  const cut = place.indexOf(",");
  return cut > 0 ? place.slice(0, cut) : place;
}

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
