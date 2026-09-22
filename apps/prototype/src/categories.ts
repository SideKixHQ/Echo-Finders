/**
 * Category labels, as a person reads them.
 *
 * Taken from the design prototype's CATS table where the names match — "Ghosts" rather than
 * "legend", "Crime" rather than "true-crime" — because the engine's keys are written for
 * code and these are written for a chip six characters wide.
 */

import type { EchoCategory } from "@echofinders/core";

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

/** Chip order: the ones people actually filter on first. */
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
