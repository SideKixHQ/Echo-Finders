import { describe, expect, it } from "vitest";
import { parseEcho } from "../src/content/parse.js";
import { estimateBytes } from "../src/pkg/build.js";
import { renderFor } from "../src/types.js";
import type { Echo } from "../src/types.js";
import { validateEcho } from "../src/content/validate.js";

const minimal = () => ({
  id: "test-echo",
  title: "A title",
  summary: "A summary",
  place: "Somewhere",
  at: { lat: 40.7, lng: -74 },
  triggerRadiusKm: 0.08,
  category: "history",
  sources: [
    {
      title: "Source",
      publisher: "National Park Service",
      url: "https://www.nps.gov/",
      retrievedAt: "2026-09-21",
      rights: "public-domain",
    },
  ],
});

const errorFields = (input: unknown) =>
  parseEcho(input).issues.filter((i) => i.severity === "error").map((i) => i.field);

describe("parsing an authored file", () => {
  it("accepts the flat shape an author actually writes", () => {
    const { echo, issues } = parseEcho(minimal());
    expect(issues).toEqual([]);
    expect(echo!.point.at.lat).toBeCloseTo(40.7, 5);
    expect(echo!.point.triggerRadiusKm).toBeCloseTo(0.08, 5);
    expect(echo!.point.place).toBe("Somewhere");
  });

  it("defaults an unmarked file to an unchecked draft", () => {
    // Publishing has to be something a person did on purpose.
    const { echo } = parseEcho(minimal());
    expect(echo!.editorial).toBe("draft");
    expect(echo!.factCheck).toBe("unchecked");
  });

  it("produces something the validator is happy with", () => {
    const { echo } = parseEcho(minimal());
    expect(validateEcho(echo!).filter((i) => i.severity === "error")).toEqual([]);
  });

  it("fills the runtime from the format when it is not given", () => {
    const { echo } = parseEcho({ ...minimal(), format: "feature" });
    expect(echo!.durationS).toBe(210);
  });

  it("keeps an explicit runtime", () => {
    const { echo } = parseEcho({ ...minimal(), durationS: 95 });
    expect(echo!.durationS).toBe(95);
  });

  it("carries the optional prose through", () => {
    const { echo } = parseEcho({
      ...minimal(),
      script: "The narration.",
      teaser: "A teaser.",
      detail: "More.",
    });
    expect(echo!.script).toBe("The narration.");
    expect(echo!.teaser).toBe("A teaser.");
  });

  it("omits optional fields rather than filling them with undefined", () => {
    const { echo } = parseEcho(minimal());
    expect("script" in echo!).toBe(false);
    expect("tags" in echo!).toBe(false);
  });
});

describe("reporting what is wrong", () => {
  it("names every missing field at once", () => {
    // An editor fixing a file wants the whole list, not a game of whack-a-mole.
    const fields = errorFields({ id: "broken" });
    expect(fields).toContain("title");
    expect(fields).toContain("summary");
    expect(fields).toContain("at");
    expect(fields.length).toBeGreaterThan(3);
  });

  it("rejects a file that is not a mapping", () => {
    expect(errorFields(["not", "an", "echo"])).toContain("<file>");
    expect(errorFields("a string")).toContain("<file>");
  });

  it("catches a mistyped category", () => {
    expect(errorFields({ ...minimal(), category: "histry" })).toContain("category");
  });

  it("catches a mistyped format", () => {
    expect(errorFields({ ...minimal(), format: "epic" })).toContain("format");
  });

  it("catches coordinates written as text", () => {
    expect(errorFields({ ...minimal(), at: { lat: "40.7", lng: -74 } })).toContain("at.lat");
  });

  it("insists every source records when it was retrieved", () => {
    const noDate = {
      ...minimal(),
      sources: [{ title: "S", publisher: "P", rights: "public-domain" }],
    };
    expect(errorFields(noDate)).toContain("sources[0].retrievedAt");
  });

  it("insists on sources at all", () => {
    const { sources: _dropped, ...withoutSources } = minimal();
    expect(errorFields(withoutSources)).toContain("sources");
  });

  it("returns no echo when anything failed", () => {
    expect(parseEcho({ id: "broken" }).echo).toBeNull();
  });

  it("falls back to the filename when even the id is missing", () => {
    const { issues } = parseEcho({}, "content/echoes/history/mystery.yml");
    expect(issues[0]!.echoId).toBe("content/echoes/history/mystery.yml");
  });
});

