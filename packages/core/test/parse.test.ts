import { describe, expect, it } from "vitest";
import { parseEcho } from "../src/content/parse.js";
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
