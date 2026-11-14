/**
 * What each topic is called, what colour it is, and what it looks like.
 *
 * All three come from the approved canvas (board "The 16 topics", 2026-11-12) rather than
 * being invented here, so a dot on a chip, a pin on the map and a tag on a card all agree.
 * The engine's keys are written for code; the labels are the canvas's words.
 *
 * The two colours per category are not a nicety. On a white map at midday a #9B95FF dot is
 * invisible, and on a near-black one #4C43C8 is a smudge — the design carries `lc` for
 * exactly this, and dropping it would make light mode unusable rather than merely paler.
 */

import type { EchoCategory } from "@echofinders/core";
import type { ReactNode } from "react";
import { KIDS_CATEGORIES } from "./kids-mode";

export const CATEGORY_LABEL: Record<EchoCategory, string> = {
  history: "History",
  military: "Military",
  "true-crime": "True crime",
  scandals: "Scandals",
  // "Ghosts & legends" since the 16 topics (2026-11-12): the two-column panel has the room
  // the old six-character chip did not, and the category holds tall tales as well as ghosts.
  legend: "Ghosts & legends",
  unsolved: "Unsolved",
  disasters: "Disasters",
  hidden: "Hidden",
  arts: "Arts",
  "pop-culture": "Pop culture",
  sports: "Sports",
  "food-drink": "Food & drink",
  business: "Business",
  wonders: "Wonders",
  kids: "Kids",
};

/**
 * What the filter panel offers, and which engine categories each chip stands for.
 *
 * One chip per topic since 2026-11-12 (docs/adr/0021-topics-and-rare.md): the Landmarks
 * chip that stood for `built` and `land` went with them, and the shape stays so a chip
 * could stand for more than one key again. Rare is not here: it filters on rarity, not on
 * topic, and the panel places it itself (`KindGrid`).
 */
export interface ChipGroup {
  readonly id: string;
  readonly label: string;
  /** Whose colour and glyph the chip wears. */
  readonly face: EchoCategory;
  readonly categories: readonly EchoCategory[];
}

const chip = (key: EchoCategory): ChipGroup => ({
  id: key,
  label: CATEGORY_LABEL[key],
  face: key,
  categories: [key],
});

/**
 * Panel order, as on the approved canvas: the four that anybody arriving cold reaches for,
 * then Rare (placed by `KindGrid` after `RARE_AFTER`), then the rest.
 */
export const CHIP_GROUPS: readonly ChipGroup[] = (
  [
    "legend",
    "true-crime",
    "history",
    "wonders",
    "military",
    "scandals",
    "unsolved",
    "disasters",
    "hidden",
    "arts",
    "pop-culture",
    "sports",
    "food-drink",
    "business",
    "kids",
  ] as const
).map(chip);

/** The Rare chip sits after this many topic chips, as on the canvas. */
export const RARE_AFTER = 4;

/** Every topic, in the engine's order: lists and keys that are not the panel. */
export const CATEGORY_ORDER: readonly EchoCategory[] = [
  "history",
  "military",
  "true-crime",
  "scandals",
  "legend",
  "unsolved",
  "disasters",
  "hidden",
  "arts",
  "pop-culture",
  "sports",
  "food-drink",
  "business",
  "wonders",
  "kids",
];

/**
 * The glyph inside a map pin and on a chip, drawn at 24x24 with a 1.8 stroke, as on the
 * approved canvas (board "The 16 topics").
 *
 * A pin needs to say what *kind* of thing is there before anybody taps it, and at 26px a
 * colour alone cannot carry fifteen topics. The icon is what makes the colour legible.
 */
