import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeStreets, distanceKm, walkingRoute, type StreetFile } from "../src/index.js";

/*
 * A small grid of streets, 0.001 degrees apart (about 111 m north-south and 92 m east-west
 * at this latitude), with one block's east side missing so the shortest way round is known.
 *
 *   (0,2)──(1,2)──(2,2)
 *     │      │      │
 *   (0,1)──(1,1)  (2,1)
 *     │      │      │
 *   (0,0)──(1,0)──(2,0)
 *
 * (1,1)–(2,1) is not a street: a building.
 */
const LAT0 = 34.23;
const LNG0 = -77.95;
const STEP = 0.001;
const at = (x: number, y: number) => ({ lng: LNG0 + x * STEP, lat: LAT0 + y * STEP });
const id = (x: number, y: number) => y * 3 + x;

function grid(): StreetFile {
  const nodes: number[] = [];
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
    const p = at(x, y);
    nodes.push(Math.round(p.lng * 1e6), Math.round(p.lat * 1e6));
  }
  const edges: [number, number][] = [
    [id(0, 0), id(1, 0)], [id(1, 0), id(2, 0)],
    [id(0, 1), id(1, 1)],
    [id(0, 2), id(1, 2)], [id(1, 2), id(2, 2)],
    [id(0, 0), id(0, 1)], [id(0, 1), id(0, 2)],
    [id(1, 0), id(1, 1)], [id(1, 1), id(1, 2)],
    [id(2, 0), id(2, 1)], [id(2, 1), id(2, 2)],
  ];
  const names = ["", "Front Street", "Market Street", "Second Street"];
  return {
    v: 1,
    area: "test",
    bbox: [LNG0 - 0.01, LAT0 - 0.01, LNG0 + 0.01, LAT0 + 0.01],
    names,
    nodes,
    edges: edges.map(([a, b]) => {
      const pa = { lng: nodes[a * 2]! / 1e6, lat: nodes[a * 2 + 1]! / 1e6 };
      const pb = { lng: nodes[b * 2]! / 1e6, lat: nodes[b * 2 + 1]! / 1e6 };
      const horizontal = Math.abs(pa.lat - pb.lat) < 1e-9;
      return [a, b, distanceKm(pa, pb) * 1000, horizontal ? 2 : a % 3 === 0 ? 1 : 3, "residential", []] as const;
    }),
  };
}

describe("walking directions", () => {
  const g = decodeStreets(grid());

  it("goes round the block rather than through it", () => {
    // From the middle of the grid to the east side of it: (1,1) to (2,1) has no street.
    const route = walkingRoute(g, at(1, 1), at(2, 1))!;
    expect(route).not.toBeNull();
    const straight = distanceKm(at(1, 1), at(2, 1)) * 1000;
    // Down a block, across, up a block: about 111 + 92 + 111 m, never the 92 m straight line.
    expect(route.metres).toBeGreaterThan(straight * 2.5);
    expect(route.metres).toBeLessThan(straight * 4);
    expect(route.seconds).toBeCloseTo(route.metres / 1.25, 0);
  });

  it("starts and ends exactly where it was asked, joined to the nearest street", () => {
    const from = { lng: LNG0 + 0.0002, lat: LAT0 + 0.00005 };
    const to = { lng: LNG0 + 0.0019, lat: LAT0 + 0.002 };
    const route = walkingRoute(g, from, to)!;
    expect(route.line[0]).toEqual(from);
    expect(route.line[route.line.length - 1]).toEqual(to);
  });

  it("walks straight along one street when both ends are on it", () => {
    const route = walkingRoute(g, { lng: LNG0 + 0.0001, lat: LAT0 }, { lng: LNG0 + 0.0008, lat: LAT0 })!;
    expect(route.turns).toHaveLength(0);
    expect(route.metres).toBeCloseTo(distanceKm(at(0.1, 0), at(0.8, 0)) * 1000, 0);
    expect(route.startOn).toBe("Market Street");
  });

  it("says the turns, which way, and onto what", () => {
    // Along the bottom then up the east side: one left turn.
    const route = walkingRoute(g, at(0.2, 0), at(2, 1.5))!;
    expect(route.turns).toHaveLength(1);
    expect(route.turns[0]!.direction).toBe("left");
    expect(route.turns[0]!.fromStartM).toBeGreaterThan(150);
  });

  it("gives up rather than inventing a path off the network", () => {
    expect(walkingRoute(g, at(1, 1), { lng: LNG0 + 0.05, lat: LAT0 })).toBeNull();
  });
});

describe("walking directions on a real street file", () => {
  // Downtown Wilmington, as built by scripts/build-streets.py from Overture.
  const file = JSON.parse(
    readFileSync(new URL("../../../apps/prototype/public/streets/the-lady-in-grey.json", import.meta.url), "utf8"),
  ) as StreetFile;
  const g = decodeStreets(file);

  it("finds a sensible walk between two echoes across downtown", () => {
    // Market Street at Front, to the courthouse at Third and Princess.
    const from = { lat: 34.2357, lng: -77.9478 };
    const to = { lat: 34.2369, lng: -77.9446 };
    const started = performance.now();
    const route = walkingRoute(g, from, to)!;
    const took = performance.now() - started;
    expect(route).not.toBeNull();
    const straight = distanceKm(from, to) * 1000;
    // City blocks: longer than the crow flies, but not a detour round the town.
    expect(route.metres).toBeGreaterThan(straight);
    expect(route.metres).toBeLessThan(straight * 1.6);
    // Fast enough to rerun on every GPS fix.
    expect(took).toBeLessThan(150);
  });
});
