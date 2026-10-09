import { describe, expect, it } from "vitest";
import { interestsFrom, kindTag } from "../src/index.js";

const ghost = { category: "legend" as const, tags: ["wilmington"] };
const history = { category: "history" as const, tags: ["wilmington"] };

describe("taste, from how echoes landed", () => {
  it("is nothing at all before any reaction", () => {
    expect(interestsFrom([])).toEqual({});
  });

  it("leans towards a kind after a few faces, without one tap flooding it", () => {
    const once = interestsFrom([{ echo: ghost, reaction: "chills" }]);
    const thrice = interestsFrom([1, 2, 3].map(() => ({ echo: ghost, reaction: "chills" as const })));
    expect(once[kindTag("legend")]).toBeCloseTo(2 / 3);
    expect(thrice[kindTag("legend")]).toBeCloseTo(0.8);
  });

  it("counts meh against, and every face for", () => {
    const t = interestsFrom([
      { echo: history, reaction: "meh" },
      { echo: history, reaction: "meh" },
      { echo: ghost, reaction: "moved" },
    ]);
    expect(t[kindTag("history")]).toBeCloseTo(0.25);
    expect(t[kindTag("legend")]).toBeCloseTo(2 / 3);
    // The shared place tag sits between them.
    expect(t["wilmington"]).toBeCloseTo((1 + 1) / 5);
  });
});
