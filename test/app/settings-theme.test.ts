import { describe, expect, it } from "vitest";
import { parseSettings } from "../../apps/prototype/src/settings-store";

describe("the theme follows the phone until the listener picks one", () => {
  it("a new phone takes the phone's own setting", () => {
    expect(parseSettings(null, "light")).toMatchObject({ theme: "light", themeChosen: false });
    expect(parseSettings(null, "dark")).toMatchObject({ theme: "dark", themeChosen: false });
  });

  it("a theme the listener picked stays, whatever the phone says", () => {
    expect(parseSettings({ theme: "dark", themeChosen: true }, "light")).toMatchObject({ theme: "dark", themeChosen: true });
    expect(parseSettings({ theme: "light", themeChosen: true }, "dark")).toMatchObject({ theme: "light", themeChosen: true });
  });

  it("an older phone's saved light was a choice, since light was never the default", () => {
    expect(parseSettings({ theme: "light" }, "dark")).toMatchObject({ theme: "light", themeChosen: true });
  });

  it("an older phone's saved dark could have been the default, so it follows the phone", () => {
    expect(parseSettings({ theme: "dark" }, "light")).toMatchObject({ theme: "light", themeChosen: false });
  });

  it("a mistyped theme is not a choice", () => {
    expect(parseSettings({ theme: "blue", themeChosen: true }, "light")).toMatchObject({ theme: "light", themeChosen: false });
  });

  it("leaves the other settings as they were", () => {
    const s = parseSettings({ kids: true, theme: "dark" }, "light");
    expect(s.kids).toBe(true);
  });
});
