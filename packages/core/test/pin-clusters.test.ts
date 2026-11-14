/**
 * The grouping that makes a pile of pins hittable.
 *
 * The case these exist for is real and measured: on the Manhattan map fifteen pins are
 * drawn within one pixel of each other, and seventeen of the twenty six have a nearest
 * neighbour at a distance of zero. Everything below is about that going right.
 */

import { describe, it, expect } from "vitest";
import { clusterPoints, fanOut, mergeOverlapping, type Placed } from "../src/ranking/pin-clusters.js";

const at = (id: string, x: number, y: number): Placed<string> => ({ item: id, x, y });

describe("clusterPoints", () => {
  it("leaves things that are far apart alone", () => {
    const out = clusterPoints([at("a", 0, 0), at("b", 200, 0), at("c", 0, 200)], 40);
    expect(out).toHaveLength(3);
    expect(out.every((c) => c.members.length === 1)).toBe(true);
  });

  it("collects coincident pins, which is the whole reason it exists", () => {
    const coincident = Array.from({ length: 15 }, (_, i) => at(`m${i}`, 317.7, 143.2));
    const out = clusterPoints(coincident, 40);
    expect(out).toHaveLength(1);
    expect(out[0]!.members).toHaveLength(15);
    expect(out[0]!.x).toBeCloseTo(317.7);
    expect(out[0]!.y).toBeCloseTo(143.2);
  });

  it("does NOT chain along a line, which single link would", () => {
    /*
     * Six pins in a row, each 30 apart, grouping at 40. Single link joins every one of
     * them into a group 150 long, because each is within reach of the next. Greedy
     * cannot: by the third point the centre has moved and the fourth is measured against
     * the centre rather than against its neighbour.
     */
    const row = [0, 30, 60, 90, 120, 150].map((x, i) => at(`r${i}`, x, 0));
    const out = clusterPoints(row, 40);
    expect(out.length).toBeGreaterThan(1);
    const widest = Math.max(
      ...out.map((c) => {
        const xs = c.members.map((m) => m.x);
        return Math.max(...xs) - Math.min(...xs);
      }),
    );
    expect(widest).toBeLessThan(120);
  });

  it("puts the centre at the mean rather than on whichever pin was first", () => {
    const out = clusterPoints([at("a", 0, 0), at("b", 30, 0)], 40);
    expect(out).toHaveLength(1);
    expect(out[0]!.x).toBeCloseTo(15);
  });

  it("is stable for a stable input order", () => {
    const pts = [at("a", 0, 0), at("b", 10, 0), at("c", 100, 0), at("d", 105, 5)];
    const a = clusterPoints(pts, 40);
    const b = clusterPoints(pts, 40);
    expect(a.map((c) => c.members.map((m) => m.item))).toEqual(
      b.map((c) => c.members.map((m) => m.item)),
    );
  });

  it("keeps every member, always", () => {
    const pts = Array.from({ length: 40 }, (_, i) => at(`p${i}`, (i * 7) % 90, (i * 13) % 90));
    const out = clusterPoints(pts, 40);
    expect(out.flatMap((c) => c.members).length).toBe(40);
    expect(new Set(out.flatMap((c) => c.members.map((m) => m.item))).size).toBe(40);
  });

  it("returns nothing for nothing", () => {
    expect(clusterPoints([], 40)).toEqual([]);
  });
});

describe("fanOut", () => {
  it("gives one offset per member", () => {
    for (const n of [1, 2, 5, 9, 15, 26]) expect(fanOut(n, 44)).toHaveLength(n);
  });

  it("never puts two of them closer than a thumb", () => {
    /*
     * The point of the whole exercise. If fanning a group out leaves two of them 20px
     * apart, it has moved the problem rather than solved it.
     */
    for (const n of [2, 3, 5, 8, 9, 12, 15, 26]) {
      const pts = fanOut(n, 44);
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const d = Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y);
          expect(d, `${n} members, ${i} to ${j}`).toBeGreaterThanOrEqual(43.9);
        }
      }
    }
  });

  it("stays small enough to fit a phone", () => {
    // 390 wide, and the fan has to sit inside the map band with room for the pins
    // themselves. Fifteen is the real worst case from the Manhattan library.
    const far = Math.max(...fanOut(15, 44).map((p) => Math.hypot(p.x, p.y)));
    expect(far).toBeLessThan(140);
  });

  it("returns nothing for nothing", () => {
    expect(fanOut(0, 44)).toEqual([]);
  });
});

// James, 2026-11-13: numbered dots that overlap each other merge, with the combined number.
describe("numbered dots that overlap", () => {
  const radius = (n: number) => Math.min(26, 15 + Math.sqrt(n) * 2.4);
  const pile = (id: string, x: number, y: number, n: number) => ({
    x,
    y,
    members: Array.from({ length: n }, (_, i) => ({ item: `${id}${i}`, x, y })),
  });

  it("merge into one, with the combined count, centred on all their members", () => {
    // 45 apart, radius about 25 each: they overlap.
    const out = mergeOverlapping([pile("a", 0, 0, 18), pile("b", 45, 0, 8)], radius);
    expect(out).toHaveLength(1);
    expect(out[0]!.members).toHaveLength(26);
    expect(out[0]!.x).toBeCloseTo((45 * 8) / 26);
  });

  it("leave dots that do not touch alone, and never swallow a single pin", () => {
    const apart = mergeOverlapping([pile("a", 0, 0, 3), pile("b", 60, 0, 3)], radius);
    expect(apart).toHaveLength(2);
    const pin = mergeOverlapping([pile("a", 0, 0, 3), pile("p", 10, 0, 1)], radius);
    expect(pin).toHaveLength(2);
  });

  it("keep going until no two overlap, as a merged dot grows", () => {
    const out = mergeOverlapping([pile("a", 0, 0, 2), pile("b", 40, 0, 2), pile("c", 85, 0, 30)], radius);
    for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i]!;
        const b = out[j]!;
        if (a.members.length < 2 || b.members.length < 2) continue;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(radius(a.members.length) + radius(b.members.length));
      }
    expect(out.reduce((n, c) => n + c.members.length, 0)).toBe(34);
  });
});
