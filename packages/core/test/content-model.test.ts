import { describe, expect, it } from "vitest";
import { ADVERTISING_MIN_AGE, validateEcho } from "../src/content/validate.js";
import { anchorOffsetS, CENTRE_ANCHOR_MAX_S, NOMINAL_DURATION_S } from "../src/types.js";
import { buildPlaylist } from "../src/ranking/playlist.js";
import type { Sponsorship, Echo, Transcript } from "../src/types.js";
import { ADULT, CHILD, JFK_MIA, makeEcho, echoesAlong } from "./fixtures.js";
import type { EchoDraft } from "./fixtures.js";

const errorsOn = (echo: Echo, field: string) =>
  validateEcho(echo).filter((i) => i.severity === "error" && i.field === field);
const allErrors = (echo: Echo) => validateEcho(echo).filter((i) => i.severity === "error");

const SPONSORSHIP: Sponsorship = {
  disclosure: "Sponsored · Utah Restaurant Group",
  advertiser: "The Copper Onion",
  advertiserId: "copper-onion-slc",
};

const transcript = (lines: [string, number, number][]): Transcript => ({
  lines: lines.map(([text, atS, durationS]) => ({ text, atS, durationS })),
  totalS: lines.reduce((max, [, at, dur]) => Math.max(max, at + dur), 0),
});

describe("anchorOffsetS", () => {
  it("centres a short echo on the place it describes", () => {
    expect(anchorOffsetS(NOMINAL_DURATION_S.short)).toBe(NOMINAL_DURATION_S.short / 2);
  });

  it("anchors a long echo near its opening instead", () => {
    // A ten-minute feature at cruise spans 1,400km. Centring it would mean starting five
    // minutes before the place appears and ending five minutes after it is gone.
    const offset = anchorOffsetS(NOMINAL_DURATION_S.deep);
    expect(offset).toBeLessThan(NOMINAL_DURATION_S.deep / 2);
    expect(offset).toBeLessThanOrEqual(90);
  });

  it("switches over at the documented threshold", () => {
    expect(anchorOffsetS(CENTRE_ANCHOR_MAX_S)).toBe(CENTRE_ANCHOR_MAX_S / 2);
    expect(anchorOffsetS(CENTRE_ANCHOR_MAX_S + 1)).toBeLessThan(CENTRE_ANCHOR_MAX_S / 2);
  });
});

describe("scheduling long-form echoes", () => {
  const deepLibrary = echoesAlong(JFK_MIA, 30).map((s) =>
    makeEcho({ ...s, format: "deep", durationS: NOMINAL_DURATION_S.deep }),
  );

  it("schedules them at all", () => {
    // Before anchoring was introduced a ten-minute echo could not satisfy the drift
    // budget from its midpoint, so long-form content simply never played.
    const playlist = buildPlaylist(JFK_MIA, deepLibrary, ADULT);
    expect(playlist.items.length).toBeGreaterThan(2);
  });

  it("starts them shortly before the place, not centred on it", () => {
    const playlist = buildPlaylist(JFK_MIA, deepLibrary, ADULT);
    for (const item of playlist.items) {
      const anchor = item.startS + anchorOffsetS(item.echo.durationS);
      expect(Math.abs(anchor - item.nearestS)).toBeLessThanOrEqual(600);
      // The echo should still be running when the place arrives.
      expect(item.endS).toBeGreaterThan(item.nearestS);
    }
  });

  it("still does not overlap them", () => {
    const { items } = buildPlaylist(JFK_MIA, deepLibrary, ADULT);
    for (let i = 1; i < items.length; i++) {
      expect(items[i]!.startS).toBeGreaterThanOrEqual(items[i - 1]!.endS);
    }
  });
});

describe("the simple retelling", () => {
  const withSimple = (durationS: number) =>
    makeEcho({
      id: "s",
      at: { lat: 33, lng: -79 },
      durationS: 90,
      simple: { title: "The bridge everyone said was impossible", durationS, script: "Short version." },
    });

  it("accepts a shorter, plainer version", () => {
    expect(allErrors(withSimple(40))).toEqual([]);
  });

  it("rejects one that is not actually shorter", () => {
    // Almost always a copy-paste of the full script.
    expect(errorsOn(withSimple(90), "simple.durationS")).toHaveLength(1);
    expect(errorsOn(withSimple(200), "simple.durationS")).toHaveLength(1);
  });

  it("requires its own title and script", () => {
    const blank = makeEcho({
      id: "s",
      at: { lat: 33, lng: -79 },
      simple: { title: "  ", durationS: 30, script: "" },
    });
    expect(errorsOn(blank, "simple.title")).toHaveLength(1);
    expect(errorsOn(blank, "simple.script")).toHaveLength(1);
  });
});

