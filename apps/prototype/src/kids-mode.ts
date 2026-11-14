/**
 * Kids mode, as a rule the map, the panel and the engine's profile all read. Pure, so it is
 * tested on its own (`test/app/kids-mode.test.ts`).
 */

import type { EchoCategory } from "@echofinders/core";

/**
 * Kids mode is the Kids topic only (James, 2026-11-13, "A now, B over time";
 * docs/adr/0021-topics-and-rare.md). It was an age alone, which let 822 of 981 echoes
 * through, ghosts, battles, disasters and scandals among them.
 * Now a kids listener is offered, shown and played only these categories (`listenerFor`
 * for the engine's gate, `kidsMay` for the map), and the age is still checked as well.
 *
 * B OVER TIME: an echo from another topic that an editor has written for every age (a
 * future per echo all-ages mark, not built) would be let through here too. When it exists,
 * `kidsMay` is the one place that reads it, and `listenerFor` the one profile to widen.
 */
export const KIDS_CATEGORIES: readonly EchoCategory[] = ["kids"];

/** The age kids mode claims. Under every `minAge` the library sets above zero. */
export const KIDS_AGE = 8;

/** Whether the topic is one kids mode offers. */
export const kidsMay = (echo: { readonly category: EchoCategory }): boolean => KIDS_CATEGORIES.includes(echo.category);

/**
 * Whether a kids listener may see and hear this echo: the engine's own rule (`listenerFor`),
 * the Kids topic and the age. The map, search, My echoes and a play from a card all ask it.
 */
export const kidsMayHear = (echo: { readonly category: EchoCategory; readonly minAge: number }): boolean =>
  kidsMay(echo) && echo.minAge <= KIDS_AGE;

/**
 * Turning kids mode on drops every picked topic it does not offer, True crime among them
 * (James, 2026-11-13). If nothing picked is left, that is All, as if All had been tapped.
 */
export function keepForKids(current: ReadonlySet<EchoCategory> | null): ReadonlySet<EchoCategory> | null {
  if (!current) return null;
  const next = new Set([...current].filter((c) => KIDS_CATEGORIES.includes(c)));
  return next.size === 0 ? null : next;
}
