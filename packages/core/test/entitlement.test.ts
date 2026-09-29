/**
 * The free ten, and what they count.
 *
 * The rule that matters most here is the one that is easiest to get wrong and worst to
 * ship wrong: an echo somebody has already heard is always replayable. Charging twice for
 * the same story would be indefensible, and it is the sort of thing that only shows up
 * when a real listener replays something from their collection in month two.
 */

import { describe, expect, it } from "vitest";
import {
  FREE,
  FREE_ECHO_LIMIT,
  freeEchoesLeft,
  mayHearAnother,
  PRICE,
  type Entitlement,
} from "../src/entitlement/entitlement.js";
import type { Echo, ListenerProfile } from "../src/types.js";
import { checkEligibility } from "../src/ranking/score.js";
import { makeEcho } from "./fixtures.js";

const UNLOCKED: Entitlement = { kind: "unlocked", purchasedAt: 1_700_000_000_000 };

const listener = (heard: readonly string[] = []): ListenerProfile => ({
  categories: ["history"],
  age: 30,
  heardEchoIds: heard,
});

const heardIds = (n: number) => Array.from({ length: n }, (_, i) => `echo-${i}`);

describe("the free tier", () => {
  it("gives ten before asking for anything", () => {
    expect(freeEchoesLeft(FREE, listener())).toBe(FREE_ECHO_LIMIT);
    expect(mayHearAnother(FREE, listener(), "new")).toBe(true);
  });

  it("counts down as distinct echoes are heard", () => {
    expect(freeEchoesLeft(FREE, listener(heardIds(4)))).toBe(6);
    expect(freeEchoesLeft(FREE, listener(heardIds(9)))).toBe(1);
  });

  it("closes on the eleventh", () => {
    const spent = listener(heardIds(FREE_ECHO_LIMIT));
    expect(freeEchoesLeft(FREE, spent)).toBe(0);
    expect(mayHearAnother(FREE, spent, "an-eleventh")).toBe(false);
  });

  it("never charges twice for the same story", () => {
    // Ten used up, and this one is already theirs. It has to stay playable forever.
    const spent = listener(heardIds(FREE_ECHO_LIMIT));
    expect(mayHearAnother(FREE, spent, "echo-3")).toBe(true);
  });

  it("does not double count a repeated id", () => {
    const sloppy = listener(["a", "a", "b"]);
    expect(freeEchoesLeft(FREE, sloppy)).toBe(FREE_ECHO_LIMIT - 2);
  });

  it("treats a listener with no history as untouched", () => {
    const fresh: ListenerProfile = { categories: ["history"], age: 30 };
    expect(freeEchoesLeft(FREE, fresh)).toBe(FREE_ECHO_LIMIT);
  });
});

describe("once it is bought", () => {
  it("is unlimited rather than a large number", () => {
    expect(freeEchoesLeft(UNLOCKED, listener(heardIds(400)))).toBe(Infinity);
  });

  it("opens everything, including past the old limit", () => {
    expect(mayHearAnother(UNLOCKED, listener(heardIds(999)), "anything")).toBe(true);
  });

  it("is one payment at the price the document decided", () => {
    expect(PRICE.amountMinor).toBe(699);
    expect(PRICE.currency).toBe("USD");
  });
});

/**
 * The gate, in the place `docs/03-selling.md` insisted it go.
 *
 * Beside `checkEligibility` rather than inside it would mean the map could offer an echo
 * the player then refuses, which is the specific failure the doc names. These assert the
 * wiring, not the arithmetic above.
 */
describe("the paywall, inside the eligibility gate", () => {
  // The repo's own factory rather than a hand-rolled literal. Mine was missing five
  // required fields, which vitest happily transpiled past and `tsc -p tsconfig.test.json`
  // caught — the reason the test project is typechecked separately at all.
  const echo = (id: string): Echo =>
    makeEcho({ id, category: "history", at: { lat: 40.7, lng: -74 }, place: "Manhattan" });

  const ctx = (entitlement: Entitlement | undefined, heard: readonly string[]) => ({
    profile: listener(heard),
    playAtMs: Date.UTC(2026, 0, 1, 15),
    ...(entitlement ? { entitlement } : {}),
  });

  it("says needs-unlock once the ten are spent", () => {
    const r = checkEligibility(echo("new-one"), ctx(FREE, heardIds(FREE_ECHO_LIMIT)));
    expect(r.eligible).toBe(false);
    expect(r.reasons).toContain("needs-unlock");
  });

  it("lets the first ten through", () => {
    expect(checkEligibility(echo("new-one"), ctx(FREE, heardIds(3))).eligible).toBe(true);
  });

  it("never blocks something already heard, even past the limit", () => {
    // `already-heard` is a different rule with a different job: it stops the ENGINE
    // queueing a repeat. It must not be confused with the paywall refusing one.
    const r = checkEligibility(echo("echo-2"), ctx(FREE, heardIds(FREE_ECHO_LIMIT)));
    expect(r.reasons).not.toContain("needs-unlock");
  });

  it("opens everything once bought", () => {
    expect(checkEligibility(echo("new-one"), ctx(UNLOCKED, heardIds(90))).eligible).toBe(true);
  });

  /*
   * The one that protects every caller written before there was a price. Content
   * validation, the package builder and a few hundred existing tests pass no entitlement,
   * and a gate that defaulted itself on would have failed all of them silently.
   */
  it("is inert for callers that know nothing about money", () => {
    const r = checkEligibility(echo("new-one"), ctx(undefined, heardIds(500)));
    expect(r.reasons).not.toContain("needs-unlock");
  });

  it("reports the safety gate first when both fail", () => {
    const grim = { ...echo("grim"), minAge: 16 };
    const r = checkEligibility(grim, {
      profile: { ...listener(heardIds(FREE_ECHO_LIMIT)), age: 7 },
      playAtMs: Date.UTC(2026, 0, 1, 15),
      entitlement: FREE,
    });
    expect(r.reasons.indexOf("below-min-age")).toBeLessThan(r.reasons.indexOf("needs-unlock"));
  });
});
