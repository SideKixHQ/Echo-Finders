import { describe, expect, it } from "vitest";
import { feedbackEnvelope } from "../../apps/prototype/src/feedback";

const at = new Date("2026-11-09T12:00:00Z");
const payload = (body: string) => JSON.parse(body.split("\n")[2]!);

describe("suggestions", () => {
  it("leads with the kind and the place, and tags the kind", () => {
    const p = payload(feedbackEnvelope({ kind: "story", message: "A ghost in the lane.", place: "Cottage Lane", source: "suggest" }, "abc", "/", at, "1"));
    expect(p.contexts.feedback.message).toBe("[A missing echo] Place: Cottage Lane. A ghost in the lane.");
    expect(p.tags.kind).toBe("story");
    expect(p.contexts.feedback.source).toBe("suggest");
    expect(p.contexts.feedback.at).toBeUndefined();
  });

  it("sends a position only when one was added, rounded to about a metre", () => {
    const p = payload(
      feedbackEnvelope({ kind: "mine", message: "I proposed here.", at: { lat: 34.2359123, lng: -77.9428456, accuracyM: 12.4 }, source: "suggest" }, "abc", "/", at, "1"),
    );
    expect(p.contexts.feedback.at).toEqual({ lat: 34.23591, lng: -77.94285, accuracyM: 12 });
    expect(p.contexts.feedback.message).toBe("[It happened to me here] Place: (34.23591, -77.94285). I proposed here.");
  });

  it("leaves ordinary feedback as it was", () => {
    const p = payload(feedbackEnvelope({ kind: "idea", message: "More ghosts." }, "abc", "/", at, "1"));
    expect(p.contexts.feedback.message).toBe("[An idea] More ghosts.");
    expect(p.contexts.feedback.source).toBe("settings");
  });
});
