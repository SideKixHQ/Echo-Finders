/**
 * The saved list My Echoes shows: every saved echo, nearest first.
 *
 * It was the saved echoes on the current journey only. Save is on every card and every
 * search result, so an echo saved in Boston while walking in Wilmington was on no journey,
 * and My Echoes said "Nothing synced yet" while the card said Saved.
 */

import { distanceKm, type Echo, type LatLng } from "@echofinders/core";

export function savedList(
  ids: Iterable<string>,
  byId: ReadonlyMap<string, Echo>,
  from: LatLng | null | undefined,
): readonly Echo[] {
  return [...ids]
    .flatMap((id) => byId.get(id) ?? [])
    .map((echo) => ({ echo, km: from ? distanceKm(from, echo.point.at) : 0 }))
    .sort((a, b) => a.km - b.km)
    .map((s) => s.echo);
}
