/**
 * What each category is called, what colour it is, and what it looks like.
 *
 * All three come from the design prototype's CATS table rather than being invented here,
 * so a dot on a chip, a pin on the map and a tag on a card all agree. Where my category
 * keys differ from the design's the mapping is deliberate and noted — "Ghosts" reads better
 * on a six-character chip than "legend", and the engine's keys are written for code.
 *
 * The two colours per category are not a nicety. On a white map at midday a #9B95FF dot is
 * invisible, and on a near-black one #4C43C8 is a smudge — the design carries `lc` for
 * exactly this, and dropping it would make light mode unusable rather than merely paler.
 */

import type { EchoCategory } from "@echofinders/core";
import type { ReactNode } from "react";

export const CATEGORY_LABEL: Record<EchoCategory, string> = {
  history: "History",
  "true-crime": "Crime",
  people: "People",
  built: "Built",
  land: "Land",
  "food-drink": "Culture",
  arts: "Arts",
  legend: "Ghosts",
  kids: "Kids",
};

/** Chip order: the ones people reach for first. */
export const CATEGORY_ORDER: readonly EchoCategory[] = [
  "history",
  "food-drink",
  "legend",
  "true-crime",
  "people",
  "built",
  "land",
  "arts",
  "kids",
];

/**
 * The glyph inside a map pin, drawn at 24×24 with a 1.8 stroke.
 *
 * A pin needs to say what *kind* of thing is there before anybody taps it, and at 26px a
 * colour alone cannot carry nine categories — anybody who does not already know the key is
 * looking at coloured dots. The icon is what makes the colour legible.
 */
export const CATEGORY_ICON: Record<EchoCategory, ReactNode> = {
  history: <path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6" />,
  "food-drink": (
    <>
      <path d="M9 18V6l10-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </>
  ),
  legend: (
    <>
      <path d="M6 21V10a6 6 0 0 1 12 0v11l-3-2-3 2-3-2-3 2z" />
      <path d="M10 10h.01M14 10h.01" />
    </>
  ),
  "true-crime": (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4.5-4.5" />
    </>
  ),
  kids: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M9 10h.01M15 10h.01M8.5 14a5 5 0 0 0 7 0" />
    </>
  ),
  people: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />,
  arts: (
    <>
      <path d="M2 17V8M2 12h13a5 5 0 0 1 5 5v0M22 17H2" />
      <circle cx="7" cy="10" r="1.6" />
    </>
  ),
  built: (
    <>
      <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.4" />
    </>
  ),
  land: <path d="M3 20l6-9 4 6 3-4 5 7z" />,
};
