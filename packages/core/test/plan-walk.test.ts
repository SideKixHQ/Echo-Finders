import { describe, expect, it } from "vitest";
import { orderStops, planWalk, type Candidate } from "../src/index.js";

const start = { lat: 34.235, lng: -77.948 };
// About 100 m per step north (0.0009 degrees of latitude).
const north = (steps: number) => ({ lat: start.lat + steps * 0.0009, lng: start.lng });
const c = (id: string, at: { lat: number; lng: number }, score = 0.5, listenS = 60): Candidate => ({ id, at, score, listenS });

describe("planning a walk", () => {
  it("fits the time it is given, listening included", () => {
    const line = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => c(`e${i}`, north(i)));
    const short = planWalk(start, line, 6 * 60);
    const long = planWalk(start, line, 20 * 60);
    expect(short.walkS + short.listenS).toBeLessThanOrEqual(6 * 60);
    expect(long.stops.length).toBeGreaterThan(short.stops.length);
  });

  it("walks them in order rather than doubling back", () => {
    const shuffled = [5, 1, 4, 2, 3].map((i) => c(`e${i}`, north(i)));
    const walk = planWalk(start, shuffled, 60 * 60);
    expect(walk.stops.map((s) => s.id)).toEqual(["e1", "e2", "e3", "e4", "e5"]);
  });

  it("prefers the better echo when it cannot have both", () => {
    const dull = c("dull", north(1), 0.1);
    const good = c("good", { lat: start.lat - 0.0009, lng: start.lng }, 0.9);
    const walk = planWalk(start, [dull, good], 3 * 60);
    expect(walk.stops.map((s) => s.id)).toEqual(["good"]);
  });

  it("comes back to the start when asked to", () => {
    const line = [1, 2, 3].map((i) => c(`e${i}`, north(i)));
    const out = planWalk(start, line, 60 * 60);
    const back = planWalk(start, line, 60 * 60, { loop: true });
    expect(back.walkS).toBeGreaterThan(out.walkS * 1.8);
  });

  it("spreads out rather than filling up at one house", () => {
    const house = [1, 2, 3, 4].map((i) => c(`house${i}`, { lat: north(2).lat + i * 0.00002, lng: start.lng }, 0.8));
    const elsewhere = [c("corner", north(4), 0.5), c("square", { lat: start.lat, lng: start.lng + 0.002 }, 0.5)];
    const walk = planWalk(start, [...house, ...elsewhere], 20 * 60, { maxStops: 3 });
    const ids = walk.stops.map((s) => s.id);
    expect(ids.filter((id) => id.startsWith("house"))).toHaveLength(1);
    expect(ids).toContain("corner");
    expect(ids).toContain("square");
  });

  it("puts stops somebody picked into the shortest order", () => {
    const picked = [3, 1, 2].map((i) => c(`e${i}`, north(i)));
    expect(orderStops(start, picked).stops.map((s) => s.id)).toEqual(["e1", "e2", "e3"]);
  });
});
