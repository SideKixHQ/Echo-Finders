import { describe, expect, it } from "vitest";
import { screenAwake, screenAwakeNote } from "../src/index.js";

const base = { walking: false, playing: false, visible: true, allowed: true };

describe("holding the screen awake", () => {
  it("holds it for a walk, because an echo that opens behind a locked screen is missed", () => {
    expect(screenAwake({ ...base, walking: true })).toEqual({ hold: true, because: "walking" });
  });

  it("holds it while audio plays, because on iOS the audio dies with the screen", () => {
    expect(screenAwake({ ...base, playing: true })).toEqual({ hold: true, because: "listening" });
  });

  it("does not hold it for somebody reading a list in bed", () => {
    expect(screenAwake(base)).toEqual({ hold: false, because: "idle" });
  });

  it("prefers walking over listening, since walking is the stronger claim", () => {
    expect(screenAwake({ ...base, walking: true, playing: true }).because).toBe("walking");
  });

  it("never asks while the page is hidden, where the request can only fail", () => {
    expect(screenAwake({ ...base, walking: true, visible: false }))
      .toEqual({ hold: false, because: "hidden" });
  });

  it("tells somebody who turned it off that it is off, not that the page is hidden", () => {
    expect(screenAwake({ ...base, walking: true, visible: false, allowed: false }).because)
      .toBe("declined");
  });

  it("says out loud which promise it is keeping, and says nothing when it holds nothing", () => {
    expect(screenAwakeNote(screenAwake({ ...base, walking: true })))
      .toBe("Screen staying on so the walk keeps tracking");
    expect(screenAwakeNote(screenAwake({ ...base, playing: true })))
      .toBe("Screen staying on so the audio keeps playing");
    expect(screenAwakeNote(screenAwake(base))).toBe("");
  });
});
