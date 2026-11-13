import { afterEach, describe, expect, it, vi } from "vitest";
import { COPIED_EVENT, shareText } from "../../apps/prototype/src/share";

const g = globalThis as unknown as { navigator?: unknown; window?: unknown };
const realNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const realWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

function browser(navigator: object) {
  const win = new EventTarget();
  Object.defineProperty(globalThis, "navigator", { value: navigator, configurable: true, writable: true });
  Object.defineProperty(globalThis, "window", { value: win, configurable: true, writable: true });
  const heard = vi.fn();
  win.addEventListener(COPIED_EVENT, heard);
  return heard;
}

afterEach(() => {
  if (realNavigator) Object.defineProperty(globalThis, "navigator", realNavigator);
  else delete g.navigator;
  if (realWindow) Object.defineProperty(globalThis, "window", realWindow);
  else delete g.window;
});

describe("Share on a computer", () => {
  it("copies the link and says so: the app hears it was copied", async () => {
    const writeText = vi.fn(async () => {});
    const heard = browser({ clipboard: { writeText } });
    expect(await shareText("T", "Words", "https://x/?echo=a")).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("Words https://x/?echo=a");
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("a phone's share sheet is not a copy", async () => {
    const share = vi.fn(async () => {});
    const heard = browser({ share, clipboard: { writeText: vi.fn() } });
    expect(await shareText("T", "Words", "https://x")).toBe("shared");
    expect(heard).not.toHaveBeenCalled();
  });

  it("no clipboard, or a refused one, claims nothing", async () => {
    let heard = browser({});
    expect(await shareText("T", "Words")).toBe("none");
    expect(heard).not.toHaveBeenCalled();
    heard = browser({ clipboard: { writeText: vi.fn(async () => { throw new Error("denied"); }) } });
    expect(await shareText("T", "Words")).toBe("none");
    expect(heard).not.toHaveBeenCalled();
  });
});