describe("pronunciation notes", () => {
  it("carries them through", () => {
    // Place names are what a narrator says most and gets wrong most.
    const { echo } = parseEcho({
      ...minimal(),
      pronunciations: [
        { written: "Houston Street", say: "HOW-ston Street", ipa: "\u02c8ha\u028ast\u0259n" },
        { written: "Duane Street", say: "doo-AYN Street" },
      ],
    });
    expect(echo!.pronunciations).toHaveLength(2);
    expect(echo!.pronunciations![0]!.say).toBe("HOW-ston Street");
    expect(echo!.pronunciations![1]!.ipa).toBeUndefined();
  });

  it("skips a malformed note rather than failing the file", () => {
    // A missing note means a narrator says a name the ordinary way — a quality problem for
    // an editor, not a reason to refuse an otherwise sound echo.
    const { echo, issues } = parseEcho({
      ...minimal(),
      pronunciations: [{ written: "Duane Street" }, { written: "Houston", say: "HOW-ston" }],
    });
    expect(issues).toEqual([]);
    expect(echo!.pronunciations).toHaveLength(1);
  });

  it("omits the field when there are none", () => {
    expect("pronunciations" in parseEcho(minimal()).echo!).toBe(false);
  });

  it("reads one render per narrator", () => {
    // Transcript timings belong to a render, not a script: two narrators produce different
    // durations, so a second voice is a second set of line timings, not just another file.
    const { echo } = parseEcho({
      ...minimal(),
      durationS: 95,
      renders: [
        { voiceId: "plP9aw1rizYgjFfuvLQ7", audioKey: "audio/a.opus", durationS: 95 },
        { voiceId: "hP72SDESIJq2YuAblBqz", audioKey: "audio/a-male.opus", durationS: 101 },
      ],
    });
    expect(echo!.renders).toHaveLength(2);
    expect(echo!.renders![1]!.durationS).toBe(101);
  });

  it("falls back to the echo's duration for a render that has not stated one", () => {
    const { echo } = parseEcho({
      ...minimal(),
      durationS: 95,
      renders: [{ voiceId: "v1", audioKey: "audio/a.opus" }],
    });
    expect(echo!.renders![0]!.durationS).toBe(95);
  });
});

/** One echo, two narrators, measured sizes that differ as real renders would. */
function makeEchoWithRenders(): Echo {
  return parseEcho({
    ...minimal(),
    durationS: 95,
    renders: [
      { voiceId: "voice-a", audioKey: "audio/a.opus", durationS: 95, audioBytes: 760_000 },
      { voiceId: "voice-b", audioKey: "audio/b.opus", durationS: 101, audioBytes: 808_000 },
    ],
  }).echo!;
}

describe("what two voices cost", () => {
  it("bills only the narrator the package carries", () => {
    // The honest cost of a narrator picker: every voice offered is a second complete copy
    // of every audio file.
    const echo = makeEchoWithRenders();
    const one = estimateBytes(echo, 64, ["voice-a"]);
    const both = estimateBytes(echo, 64, ["voice-a", "voice-b"]);
    expect(both).toBeGreaterThan(one * 1.8);
  });

  it("defaults to a single narrator", () => {
    const echo = makeEchoWithRenders();
    expect(estimateBytes(echo, 64)).toBe(estimateBytes(echo, 64, ["voice-a"]));
  });

  it("does not bill twice when the second voice was never rendered", () => {
    const echo = makeEchoWithRenders();
    expect(estimateBytes(echo, 64, ["voice-a", "voice-never-recorded"])).toBe(
      estimateBytes(echo, 64, ["voice-a"]),
    );
  });

  it("picks the requested narrator, and falls back rather than going silent", () => {
    const echo = makeEchoWithRenders();
    expect(renderFor(echo.renders, "voice-b")!.audioKey).toBe("audio/b.opus");
    // A listener who picks a narrator we have not finished recording hears the echo.
    expect(renderFor(echo.renders, "voice-missing")!.audioKey).toBe("audio/a.opus");
    expect(renderFor(undefined, "voice-a")).toBeUndefined();
  });
});

describe("the true-crime sign-off", () => {
  const review = {
    involvesLivingPeople: true,
    convictionStatus: "convicted",
    reviewedBy: "editorial-lead",
    reviewedAt: "2026-09-22",
    contentWarning: "This echo describes a murder.",
  };

  const crime = (overrides: Record<string, unknown> = {}) => ({
    ...minimal(),
    category: "true-crime",
    minAge: 16,
    factCheck: "corroborated",
    editorial: "approved",
    sources: [...minimal().sources, { ...minimal().sources[0]!, title: "Second source" }],
    trueCrimeReview: review,
    ...overrides,
  });

  it("survives the parse at all", () => {
    // Regression, and a bad one: the field was never parsed. The validator would report
    // "trueCrimeReview is mandatory for true crime" about a file that plainly contained
    // one, so no true-crime echo could be published from YAML by any route. It went
    // unnoticed because nothing in the library was true crime until something was.
    const { echo } = parseEcho(crime());
    expect(echo?.trueCrimeReview).toEqual(review);
  });

  it("gets a true-crime echo past the gate it exists to satisfy", () => {
    const { echo } = parseEcho(crime());
    const errors = validateEcho(echo as Echo).filter((i) => i.severity === "error");
    expect(errors).toEqual([]);
  });

  it("refuses a malformed review instead of quietly dropping it", () => {
    // Silently skipping is what every other optional field does, and it is precisely how
    // this one hid for so long. A field whose job is to prove a human looked at something
    // must never go missing without saying so.
    expect(errorFields(crime({ trueCrimeReview: { ...review, reviewedBy: 42 } }))).toContain(
      "trueCrimeReview.reviewedBy",
    );
    expect(errorFields(crime({ trueCrimeReview: "yes, reviewed" }))).toContain("trueCrimeReview");
  });

  it("rejects a conviction status that is not one of the four", () => {
    // "probably" is the shape of a defamation claim.
    expect(
      errorFields(crime({ trueCrimeReview: { ...review, convictionStatus: "probably" } })),
    ).toContain("trueCrimeReview.convictionStatus");
  });
});

