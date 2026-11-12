import { describe, expect, it } from "vitest";
import type { Echo } from "@echofinders/core";
import { dayLabel, isRareFind, minutesLabel, rareFindCount, rareWhy, shortPlace } from "../../apps/prototype/src/my-echoes";

describe("the short place on a My echoes row", () => {
  it("keeps the first part and the town, and drops the street and the state", () => {
    expect(shortPlace("City Hall and Thalian Hall, 310 Chestnut Street, Wilmington, North Carolina"))
      .toBe("City Hall and Thalian Hall, Wilmington");
    expect(shortPlace("Lewis and Harriet Hayden House, 66 Phillips Street, Beacon Hill, Boston, Massachusetts"))
      .toBe("Lewis and Harriet Hayden House, Boston");
  });

  it("reads Washington, D.C. as the town Washington", () => {
    expect(shortPlace("Ford's Theatre, 511 10th Street NW, Washington, D.C.")).toBe("Ford's Theatre, Washington");
  });

  it("keeps a place with no state as it ends", () => {
    expect(shortPlace("African Burial Ground, Duane Street, Manhattan")).toBe("African Burial Ground, Manhattan");
  });

  it("says a town alone once", () => {
    expect(shortPlace("Atlantic City, New Jersey")).toBe("Atlantic City");
    expect(shortPlace("Charleston")).toBe("Charleston");
  });
});

describe("the date on a My echoes row", () => {
  const now = new Date(2026, 10, 11, 15, 0);

  it("says Today and Yesterday where true", () => {
    expect(dayLabel(new Date(2026, 10, 11, 8, 0), now)).toBe("Today");
    expect(dayLabel(new Date(2026, 10, 10, 23, 30), now)).toBe("Yesterday");
  });

  it("is month then day, US order, otherwise", () => {
    expect(dayLabel(new Date(2026, 10, 3, 12, 0), now)).toBe("Nov 3");
  });

  it("names the year when it is not this one", () => {
    expect(dayLabel(new Date(2025, 11, 31, 12, 0), now)).toBe("Dec 31, 2025");
  });

  it("knows yesterday across a month", () => {
    expect(dayLabel(new Date(2026, 9, 31, 20, 0), new Date(2026, 10, 1, 9, 0))).toBe("Yesterday");
  });
});

// Rarity is hand picked since 2026-11-12 (docs/adr/0021-topics-and-rare.md): the tier is
// the echo's `rare` field, not inside, hours or remoteness. These were rewritten to that,
// and the last case pins that the old inputs no longer count on their own.
describe("rare finds", () => {
  const echo = (o: Partial<{ category: string; rare: string; rareReason: string; inside: boolean; remoteness: number }>) =>
    ({
      id: "x",
      category: o.category ?? "history",
      rare: o.rare,
      rareReason: o.rareReason,
      inside: o.inside,
      remoteness: o.remoteness,
      point: { at: { lat: 0, lng: 0 }, place: "", triggerRadiusKm: 0.04 },
    }) as unknown as Echo;

  it("counts rare and extra rare, not common", () => {
    const common = echo({});
    const rare = echo({ rare: "rare", rareReason: "Easy to miss" });
    const extra = echo({ rare: "extra-rare", rareReason: "Hard to reach" });
    expect([common, rare, extra].map(isRareFind)).toEqual([false, true, true]);
    expect(rareFindCount([common, rare, extra])).toBe(2);
  });

  it("counts true crime like any other echo (James, 2026-11-11)", () => {
    expect(isRareFind(echo({ category: "true-crime", rare: "rare", rareReason: "Only at certain times" }))).toBe(true);
  });

  it("no longer counts inside or far off the walk on their own", () => {
    expect(isRareFind(echo({ inside: true, remoteness: 0.9 }))).toBe(false);
  });

  it("says why on the card, in a short line", () => {
    expect(rareWhy(echo({ rare: "rare", rareReason: "Hard to reach" }))).toBe("Rare: hard to reach");
    expect(rareWhy(echo({ rare: "extra-rare", rareReason: "Inside, with opening hours" }))).toBe(
      "Extra rare: inside, with opening hours",
    );
    expect(rareWhy(echo({}))).toBeNull();
  });
});

describe("minutes on a row", () => {
  it("rounds, and is never under a minute", () => {
    expect(minutesLabel(20)).toBe("1 min");
    expect(minutesLabel(84)).toBe("1 min");
    expect(minutesLabel(150)).toBe("3 min");
  });
});
