/**
 * The status bar follows the page's theme (overnight item 7): the app's script watches the
 * page's `data-theme` and tells the phone, which shows dark text on the light page.
 */
import { describe, expect, it } from "vitest";
import { parseWebMessage, statusBarStyleFor, themeScript } from "../../apps/ios/src/shell/logic.js";

/** Just enough of a page to run the script: a root with an attribute, an observer, the bridge. */
function page(initial: string | null) {
  let theme = initial;
  let observed: (() => void) | null = null;
  const posted: unknown[] = [];
  const root = {
    getAttribute: (name: string) => (name === "data-theme" ? theme : null),
  };
  const env = {
    document: { documentElement: root },
    window: { ReactNativeWebView: { postMessage: (data: string) => posted.push(parseWebMessage(data)) } },
    MutationObserver: class {
      constructor(callback: () => void) {
        observed = callback;
      }
      observe() {}
    },
  };
  new Function("document", "window", "MutationObserver", themeScript())(env.document, env.window, env.MutationObserver);
  return {
    posted,
    set(next: string) {
      theme = next;
      observed?.();
    },
  };
}

describe("the status bar and the page's theme", () => {
  it("says the theme as the page loads, and each time it changes, once", () => {
    const p = page("dark");
    expect(p.posted).toEqual([{ type: "theme", theme: "dark" }]);
    p.set("light");
    p.set("light");
    p.set("dark");
    expect(p.posted).toEqual([
      { type: "theme", theme: "dark" },
      { type: "theme", theme: "light" },
      { type: "theme", theme: "dark" },
    ]);
  });

  it("reads a page with no theme marked as dark, the app's own", () => {
    expect(page(null).posted).toEqual([{ type: "theme", theme: "dark" }]);
  });

  it("dark text on the light page, light text on the dark", () => {
    expect(statusBarStyleFor("light")).toBe("dark");
    expect(statusBarStyleFor("dark")).toBe("light");
  });

  it("takes only the two themes", () => {
    expect(parseWebMessage(JSON.stringify({ type: "theme", theme: "sepia" }))).toBeNull();
    expect(parseWebMessage(JSON.stringify({ type: "theme" }))).toBeNull();
  });
});
