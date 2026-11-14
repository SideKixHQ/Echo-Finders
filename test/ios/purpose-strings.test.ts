/** The iPhone's location purpose strings, as approved for drives (D6, mock 1, 2026-11-13). */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const app = JSON.parse(readFileSync(new URL("../../apps/ios/app.json", import.meta.url), "utf8"));
const location = app.expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === "expo-location")[1];
const APPROVED =
  "So echoes can start on their own as you reach them, with your phone in your pocket or the screen off, during a hands free walk or drive you start. Echo Finders works without this: keep it on screen and echoes will still open. Your exact location stays on your phone.";

describe("Always location's purpose string", () => {
  it("is the approved words, in both keys", () => {
    expect(location.locationAlwaysAndWhenInUsePermission).toBe(APPROVED);
    expect(location.locationAlwaysPermission).toBe(APPROVED);
  });
});
