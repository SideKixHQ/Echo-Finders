import { describe, expect, it } from "vitest";
import { checkClaims, isCheckable, sentencesOf } from "../src/content/claims.js";
import { validateEcho } from "../src/content/validate.js";
import type { Echo, Source } from "../src/types.js";
import { makeEcho } from "./fixtures.js";

const source: Source = {
  title: "History & Culture",
  publisher: "National Park Service",
  retrievedAt: "2026-09-21",
  rights: "public-domain",
};

const SCRIPT = `The round sandstone building ahead of you was built to stop an invasion.

It went up between 1808 and 1811. Over the next thirty-five years something like eight
million people walked through it. Most people walk past it to queue for the boat.`;

const echo = (overrides: Partial<Echo> = {}): Echo =>
  makeEcho({ id: "fort", at: { lat: 40.7033, lng: -74.017 }, script: SCRIPT, sources: [source], ...overrides } as Parameters<typeof makeEcho>[0]);

describe("sentencesOf", () => {
  it("splits on terminal punctuation and folds line breaks", () => {
    expect(sentencesOf(SCRIPT)).toEqual([
      "The round sandstone building ahead of you was built to stop an invasion.",
      "It went up between 1808 and 1811.",
      "Over the next thirty-five years something like eight million people walked through it.",
      "Most people walk past it to queue for the boat.",
    ]);
  });
});

describe("isCheckable", () => {
  it("catches numbers, dates, counting words and superlatives", () => {
    expect(isCheckable("It went up between 1808 and 1811.")).toBe(true);
    expect(isCheckable("Eight million people walked through it.")).toBe(true);
    expect(isCheckable("On the first of August it opened.")).toBe(true);
    expect(isCheckable("It was the tallest thing in New York.")).toBe(true);
    expect(isCheckable("It opened in August.")).toBe(true);
    expect(isCheckable("So did Harry Houdini.")).toBe(true);
  });
  it("leaves description alone", () => {
    expect(isCheckable("Most people walk past it to queue for the boat.")).toBe(false);
    // "may" is a month and a verb; a false positive costs a reviewer one extra line.
    expect(isCheckable("The ferries go now.")).toBe(false);
  });
});

describe("checkClaims", () => {
  it("lists every checkable sentence, uncovered until a claim backs it", () => {
    const result = checkClaims(echo());
    expect(result.checkable.map((c) => c.sentence)).toEqual([
      "It went up between 1808 and 1811.",
      "Over the next thirty-five years something like eight million people walked through it.",
    ]);
    expect(result.checkable.every((c) => !c.claim)).toBe(true);
  });

  it("matches a claim to its sentence through case, quotes and spacing", () => {
    const result = checkClaims(
      echo({
        claims: [{ says: "between 1808 and 1811", source: 1, quote: "Built 1808–1811." }],
      }),
    );
    expect(result.checkable[0]!.claim?.quote).toBe("Built 1808–1811.");
    expect(result.checkable[1]!.claim).toBeUndefined();
  });

  it("reports claims that point nowhere, have no quote, or left the script", () => {
    const result = checkClaims(
      echo({
        claims: [
          { says: "between 1808 and 1811", source: 2, quote: "x" },
          { says: "eight million people", source: 1, quote: "  " },
          { says: "nine million people", source: 1, quote: "y" },
        ],
      }),
    );
    expect(result.badSource.map((c) => c.says)).toEqual(["between 1808 and 1811"]);
    expect(result.unquoted.map((c) => c.says)).toEqual(["eight million people"]);
    expect(result.orphaned.map((c) => c.says)).toEqual(["nine million people"]);
  });
});

describe("validateEcho with claims", () => {
  const claimErrors = (e: Echo) =>
    validateEcho(e).filter((i) => i.severity === "error" && i.field === "claims");

  it("lets a draft be unfinished", () => {
    expect(claimErrors(echo({ editorial: "draft", factCheck: "unchecked" }))).toEqual([]);
  });

  it("refuses to approve while a checkable sentence has no quoted source", () => {
    const approved = echo({ editorial: "approved", factCheck: "corroborated" });
    expect(claimErrors(approved)).toHaveLength(2);
  });

  it("approves once every checkable sentence is backed", () => {
    const approved = echo({
      editorial: "approved",
      factCheck: "corroborated",
      claims: [
        { says: "between 1808 and 1811", source: 1, quote: "Constructed between 1808 and 1811." },
        { says: "eight million people", source: 1, quote: "Some 8 million immigrants." },
      ],
    });
    expect(claimErrors(approved)).toEqual([]);
  });

  it("flags a claim citing a source the echo does not list, even on a draft", () => {
    const draft = echo({
      editorial: "draft",
      factCheck: "unchecked",
      claims: [{ says: "between 1808 and 1811", source: 3, quote: "x" }],
    });
    expect(claimErrors(draft)).toHaveLength(1);
  });
});
