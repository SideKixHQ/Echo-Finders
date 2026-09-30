/**
 * Pins that land on top of each other, grouped so a thumb can tell them apart.
 *
 * WHAT THIS IS FIXING, measured rather than guessed. On the Manhattan map, twenty six pins
 * are drawn and **fifteen of them are at the same point**: every echo in lower Manhattan
 * lands within one pixel of (317.7, 143.2), because the view after picking a city is wide
 * enough to hold Miami. Seventeen of the twenty six have a nearest neighbour at a distance
 * of zero, and zooming in twice does not change that — coincident points stay coincident
 * under any scaling. Whatever is on top wins every tap and the other fourteen stories are
 * unreachable.
 *
 * Note that this is NOT the same job as `clusterEchoes` next door, which groups by real
 * distance on the ground so the city screen can say "Manhattan, 15". This one groups by
 * how far apart things ended up ON THE GLASS, which changes every time somebody zooms.
 * Two echoes a hundred metres apart are one dot at city scale and two pins in a street.
 *
 * GREEDY, NOT SINGLE LINK, and that is the one real decision here. `clusterEchoes` uses
 * single link because echoes come in chains along streets and a chain is exactly what it
 * wants to follow. Here a chain is the failure: a row of pins each forty pixels from the
 * next would collapse into one dot the length of a street, even though every one of them
 * is perfectly hittable. Greedy assignment to the nearest existing centre cannot chain,
 * because the test is always against a centre rather than against any member.
 *
 * It takes plain numbers rather than pixels in its types, because it is geometry. Nothing
 * in here knows what a screen is.
 */

/** A thing, and where it ended up. */
export interface Placed<T> {
  readonly item: T;
  readonly x: number;
  readonly y: number;
}

export interface PointCluster<T> {
  /** The middle of it. What gets drawn when the group is closed. */
  readonly x: number;
  readonly y: number;
  readonly members: readonly Placed<T>[];
}

/**
 * Group anything that landed within `within` of a group's centre.
 *
 * Order dependent, deliberately and harmlessly: the first point seeds the first group, and
 * a stable input order gives a stable grouping. Callers pass the library, which does not
 * reshuffle, so the same pins group the same way on every frame and nothing flickers as
 * the map moves.
 *
 * O(n * groups). The library is measured in hundreds and this runs once per render of a
 * map that is already drawing every one of them.
 */
export function clusterPoints<T>(
  points: readonly Placed<T>[],
  within: number,
): PointCluster<T>[] {
  const out: { x: number; y: number; members: Placed<T>[] }[] = [];
  for (const p of points) {
    let best: (typeof out)[number] | null = null;
    let bestD = within;
    for (const c of out) {
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d <= bestD) {
        best = c;
        bestD = d;
      }
    }
    if (!best) {
      out.push({ x: p.x, y: p.y, members: [p] });
      continue;
    }
    /*
     * The centre moves to the mean as members join, which keeps a group honest about
     * where it is. Running mean rather than a second pass: a group of fifteen coincident
     * pins has a centre on top of them, and a group of three spread over thirty pixels
     * sits between them rather than on whichever one happened to be first.
     */
    best.x = (best.x * best.members.length + p.x) / (best.members.length + 1);
    best.y = (best.y * best.members.length + p.y) / (best.members.length + 1);
    best.members.push(p);
  }
  return out.map((c) => ({ x: c.x, y: c.y, members: c.members }));
}

/**
 * Where to put the members of a group when it is opened, as offsets from its centre.
 *
 * Concentric rings rather than one circle, because one circle of fifteen at a hittable
 * spacing has a radius of a hundred and five pixels, which is most of the width of a
 * phone. Rings are spaced exactly `gap` apart radially, so the worst case — a point on
 * the outer ring sitting directly outside one on the inner — is still `gap` from its
 * neighbour. Every ring is filled to the most it can hold at that spacing before the next
 * one starts.
 *
 * Odd rings get a half step of rotation so the spokes do not line up into a grid, which
 * reads as a snowflake rather than as a group of things.
 *
 * The first ring starts at 0.85 of a gap rather than at a full one. Two pins fanning out
 * want to look like they came from the same place; pushing them a whole thumb apart
 * immediately reads as two unrelated pins that happened to appear.
 */
export function fanOut(n: number, gap: number): { readonly x: number; readonly y: number }[] {
  const out: { x: number; y: number }[] = [];
  if (n <= 0) return out;
  let ring = 1;
  while (out.length < n) {
    const r = gap * (0.85 + (ring - 1));
    const capacity = Math.max(1, Math.floor((2 * Math.PI * r) / gap));
    const take = Math.min(capacity, n - out.length);
    // Start at the top and go clockwise, so the order on screen matches the order in a
    // list somebody might be reading beside it.
    const offset = ring % 2 === 0 ? Math.PI / take : 0;
    for (let i = 0; i < take; i++) {
      const a = (i / take) * 2 * Math.PI - Math.PI / 2 + offset;
      out.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
    ring++;
  }
  return out;
}