describe("transcripts", () => {
  const withTranscript = (t: Transcript) =>
    makeEcho({ id: "s", at: { lat: 33, lng: -79 }, transcript: t });

  it("accepts lines that run forwards", () => {
    const ok = withTranscript(transcript([["One.", 0, 3], ["Two.", 3, 4], ["Three.", 7, 2]]));
    expect(allErrors(ok)).toEqual([]);
  });

  it("catches overlapping lines", () => {
    // Line seeking and read-along both assume monotonic timings; an overlap silently
    // highlights the wrong line for the rest of the echo.
    const overlapping = withTranscript(transcript([["One.", 0, 5], ["Two.", 2, 4]]));
    expect(errorsOn(overlapping, "renders[0].transcript.lines[1].atS")).toHaveLength(1);
  });

  it("catches lines running past the end of the audio", () => {
    const over = withTranscript({
      lines: [{ text: "One.", atS: 0, durationS: 30 }],
      totalS: 10,
    });
    expect(errorsOn(over, "renders[0].transcript.totalS")).toHaveLength(1);
  });

  it("rejects an empty transcript", () => {
    expect(errorsOn(withTranscript({ lines: [], totalS: 0 }), "renders[0].transcript")).toHaveLength(1);
  });

  it("rejects a blank line", () => {
    const blank = withTranscript(transcript([["One.", 0, 3], ["   ", 3, 2]]));
    expect(errorsOn(blank, "renders[0].transcript.lines[1].text")).toHaveLength(1);
  });
});

describe("sponsored placements", () => {
  const ad = (overrides: Partial<EchoDraft> = {}) =>
    makeEcho({
      id: "ad-copper-onion",
      at: { lat: 40.762, lng: -111.891 },
      // A restaurant placement is filed under what it is *about*, and carries its paid
      // status in `sponsorship`. It used to sit under an "attractions" category, which is
      // the same mistake `Sponsorship`'s own comment warns against — a commercial
      // relationship is a property, not a subject.
      category: "food-drink",
      minAge: ADVERTISING_MIN_AGE,
      sources: [],
      sponsorship: SPONSORSHIP,
      ...overrides,
    });

  it("accepts a properly disclosed placement", () => {
    expect(allErrors(ad())).toEqual([]);
  });

  it("does not demand editorial sources from an advertisement", () => {
    // An ad makes no factual claim we vouch for; requiring a citation would only teach
    // editors to paste in a meaningless one.
    expect(errorsOn(ad(), "sources")).toEqual([]);
  });

  it("refuses an undisclosed placement", () => {
    const hidden = ad({ sponsorship: { ...SPONSORSHIP, disclosure: "  " } });
    expect(errorsOn(hidden, "sponsorship.disclosure")).toHaveLength(1);
  });

  it("requires an advertiser id an airline can block", () => {
    const unblockable = ad({ sponsorship: { ...SPONSORSHIP, advertiserId: "" } });
    expect(errorsOn(unblockable, "sponsorship.advertiserId")).toHaveLength(1);
  });

  it("never advertises to children", () => {
    expect(errorsOn(ad({ minAge: 0 }), "minAge")).toHaveLength(1);
    expect(errorsOn(ad({ category: "kids", minAge: 8 }), "category")).toHaveLength(1);
  });

  it("keeps a sponsored placement out of a child's playlist", () => {
    const library = [...echoesAlong(JFK_MIA, 10), ad({ at: { lat: 33.69, lng: -78.89 } })];
    const playlist = buildPlaylist(JFK_MIA, library, CHILD);
    for (const item of playlist.items) expect(item.echo.sponsorship).toBeUndefined();
  });

  it("validates the campaign window", () => {
    const backwards = ad({
      sponsorship: { ...SPONSORSHIP, runsFrom: "2026-06-01", runsUntil: "2026-05-01" },
    });
    expect(errorsOn(backwards, "sponsorship.runsUntil")).toHaveLength(1);

    const malformed = ad({ sponsorship: { ...SPONSORSHIP, runsFrom: "soon" } });
    expect(errorsOn(malformed, "sponsorship.runsFrom")).toHaveLength(1);
  });
});
