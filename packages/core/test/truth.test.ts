import { describe, expect, it } from "vitest";
import { isVerified, truthOf, TRUTH_LABEL, validateEcho } from "../src/index.js";
import { makeEcho } from "./fixtures.js";

describe("the mark a listener sees", () => {
  it("is a true story only once a person has checked it", () => {
    expect(truthOf({ certainty: "documented" }, true)).toBe("true-story");
    expect(truthOf({ certainty: "documented" }, false)).toBe("unverified");
    expect(TRUTH_LABEL.unverified.full).toBe("True story · not yet verified");
  });

  it("calls folklore a legend whatever its status", () => {
    expect(truthOf({ certainty: "legend" }, true)).toBe("legend");
    expect(truthOf({ certainty: "legend" }, false)).toBe("legend");
  });

  it("says when historians disagree, and when it is somebody's memory", () => {
    expect(truthOf({ certainty: "contested" }, false)).toBe("disputed");
    expect(truthOf({ certainty: "testimony" }, false)).toBe("memory");
  });

  it("counts as verified only when approved with its facts checked", () => {
    expect(isVerified({ editorial: "approved", factCheck: "corroborated" })).toBe(true);
    expect(isVerified({ editorial: "approved", factCheck: "single-source" })).toBe(true);
    expect(isVerified({ editorial: "approved", factCheck: "unchecked" })).toBe(false);
    expect(isVerified({ editorial: "draft", factCheck: "corroborated" })).toBe(false);
  });
});

describe("each family held to its own rule", () => {
  const certaintyErrors = (category: "history" | "people" | "arts" | "legend" | "kids", certainty: "documented" | "legend" | "contested") =>
    validateEcho(
      makeEcho({ id: "t", at: { lat: 34.2, lng: -77.9 }, category, certainty, certaintyNote: "note", minAge: 0 }),
    ).filter((i) => i.severity === "error" && i.field === "certainty");

  it("refuses a legend filed as history, people or the arts", () => {
    for (const category of ["history", "people", "arts"] as const) {
      expect(certaintyErrors(category, "legend")).toHaveLength(1);
    }
  });

  it("refuses folklore that claims to be disputed history", () => {
    expect(certaintyErrors("legend", "contested")).toHaveLength(1);
    expect(certaintyErrors("legend", "legend")).toHaveLength(0);
  });

  it("lets a children's echo be either, labelled as what it is", () => {
    expect(certaintyErrors("kids", "legend")).toHaveLength(0);
    expect(certaintyErrors("kids", "documented")).toHaveLength(0);
  });
});
