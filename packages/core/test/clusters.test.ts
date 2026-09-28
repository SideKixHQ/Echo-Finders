import { describe, expect, it } from "vitest";
import { clusterEchoes } from "../src/index.js";
import { makeEcho } from "./fixtures.js";

const at = (lat: number, lng: number) => ({ lat, lng });
/** Roughly a kilometre of latitude, so distances in these tests are readable. */
const km = (n: number) => n / 111.195;

const echo = (id: string, lat: number, lng: number, place: string) =>
  makeEcho({ id, at: at(lat, lng), place });

describe("clustering echoes", () => {
  it("has nothing to say about nothing", () => {
    expect(clusterEchoes([], 1)).toEqual([]);
  });

  it("puts a lone echo in a cluster of its own with no spread", () => {
    const [c] = clusterEchoes([echo("a", 40, -74, "Pearl Street, Manhattan")], 1);
    expect(c?.echoes).toHaveLength(1);
    expect(c?.spreadKm).toBe(0);
    expect(c?.label).toBe("Manhattan");
  });

  it("joins what is within reach and separates what is not", () => {
    const near = [
      echo("a", 40, -74, "One, Manhattan"),
      echo("b", 40 + km(0.4), -74, "Two, Manhattan"),
      echo("c", 40 + km(0.8), -74, "Three, Manhattan"),
    ];
    const far = [echo("z", 41, -74, "Elsewhere, Albany")];
    const out = clusterEchoes([...near, ...far], 0.5);
    expect(out).toHaveLength(2);
    expect(out[0]?.echoes.map((e) => e.id).sort()).toEqual(["a", "b", "c"]);
    expect(out[1]?.echoes.map((e) => e.id)).toEqual(["z"]);
  });

  /*
   * The property single link is chosen for. Echoes sit along streets, so they come in
   * chains: a walking route is a line of them a hundred metres apart, and any method that
   * wants round clusters cuts it somewhere arbitrary.
   */
  it("follows a chain further than the join distance", () => {
    const chain = Array.from({ length: 8 }, (_, i) =>
      echo(`c${i}`, 40 + km(i * 0.3), -74, "Street, Manhattan"),
    );
    const out = clusterEchoes(chain, 0.35);
    expect(out).toHaveLength(1);
    expect(out[0]?.spreadKm).toBeGreaterThan(0.35);
  });

  it("names a cluster after the area its content names most often", () => {
    const out = clusterEchoes(
      [
        echo("a", 40, -74, "Castle Clinton, Battery Park, Manhattan"),
        echo("b", 40 + km(0.1), -74, "Bowling Green, Manhattan"),
        echo("c", 40 + km(0.2), -74, "Somewhere, Brooklyn"),
      ],
      1,
    );
    expect(out[0]?.label).toBe("Manhattan");
  });

  it("gives the same answer whatever order the echoes arrive in", () => {
    const set = [
      echo("a", 40, -74, "One, Manhattan"),
      echo("b", 40 + km(0.2), -74, "Two, Brooklyn"),
      echo("c", 41, -74, "Three, Albany"),
      echo("d", 41 + km(0.2), -74, "Four, Albany"),
    ];
    const forward = clusterEchoes(set, 0.5).map((c) => c.label + c.echoes.length);
    const backward = clusterEchoes([...set].reverse(), 0.5).map((c) => c.label + c.echoes.length);
    expect(backward).toEqual(forward);
  });

  it("sorts biggest first", () => {
    const out = clusterEchoes(
      [
        echo("a", 40, -74, "One, Small"),
        echo("b", 41, -74, "Two, Big"),
        echo("c", 41 + km(0.1), -74, "Three, Big"),
        echo("d", 41 + km(0.2), -74, "Four, Big"),
      ],
      0.5,
    );
    expect(out.map((c) => c.echoes.length)).toEqual([3, 1]);
  });

  it("keeps every echo, exactly once", () => {
    const set = Array.from({ length: 30 }, (_, i) =>
      echo(`e${i}`, 40 + km(i * 0.7), -74 + km(i % 5), "Somewhere, Place"),
    );
    for (const join of [0.1, 0.5, 1, 5, 100]) {
      const ids = clusterEchoes(set, join).flatMap((c) => c.echoes.map((e) => e.id));
      expect(ids.sort()).toEqual(set.map((e) => e.id).sort());
    }
  });

  it("puts everything in one cluster once the join distance swallows the world", () => {
    const set = [
      echo("a", 40, -74, "One, Manhattan"),
      echo("b", 25, -80, "Two, Miami Beach"),
      echo("c", 35, -82, "Three, North Carolina"),
    ];
    expect(clusterEchoes(set, 20_000)).toHaveLength(1);
  });

  it("puts the centre where the echoes are, not in the middle of their bounding box", () => {
    // Seven bunched at one end, one stray at the other: the mean sits near the seven.
    const bunch = Array.from({ length: 7 }, (_, i) =>
      echo(`b${i}`, 40 + km(i * 0.05), -74, "Bunch, Manhattan"),
    );
    const [c] = clusterEchoes([...bunch, echo("stray", 40 + km(2), -74, "Stray, Manhattan")], 3);
    expect(c?.at.lat).toBeLessThan(40 + km(1));
  });
});
