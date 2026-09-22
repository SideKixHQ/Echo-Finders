/**
 * What is coming up, offered rather than played.
 *
 * The scheduler already knows: `buildPlaylist` lays out a whole journey's worth of echoes
 * against the route's distance–time curve. What it produces is a *timeline*, which is the
 * right answer for a question nobody asked — "play me this journey" — and the wrong shape
 * for the question people actually have, which is "what is worth listening to next".
 *
 * The difference matters most in the air, where it is the only thing a listener can act on.
 * Walking or driving you can go to an echo; at 35,000 feet the route is fixed and the whole
 * interaction is choosing what to hear before it goes past. A suggestion is the feature.
 *
 * What this deliberately does not do is start anything. Finding an echo collects it;
 * hearing it is a decision, and one taken by somebody who may be mid-conversation, asleep,
 * or listening to something else. So this returns a list to offer, and the listener presses
 * play — with `PrivacySettings.handsFree` the one way to ask for anything different.
 */

import type { Echo, ListenerProfile, Route, ScheduledEcho } from "../types.js";
import { buildRouteGeometry } from "../geo/corridor.js";
import { RouteProfile } from "../route/profile.js";
import { buildPlaylist, type PlaylistOptions } from "./playlist.js";

export interface Upcoming {
  readonly echo: Echo;
  /** How far along the route it is reached, km. */
  readonly atKm: number;
  /** Seconds from now until the listener reaches it, at the route's own pace. */
  readonly inS: number;
  /** Where it was going to play in the journey's timeline. */
  readonly scheduled: ScheduledEcho;
}

export interface UpcomingOptions extends PlaylistOptions {
  /** How many to offer. Short: a suggestion, not a table of contents. */
  readonly limit?: number;
  /**
   * Ignore anything the listener is effectively already at.
   *
   * Without it the first suggestion is usually the echo whose pin is glowing under their
   * thumb, which tells them nothing they cannot see.
   */
  readonly minLeadS?: number;
}

const DEFAULTS = { limit: 3, minLeadS: 30 } as const;

/**
 * The next few echoes on this route, from where the listener has got to.
 *
 * `alongKm` is distance rather than elapsed time on purpose: a journey that started late,
 * paused, or is simply running behind still knows perfectly well where it is, and asking
 * the clock would suggest things already passed.
 */
export function upcomingOnRoute(
  route: Route,
  library: readonly Echo[],
  listener: ListenerProfile,
  alongKm: number,
  options: UpcomingOptions = {},
): readonly Upcoming[] {
  const { limit = DEFAULTS.limit, minLeadS = DEFAULTS.minLeadS, ...playlistOptions } = options;

  const geometry = buildRouteGeometry(route);
  const profile = RouteProfile.forRoute(route, geometry);
  const nowS = profile.timeAtDistance(Math.max(0, Math.min(alongKm, geometry.totalKm)));

  const { items } = buildPlaylist(route, library, listener, playlistOptions);

  const ahead: Upcoming[] = [];
  for (const scheduled of items) {
    // Measured from where the echo *is*, not from where the playlist decided to start it.
    // A long feature is anchored well before the place it describes, and offering it by its
    // start time would say "in one minute" about something two minutes' travel away.
    const inS = scheduled.nearestS - nowS;
    if (inS < minLeadS) continue;
    ahead.push({
      echo: scheduled.echo,
      atKm: profile.distanceAtTime(scheduled.nearestS),
      inS,
      scheduled,
    });
    if (ahead.length >= limit) break;
  }

  return ahead;
}
