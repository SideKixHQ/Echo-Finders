/**
 * Whether an echo will start talking by itself when you arrive.
 *
 * Extracted so the screen and the engine cannot answer it differently. Walk mode ends with
 * a promise — "it will play by itself when you arrive" — and a promise the engine does not
 * keep is worse than saying nothing. The design board made that promise unconditionally.
 * Auto-play is off by default; it can be narrowed to a chosen few; and an echo with no
 * render cannot play at all however the switches are set. Three ways for the sentence to
 * be a lie, so the sentence asks first.
 */

import { renderFor, type AudioRender, type Echo } from "../types.js";

export interface ArrivalPlayQuestion {
  readonly autoPlay: boolean;
  /**
   * The chosen few, if the listener narrowed it. Undefined means no restriction; an empty
   * list is honoured literally and means "I chose nothing", so nothing plays itself.
   */
  readonly autoPlayOnly?: readonly string[] | undefined;
  readonly echo: Pick<Echo, "id"> & { readonly renders?: readonly AudioRender[] };
  readonly voiceId?: string | undefined;
}

export function willPlayOnArrival(q: ArrivalPlayQuestion): boolean {
  if (!q.autoPlay) return false;
  if (q.autoPlayOnly !== undefined && !q.autoPlayOnly.includes(q.echo.id)) return false;
  return renderFor(q.echo.renders, q.voiceId) !== undefined;
}