export const CATEGORY_ICON: Record<EchoCategory, ReactNode> = {
  /*
   * An hourglass, not a house: it says "time past", is nothing like a building, and
   * survives 13px on a chip.
   */
  history: (
    <>
      <path d="M7 3h10M7 21h10" />
      <path d="M6.5 3.5h11l-5.5 8.5zM6.5 20.5h11l-5.5-8.5z" />
    </>
  ),
  military: <path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z" />,
  "true-crime": (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4.5-4.5" />
    </>
  ),
  scandals: (
    <>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  legend: (
    <>
      <path d="M6 20V10a6 6 0 0 1 12 0v10l-2-1.5L14 20l-2-1.5L10 20l-2-1.5z" />
      <path d="M10 10h.01M14 10h.01" />
    </>
  ),
  unsolved: (
    <>
      <path d="M9 9a3 3 0 1 1 4.2 2.75c-.75.35-1.2 1.1-1.2 1.95V15" />
      <path d="M12 19h.01" />
    </>
  ),
  disasters: (
    <path d="M12 3c.5 3 4.5 5 4.5 10a4.5 4.5 0 0 1-9 0c0-2.5 1.5-3.5 2-6 1.5 1 2 2.5 2 3.5 1-1.5 1-4 .5-7.5z" />
  ),
  hidden: (
    <>
      <circle cx="12" cy="9" r="3.5" />
      <path d="M10.6 12.2L9 20h6l-1.6-7.8" />
    </>
  ),
  /* A palette: painting, theatre, writing and, since 2026-11-12, music. */
  arts: (
    <path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-.9 2-1.9 0-1.2-1-1.6-1-2.6 0-1 .8-1.5 1.8-1.5H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z" />
  ),
  "pop-culture": (
    <>
      <rect x="3" y="8" width="18" height="13" rx="2" />
      <path d="M3 8l2-4h14l2 4M8 4l2 4M13 4l2 4" />
    </>
  ),
  sports: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6c3 3 3 9.8 0 12.8M18.4 5.6c-3 3-3 9.8 0 12.8" />
    </>
  ),
  "food-drink": (
    <>
      <path d="M6 3v7a2.5 2.5 0 0 0 5 0V3M8.5 12.5V21" />
      <path d="M15 21v-7h4a5.5 5.5 0 0 0-4-5.3V3" />
    </>
  ),
  business: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V4h6v3M3 13h18" />
    </>
  ),
  /* The column Landmarks had: "a place worth going to look at", built or grown. */
  wonders: <path d="M4 21h16M6 21V8M10 21V8M14 21V8M18 21V8M4 8h16l-8-5z" />,
  kids: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M9 10h.01M15 10h.01M8.5 14a5 5 0 0 0 7 0" />
    </>
  ),
};

/** The Rare chip's gem, from the same canvas. */
export const RARE_ICON: ReactNode = (
  <>
    <path d="M6 3h12l3 6-9 12L3 9z" />
    <path d="M3 9h18M9 3l3 18 3-18" />
  </>
);

/** Every category: the filter's "everything", on the map and on My Echoes alike. */
export const ALL_CATEGORIES: ReadonlySet<EchoCategory> = new Set(CATEGORY_ORDER);

/** The panel's topics in kids mode: Kids only (the panel adds All, and Rare when there are rare ones). */
export const KIDS_CHIP_GROUPS: readonly ChipGroup[] = CHIP_GROUPS.filter((g) => g.categories.every((c) => KIDS_CATEGORIES.includes(c)));

/**
 * What a tap on a category chip selects next. One rule, used by the map and by My Echoes,
 * so the two filters can never behave differently.
 *
 * TAPPING A KIND SHOWS THAT KIND, the way every map's filter chips work. With nothing
 * filtered every chip is on, so the first tap narrows to that kind alone (it used to hide
 * it: "everything is selected, then I select something and it unselects"). After that,
 * taps add and remove; removing the last kind, or adding the last one back, returns to
 * everything (null) rather than to nothing.
 */
export function toggleCategories(
  current: ReadonlySet<EchoCategory> | null,
  group: ChipGroup,
): ReadonlySet<EchoCategory> | null {
  const all = !current || current.size >= ALL_CATEGORIES.size;
  if (all) return new Set(group.categories);
  const next = new Set(current);
  const lit = group.categories.some((c) => next.has(c));
  if (lit) for (const c of group.categories) next.delete(c);
  else for (const c of group.categories) next.add(c);
  if (next.size === 0 || next.size >= ALL_CATEGORIES.size) return null;
  return next;
}
