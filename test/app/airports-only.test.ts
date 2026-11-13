/**
 * Flights are found by airport, not by flight number (James, 2026-11-13, decision 10: "Drop
 * flight numbers; airports only"). The stub that matched four flight numbers to JFK to Miami
 * was called by no screen; a real lookup needs a paid flight data service.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "../../apps/prototype/src");

describe("airports only", () => {
  it("no flight number lookup ships with the app", () => {
    const files = readdirSync(SRC).filter((f) => /\.tsx?$/.test(f));
    const lookups = files.filter((f) => /lookupFlight|FLIGHT_ROUTES/.test(readFileSync(join(SRC, f), "utf8")));
    expect(lookups).toEqual([]);
  });
});
