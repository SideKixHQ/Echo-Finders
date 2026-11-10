/**
 * The echoes this device has saved, across every journey and every reload.
 *
 * Save lived in App's memory: a reload lost it, and switching journeys cleared it, because
 * it shared a set with the plan's picks (what autoplay is allowed to play), which do belong
 * to one journey. Saved is its own list now, kept here; the picks stay in App.
 *
 * Device-local, like the routes and the heard count (`routes-store.ts`, `heard-store.ts`):
 * there is no account yet, and clearing the browser loses it.
 */

const KEY = "echo-finders:saved";

export function readSaved(): ReadonlySet<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

export function writeSaved(saved: ReadonlySet<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...saved]));
  } catch {
    /* Kept for this session only. */
  }
}

/** Save it, or unsave it if it was saved. */
export function toggleSaved(current: ReadonlySet<string>, echoId: string): ReadonlySet<string> {
  const next = new Set(current);
  if (next.has(echoId)) next.delete(echoId);
  else next.add(echoId);
  return next;
}
