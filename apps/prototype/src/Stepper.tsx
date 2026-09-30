/**
 * One echo at a time, and two arrows.
 *
 * WHY THIS EXISTS. Driving the real app and measuring: twenty six pins on the map with a
 * forty one pixel core, no list on that screen at all, and tapping zoom in three times
 * leaving zero of the twenty six on screen. Moving from one story to the next meant
 * aiming a thumb at a pile. Clustering made the pile hittable; this makes the aiming
 * optional.
 *
 * It is deliberately the smallest thing that answers "take me to the next one". No list,
 * no carousel, no map skill required: press right, the map flies to the next nearest
 * echo, its pin blooms, and this card says what it is. Two targets that never move, both
 * well over a thumb, usable at arm's length with one hand on a coffee — which is the
 * actual posture this app is used in and the one a map of pins is worst at.
 *
 * NEAREST FIRST, and the order is the whole argument. A list in library order is a list
 * about the database; a list in distance order is a list about the walk, and the next
 * item is always the cheapest one to go and get. The count says both where you are in it
 * and how many there are, because "3 of 26" is the difference between browsing and
 * being lost.
 *
 * It WRAPS rather than stopping at the ends. A disabled arrow at each end of a ring of
 * places is an interaction that teaches you to check before you press; wrapping means
 * the right arrow always does something, which is the entire point of it.
 *
 * The card is a button too. Stepping is looking; tapping is choosing, and it opens the
 * echo the same way tapping its pin does.
 */

import { rarityOf, type Echo } from "@echofinders/core";
import { CATEGORY_LABEL } from "./categories";

export interface StepperItem {
  readonly echo: Echo;
  /** How far, or null when there is no position fix to measure from. */
  readonly distanceKm: number | null;
}

export interface StepperProps {
  readonly items: readonly StepperItem[];
  /** Where in the list we are. -1 when nothing is chosen yet. */
  readonly index: number;
  readonly onStep: (index: number) => void;
  readonly onOpen: (echo: Echo) => void;
}

/**
 * How much of the bottom this takes, so the map can keep its pins and its credit out of
 * the way of it.
 *
 * It tracks `--step-h` in `theme.css`, exactly as `GUIDE_H` and `NAV_H` in `RouteMap`
 * track their own elements. Change the card and change both.
 */
export const STEPPER_H = 104;

const RARITY_LABEL: Record<string, string> = { rare: "Rare", singular: "Singular" };

export function Stepper({ items, index, onStep, onOpen }: StepperProps) {
  /*
   * One echo is not a queue. Two arrows that both lead back to where you are standing is
   * furniture, and this screen has enough.
   */
  if (items.length < 2) return null;

  /*
   * Nothing chosen yet shows the nearest, which is what the right arrow would give you
   * anyway. An empty card with two arrows is a control that has to be poked before it
   * says anything.
   */
  const at = index >= 0 ? index : 0;
  const current = items[at];
  if (!current) return null;

  const { echo, distanceKm } = current;
  const rarity = RARITY_LABEL[rarityOf(echo)] ?? "";
  const step = (by: number) => onStep((at + by + items.length) % items.length);

  return (
    <div className="stepper">
      <div className="stepper-row">
        <button
          className="stepper-arrow"
          onClick={() => step(-1)}
          aria-label="The one before this"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14.5 5L8 12l6.5 7" />
          </svg>
        </button>

        <button className="stepper-card" onClick={() => onOpen(echo)}>
          <span className="stepper-kicker mono">
            {rarity && <b>{rarity}</b>}
            <span>{CATEGORY_LABEL[echo.category]}</span>
          </span>
          <span className="stepper-title">{echo.title}</span>
          <span className="stepper-where">
            {echo.point.place}
            {distanceKm !== null && ` · ${away(distanceKm)}`}
          </span>
        </button>

        <button className="stepper-arrow" onClick={() => step(1)} aria-label="The next one">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9.5 5L16 12l-6.5 7" />
          </svg>
        </button>
      </div>
      {/*
        Where you are in it, said as a fact rather than as a progress bar. A bar would
        imply an order worth finishing; this is a ring of places and you can get off it
        at any point.
      */}
      <p className="stepper-count mono" aria-live="polite">
        {at + 1} of {items.length} · nearest first
      </p>
    </div>
  );
}

/**
 * Distance, rounded to what a person can act on.
 *
 * Nobody walks to 347 metres. Under a kilometre it is the nearest ten metres, which is
 * about the accuracy of a phone fix anyway, and above it one decimal. A number with more
 * precision than the measurement behind it is a small lie told every second.
 */
function away(km: number): string {
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`;
  return `${km.toFixed(1)} km`;
}
