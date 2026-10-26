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

describe("isCheckable", () => {
  it("does not treat an immersive suggestion as a claim", () => {
    // James (2026-10-26): "Things like that are immersive suggestions." They assert
    // nothing, so no source could ever back one, and demanding a quote for them made the
    // echoes carrying them impossible to approve.
    expect(isCheckable("Look at the windows from Third Street.")).toBe(false);
    expect(isCheckable("Look at the old buildings from Orange Street.")).toBe(false);
    expect(isCheckable("Imagine a playbill announcing the Opera House.")).toBe(false);
    expect(isCheckable("Do not enter a private courtyard to recreate the show.")).toBe(false);
    expect(isCheckable("Listen for the bells of St. James.")).toBe(false);
  });

  it("still checks a fact carried inside a direction", () => {
    expect(isCheckable("Look at number 604 H Street.")).toBe(true);
    expect(isCheckable("Stand where the 1898 mob gathered.")).toBe(true);
    expect(
      isCheckable("Look across the street at numbers eighty-nine and ninety-one Church Street."),
    ).toBe(true);
  });

  it("treats a numbered street as a name rather than a count", () => {
    // "Third Street" is a street sign, not the third of anything.
    expect(isCheckable("Harry Forden worked to revive North Fourth Street.")).toBe(true);
    expect(isCheckable("The building on Third Street burned in 1898.")).toBe(true);
  });

  it("still checks an ordinary assertion", () => {
    expect(isCheckable("On October 12, 1858, Thalian Hall opened with a gala.")).toBe(true);
    expect(isCheckable("Alex Manly edited the Daily Record.")).toBe(true);
  });
});

describe("sentencesOf", () => {
  it("still ends a sentence on an abbreviation that can end one", () => {
    // The first version of the abbreviation list was case-insensitive and held every
    // short form it could think of, so it glued real sentences together. This is the
    // one it broke in the library, in boston-waiting-for-mister-rotch.
    expect(
      sentencesOf("When he finally came in, the answer was no. By the traditional account, Samuel Adams stood."),
    ).toEqual([
      "When he finally came in, the answer was no.",
      "By the traditional account, Samuel Adams stood.",
    ]);
    expect(sentencesOf("He collected stamps, coins, etc. Then he stopped.")).toEqual([
      "He collected stamps, coins, etc.",
      "Then he stopped.",
    ]);
    expect(sentencesOf("The company is Acme Co. It closed.")).toEqual([
      "The company is Acme Co.",
      "It closed.",
    ]);
    expect(sentencesOf("He met John Smith Jr. Then he left.")).toEqual([
      "He met John Smith Jr.",
      "Then he left.",
    ]);
  });

  it("does not end a sentence on a prefix that qualifies what follows", () => {
    expect(sentencesOf("She lived at No. 5 Market Street.")).toEqual([
      "She lived at No. 5 Market Street.",
    ]);
    expect(sentencesOf("It stood here ca. 1750 by most accounts.")).toEqual([
      "It stood here ca. 1750 by most accounts.",
    ]);
    expect(sentencesOf("The fixture was Celtic vs. Rangers.")).toEqual([
      "The fixture was Celtic vs. Rangers.",
    ]);
  });

  it("does not end a sentence on an abbreviation", () => {
    // Wilmington is full of saints, and each one used to become its own "sentence".
    expect(
      sentencesOf("In 1962 a community effort established St. John's Art Gallery. It moved later."),
    ).toEqual([
      "In 1962 a community effort established St. John's Art Gallery.",
      "It moved later.",
    ]);
    expect(sentencesOf("The test came on St. Patrick's Day, 1887.")).toEqual([
      "The test came on St. Patrick's Day, 1887.",
    ]);
    expect(sentencesOf("It went to Mr. Forden. Then to Dr. Bellamy.")).toEqual([
      "It went to Mr. Forden.",
      "Then to Dr. Bellamy.",
    ]);
  });


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
    validateEcho(e).filter((i) => i.severity === "error" && i.field.startsWith("claims"));

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
