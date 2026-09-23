/**
 * How you are moving, drawn once.
 *
 * These live apart from both the rail and the map because they now mean the same thing in
 * two places, and a walking figure that is a person on one screen and a slightly different
 * person on another is the kind of drift nobody reports and everybody feels.
 *
 * The map's own marker is the strongest argument for having them at all. A dot says *you
 * are here*, which the map already implies; the figure says *you are here, on foot*, and on
 * a product whose whole shape changes between walking and flying — corridor width, timing
 * tolerance, whether guidance is offered at all — that is worth a glance rather than a
 * label.
 */

import type { TravelMode } from "@echofinders/core";
import type { ReactNode } from "react";

export const MODE_LABEL: Record<TravelMode, string> = {
  walking: "Walk",
  driving: "Drive",
  flight: "Fly",
  rail: "Train",
  cycling: "Cycle",
};

/** What the narrator would call it: "you are walking", "in the air". */
export const MODE_PHRASE: Record<TravelMode, string> = {
  walking: "walking",
  driving: "driving",
  flight: "in the air",
  rail: "on the train",
  cycling: "cycling",
};

/**
 * Stroked outlines, sized to a 24 box.
 *
 * Stroked rather than filled so they read at 16px on a rail button and at 14px inside the
 * map's marker without a second drawing — a filled glyph at that size becomes a blob, and
 * the one place these must stay legible is the smallest.
 */
export const MODE_ICON: Record<TravelMode, ReactNode> = {
  walking: (
    <>
      <circle cx="13" cy="4" r="2" />
      <path d="M12.5 22l-1-6-3-3 1.5-5 3 1.5 2.5 2.5M9.5 8L7 10.5M11.5 16l-3 6" />
    </>
  ),
  driving: (
    <>
      <path d="M4 16v-3.5L6 7h12l2 5.5V16M4 16h16M4 16v2.5M20 16v2.5" />
      <circle cx="7.5" cy="16" r="1.6" />
      <circle cx="16.5" cy="16" r="1.6" />
    </>
  ),
  flight: (
    <path d="M21 15.5l-8.5-2.5V6.2a1.7 1.7 0 0 0-3.4 0V13L3 15.5V17l6.1-1.6v3.4L7 20.4V22l3.8-1 3.8 1v-1.6l-2.1-1.6v-3.4L21 17z" />
  ),
  rail: (
    <>
      <rect x="6" y="3.5" width="12" height="13" rx="3" />
      <path d="M6 10h12M8.5 20L7 22M15.5 20l1.5 2" />
      <circle cx="9" cy="13.5" r="1" />
      <circle cx="15" cy="13.5" r="1" />
    </>
  ),
  cycling: (
    <>
      <circle cx="5.5" cy="17.5" r="3.5" />
      <circle cx="18.5" cy="17.5" r="3.5" />
      <circle cx="14" cy="4.5" r="1.8" />
      <path d="M5.5 17.5L9 10l4 3 1.5 4.5M9 10h4.5" />
    </>
  ),
};