/**
 * Archive photographs and attractions.
 *
 * These exist because the same bug shipped three times: a field declared on `Echo` that the
 * parser never reads. `trueCrimeReview` spent its whole life dropped, so no true-crime echo
 * could validate; `simple` followed; `archive` and `attraction` were both still unread when
 * the camera was built on top of one of them. The failure mode is the worst kind — the
 * content file plainly contains the field, every test is green, and the only way to find out
 * is to read the parser — so each one now has a test that would have caught it on day one.
 */
describe("archive photographs", () => {
  const photo = {
    imageKey: "archive/trinity-1870",
    at: { lat: 40.7081, lng: -74.0123 },
    bearingDeg: 92,
    year: 1870,
    caption: "The spire above the rooftops",
    credit: "Library of Congress",
    rights: "public-domain",
  };

  it("is read at all", () => {
    const { echo, issues } = parseEcho({ ...minimal(), archive: [photo] });
    expect(issues).toEqual([]);
    expect(echo?.archive).toHaveLength(1);
    expect(echo?.archive?.[0]?.imageKey).toBe("archive/trinity-1870");
    expect(echo?.archive?.[0]?.at).toEqual({ lat: 40.7081, lng: -74.0123 });
    expect(echo?.archive?.[0]?.bearingDeg).toBe(92);
  });

  it("keeps the vantage and bearing optional", () => {
    const { echo, issues } = parseEcho({
      ...minimal(),
      archive: [{ imageKey: "a", credit: "c", rights: "public-domain" }],
    });
    expect(issues).toEqual([]);
    expect(echo?.archive?.[0]?.at).toBeUndefined();
    expect(echo?.archive?.[0]?.bearingDeg).toBeUndefined();
  });

  it("refuses a photograph with no credit", () => {
    // Not a silent skip: showing an archive plate without its credit is the one thing the
    // holding institution asked us not to do, and dropping it quietly turns a licensing
    // obligation into a missing feature nobody notices.
    const { echo, issues } = parseEcho({
      ...minimal(),
      archive: [{ imageKey: "a", credit: "   ", rights: "public-domain" }],
    });
    expect(echo).toBeNull();
    expect(issues.some((i) => i.field === "archive[0].credit")).toBe(true);
  });

  it("refuses a bearing outside the compass", () => {
    // 450 is a typo, not an intention, and an out-of-range bearing sends somebody
    // confidently the wrong way rather than failing where anybody can see it.
    const { echo, issues } = parseEcho({
      ...minimal(),
      archive: [{ imageKey: "a", credit: "c", rights: "public-domain", bearingDeg: 450 }],
    });
    expect(echo).toBeNull();
    expect(issues.some((i) => i.field === "archive[0].bearingDeg")).toBe(true);
  });

  it("refuses a half-written vantage", () => {
    const { echo, issues } = parseEcho({
      ...minimal(),
      archive: [{ imageKey: "a", credit: "c", rights: "public-domain", at: { lat: 40.7 } }],
    });
    expect(echo).toBeNull();
    expect(issues.some((i) => i.field === "archive[0].at")).toBe(true);
  });

  it("leaves the field off entirely when there is no archive", () => {
    const { echo } = parseEcho(minimal());
    expect(echo).not.toBeNull();
    expect("archive" in echo!).toBe(false);
  });
});

describe("attractions", () => {
  it("is read at all", () => {
    const { echo, issues } = parseEcho({
      ...minimal(),
      attraction: { name: "Federal Hall", at: { lat: 40.7073, lng: -74.01 }, rating: 4.6 },
    });
    expect(issues).toEqual([]);
    expect(echo?.attraction?.name).toBe("Federal Hall");
    expect(echo?.attraction?.rating).toBe(4.6);
  });

  it("refuses one with no position", () => {
    // Save-for-later is a promise made on the strength of this field; an echo that lost it
    // silently offers a button that goes nowhere.
    const { echo, issues } = parseEcho({ ...minimal(), attraction: { name: "Federal Hall" } });
    expect(echo).toBeNull();
    expect(issues.some((i) => i.field === "attraction.at")).toBe(true);
  });
});
