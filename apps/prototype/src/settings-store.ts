/**
 * The Settings screen's switches, remembered on this phone.
 *
 * They were not. `App.tsx` held them in `useState` from their defaults, so every one of
 * them reset on a reload: a listener who turned on "Remember where I stood" found it off
 * the next visit, and, worse, a parent who turned on Kids mode found the whole library,
 * true crime included, back after the phone reloaded the page (James, 2026-11-06: "fix the
 * privacy switches so they survive a reload").
 *
 * One key for the lot, read once before the first render so nothing flashes the defaults.
 * Every field is checked rather than trusted: this is storage a person can edit, and a
 * missing or mistyped field falls back to its default, so a setting added later starts
 * from its default on phones that saved before it existed.
 *
 * Error reports keep their own key (`error-report.ts`): that switch must be readable before
 * the app renders, which is when reporting starts.
 */

import { PRIVACY_DEFAULTS, type PrivacySettings } from "@echofinders/core";

const KEY = "echo-finders:settings";

export interface Settings {
  readonly privacy: PrivacySettings;
  readonly kids: boolean;
  readonly theme: "dark" | "light";
}

export const SETTINGS_DEFAULTS: Settings = { privacy: PRIVACY_DEFAULTS, kids: false, theme: "dark" };

/** Whatever was saved, field by field, over the defaults. */
export function parseSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== "object") return SETTINGS_DEFAULTS;
  const r = raw as Record<string, unknown>;
  const p = (r["privacy"] && typeof r["privacy"] === "object" ? r["privacy"] : {}) as Record<string, unknown>;
  const privacy = Object.fromEntries(
    (Object.keys(PRIVACY_DEFAULTS) as (keyof PrivacySettings)[]).map((k) => [
      k,
      typeof p[k] === "boolean" ? p[k] : PRIVACY_DEFAULTS[k],
    ]),
  ) as unknown as PrivacySettings;
  return {
    privacy,
    kids: typeof r["kids"] === "boolean" ? r["kids"] : SETTINGS_DEFAULTS.kids,
    theme: r["theme"] === "light" || r["theme"] === "dark" ? r["theme"] : SETTINGS_DEFAULTS.theme,
  };
}

export function readSettings(): Settings {
  try {
    return parseSettings(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    // Blocked storage or a corrupt value: the defaults, which are the private choices.
    return SETTINGS_DEFAULTS;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* Private browsing: the switches still work, for this visit only. */
  }
}
