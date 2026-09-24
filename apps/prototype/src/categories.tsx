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
  // The design's `culture` is a musical note — music, art, performance. That is our `arts`,
  // and labelling `food-drink` "Culture" was a straight mix-up: it took the note with it,
  // so the chip for restaurants and bars had a quaver on it.
  arts: "Culture",
  kids: "Kids",
  // "Folklore", not "Ghosts". The design's shortlist is written for a flight over America
  // and can afford the narrower, punchier word; ours has to hold a Welsh drowned village
  // and a Hudson Valley headless horseman in the same chip, and only one of those is a
  // ghost story. Folklore is what the category actually is.
  legend: "Folklore",
  people: "People",
  "food-drink": "Food & drink",
  // "Built" is a category key, not a word anybody reads. It means architecture and
  // engineering: why a thing is the shape it is.
  built: "Buildings",
  land: "Landscape",
};

/**
 * Chip order: the ones people reach for first.
 *
 * History, crime, culture, kids, then the rest — the four that anybody arriving cold will
 * recognise as a reason to open the app, in front of the five that reward somebody already
 * looking. The row scrolls, so this is really a decision about what is visible without
 * scrolling, which makes the first four the only ones that matter.
 */
export const CATEGORY_ORDER: readonly EchoCategory[] = [
  "history",
  "true-crime",
  "arts",
  "kids",
  "legend",
  "people",
  "food-drink",
  "built",
  "land",
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
  // The design's `culture` note, on the category that actually means music and art.
  arts: (
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
  // Two figures, because the category is who was here — and a lightning bolt, which is
  // what this had, is the design's glyph for a fun fact.
  people: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.6a3.2 3.2 0 0 1 0 6.1M17.5 14.8a5.5 5.5 0 0 1 3 5.2" />
    </>
  ),
  "food-drink": (
    <>
      <path d="M6 3v7a2.5 2.5 0 0 0 5 0V3M8.5 12.5V21" />
      <path d="M15 21v-7h4a0 0 0 0 0 0 0 5.5 5.5 0 0 0-4-5.3V3" />
    </>
  ),
  // A skyline. The map pin this had is the design's glyph for an attraction, which is a
  // different idea: a place to go, not a thing to look up at.
  built: (
    <>
      <path d="M3 21h18M6 21V9l5-3v15M16 21V12l-5-3" />
      <path d="M8.5 12h.01M8.5 15.5h.01M13 15h.01M13 18h.01" />
    </>
  ),
  land: <path d="M3 20l6-9 4 6 3-4 5 7z" />,
};
