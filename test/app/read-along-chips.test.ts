import { describe, expect, it } from "vitest";
import { LIBRARY } from "../../apps/prototype/src/library.generated";
import { readAlongChips, splitScript } from "../../apps/prototype/src/transcript-lines";

describe("read along chips", () => {
  it("keeps a tag that is in the script, as it reads, and drops one that is not", () => {
    const lines = splitScript("They landed in New York in 1855. The fort became a garden.");
    expect(readAlongChips(["new-york", "immigration", "fort"], lines)).toEqual(["new york", "fort"]);
  });

  it("a later tag that matches fills a slot a dead one left, up to four", () => {
    const lines = splitScript("A fort in New York, a garden, a ferry and a museum.");
    expect(readAlongChips(["immigration", "new-york", "forts", "nineteenth-century", "garden", "ferry", "museum"], lines))
      .toEqual(["new york", "garden", "ferry", "museum"]);
  });

  it("no tags, no chips", () => {
    expect(readAlongChips(undefined, splitScript("Anything."))).toEqual([]);
  });

  it("across the whole library, every chip shown finds a line of its script", () => {
    const empty: string[] = [];
    for (const echo of LIBRARY) {
      for (const script of [echo.script, echo.simple?.script].filter((s): s is string => !!s)) {
        const lines = splitScript(script);
        for (const words of readAlongChips(echo.tags, lines)) {
          if (!lines.some((l) => l.text.toLowerCase().includes(words))) empty.push(`${echo.id}: ${words}`);
        }
      }
    }
    expect(empty).toEqual([]);
  });
});
