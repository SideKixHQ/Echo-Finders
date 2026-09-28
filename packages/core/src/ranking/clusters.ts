/**
 * Where the echoes actually are, grouped.
 *
 * The city view needs to answer "where are they then" at a scale where individual pins are
 * meaningless: a hundred pins in lower Manhattan is one fact, not a hundred, and drawn as
 * a hundred it is a knot.
 *
 * SINGLE LINK, not k-means or a fixed grid, and the reason is the shape of the data rather
 * than a preference. Echoes sit in streets, so they come in chains: a walking route is a
 * line of them a hundred metres apart, and any method that wants round clusters will cut
 * it in half somewhere arbitrary. Single link joins anything within reach of anything else
 * in the group, which follows a street the way the content does. It also needs no guess
 * at how many groups there are, which is the number nobody can know in advance.
 *
 * The cost is the classic one: two groups joined by a single stray echo become one group.
 * That is the right failure here. A stray echo between two neighbourhoods really does mean
 * you can walk from one to the other, which is the question this screen is answering.
 *
 * O(n squared) in the number of echoes, deliberately. The alternative is a spatial index
 * and this runs over a library measured in hundreds, once, when a screen opens. When the
 * library is large enough for that to hurt, the fix is to cluster server side rather than
 * to make this cleverer.
 */

import { distanceKm } from "../geo/great-circle.js";
import { rarityOf } from "../capture/rarity.js";
import type { Echo, LatLng } from "../types.js";

export interface EchoCluster {
  /** Where this is, in the words the content itself uses. */
  readonly label: string;
  /** The middle of it, which is what a map centres and labels. */
  readonly at: LatLng;
  readonly echoes: readonly Echo[];
  /** How many are the rarest kind, because that is what decides whether to go. */
  readonly singular: number;
  /** Radius from the centre that holds every member, km. Zero for a single echo. */
  readonly spreadKm: number;
}

export function clusterEchoes(echoes: readonly Echo[], joinKm: number): EchoCluster[] {
  if (echoes.length === 0) return [];

  // Union-find over every pair within reach. Single link falls out of the transitivity.
  const parent = echoes.map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r]!;
    while (parent[i] !== r) {
      const next = parent[i]!;
      parent[i] = r;
      i = next;
    }
    return r;
  };
  for (let i = 0; i < echoes.length; i++) {
    for (let j = i + 1; j < echoes.length; j++) {
      if (distanceKm(echoes[i]!.point.at, echoes[j]!.point.at) <= joinKm) {
        const a = find(i);
        const b = find(j);
        if (a !== b) parent[a] = b;
      }
    }
  }

  const groups = new Map<number, Echo[]>();
  for (let i = 0; i < echoes.length; i++) {
    const root = find(i);
    const g = groups.get(root);
    if (g) g.push(echoes[i]!);
    else groups.set(root, [echoes[i]!]);
  }

  const out = [...groups.values()].map(build);
  /*
   * Biggest first, then alphabetical. Deterministic because a screen that reorders its own
   * list between renders for no reason is a screen nobody trusts, and because the tests
   * would otherwise be asserting on `Map` iteration order.
   */
  out.sort((a, b) => b.echoes.length - a.echoes.length || a.label.localeCompare(b.label));
  return out;
}

function build(members: readonly Echo[]): EchoCluster {
  const at = centroid(members.map((e) => e.point.at));
  return {
    label: nameFor(members),
    at,
    echoes: members,
    singular: members.filter((e) => rarityOf(e) === "singular").length,
    spreadKm: members.reduce((far, e) => Math.max(far, distanceKm(at, e.point.at)), 0),
  };
}

/**
 * The mean, which is close enough and is not the same as the centre of the bounding box.
 *
 * A mean sits where the echoes are, and a box centre sits between them — which for an
 * L-shaped neighbourhood puts the label in the park nobody wrote about. Longitude is
 * averaged plainly, which is wrong across the antimeridian and right everywhere a walking
 * tour will ever be; a cluster that straddles it is not a cluster.
 */
function centroid(points: readonly LatLng[]): LatLng {
  let lat = 0;
  let lng = 0;
  for (const p of points) {
    lat += p.lat;
    lng += p.lng;
  }
  return { lat: lat / points.length, lng: lng / points.length };
}

/**
 * What to call it, taken from the content rather than invented.
 *
 * `place` reads "Castle Clinton, Battery Park, Manhattan" — specific first, general last —
 * so the last part is the name of the area and the most common one across a group is what
 * a person would call the group. No gazetteer, no geocoder, and nothing made up: if every
 * echo in a cluster says Manhattan, the cluster is Manhattan.
 *
 * Ties go alphabetically, so the label is stable rather than dependent on input order.
 */
function nameFor(members: readonly Echo[]): string {
  const tally = new Map<string, number>();
  for (const e of members) {
    const parts = e.point.place.split(",").map((p) => p.trim()).filter(Boolean);
    const area = parts[parts.length - 1];
    if (area) tally.set(area, (tally.get(area) ?? 0) + 1);
  }
  let best = "";
  let most = 0;
  for (const [area, n] of [...tally.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (n > most) {
      most = n;
      best = area;
    }
  }
  return best || "Somewhere";
}
