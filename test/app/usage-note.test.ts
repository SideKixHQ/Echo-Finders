import { describe, expect, it } from "vitest";
import { USAGE_NOTE_KEY, showUsageNote } from "../../apps/prototype/src/toast-rules";

const ready = { firstRunDone: true, onMap: true, analyticsOn: true, dismissed: false };

describe("the usage counts note", () => {
  it("shows on the map once the first run is done, while usage counts are on", () => {
    expect(showUsageNote(ready)).toBe(true);
  });
  it("not during the first run or How echoes unlock", () => {
    expect(showUsageNote({ ...ready, firstRunDone: false })).toBe(false);
  });
  it("not off the map", () => {
    expect(showUsageNote({ ...ready, onMap: false })).toBe(false);
  });
  it("not when usage counts are off", () => {
    expect(showUsageNote({ ...ready, analyticsOn: false })).toBe(false);
  });
  it("never again once dismissed, remembered like the other one time flags", () => {
    expect(showUsageNote({ ...ready, dismissed: true })).toBe(false);
    expect(USAGE_NOTE_KEY).toMatch(/^echo-finders:/);
  });
});
