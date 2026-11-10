/**
 * When the map is allowed to tell you something, as a toast.
 *
 * Three toasts teach syncing (James, 2026-11-10, the approved sticky note):
 *
 *   A  an echo is close    within 150 m of one you have not heard, once per echo, never
 *                          while one is playing, at most one every five minutes, gone
 *                          after six seconds
 *   B  synced              it syncs, then you tap Play. Replaced the full screen card.
 *   C  locked, first tap   once ever: echoes unlock where they happened
 *
 * The rules are here, pure, so they can be tested without a map or a clock; `Toasts.tsx`
 * draws them and App decides which one has the screen.
 */

import type { Echo, TravelMode } from "@echofinders/core";

/** How close counts as close, for toast A. */
export const NEAR_KM = 0.15;
/** The least time between two "an echo is close" toasts. */
export const NEAR_SPACING_MS = 5 * 60_000;
/** How long toast A stays before it slides away by itself. */
export const NEAR_SHOW_MS = 6_000;

/** What the nearby toast remembers: which echoes it has named, and when it last spoke. */
export interface NearMemory {
  readonly shown: readonly string[];
  readonly lastAt: number | null;
}

export const NO_NEAR_MEMORY: NearMemory = { shown: [], lastAt: null };

export interface NearCandidate {
  readonly echo: Echo;
  readonly distanceKm: number;
  /** Still locked: not synced, not heard. */
  readonly sealed: boolean;
}

/**
 * The echo toast A should name now, or null.
 *
 * Nearest first. An echo you are already inside the radius of is left to sync rather than
 * being told to "walk over" to where you are standing.
 */
export function nearToastFor(
  around: readonly NearCandidate[],
  memory: NearMemory,
  now: number,
  playing: boolean,
  heard: (echoId: string) => boolean = () => false,
): NearCandidate | null {
  if (playing) return null;
  if (memory.lastAt !== null && now - memory.lastAt < NEAR_SPACING_MS) return null;
  const shown = new Set(memory.shown);
  let best: NearCandidate | null = null;
  for (const a of around) {
    if (!a.sealed || heard(a.echo.id) || shown.has(a.echo.id)) continue;
    if (a.distanceKm > NEAR_KM) continue;
    if (a.distanceKm <= a.echo.point.triggerRadiusKm) continue;
    if (!best || a.distanceKm < best.distanceKm) best = a;
  }
  return best;
}

/** Remember that toast A named this echo now. */
export function rememberNear(memory: NearMemory, echoId: string, now: number): NearMemory {
  return { shown: memory.shown.includes(echoId) ? memory.shown : [...memory.shown, echoId], lastAt: now };
}

/** A distance as the toasts say it: "80 m", "1.2 km", "12 km". */
export function toastDistance(km: number): string {
  if (km < 1) return `${Math.max(5, Math.round((km * 1000) / 5) * 5)} m`;
  return km < 10 ? `${km.toFixed(1).replace(/\.0$/, "")} km` : `${Math.round(km)} km`;
}

/** Toast C's second line: the real sync radius, said for the way you are travelling. */
export function unlockLine(echo: Echo, mode: TravelMode): string {
  const km = echo.point.triggerRadiusKm;
  const reach = km < 1 ? `${Math.round(km * 1000)} m` : toastDistance(km);
  return `${mode === "walking" ? "Walk" : "Get"} within ${reach} to unlock it`;
}

const NEAR_KEY = "echo-finders:near-toasts";
export const LOCKED_KEY = "echo-finders:locked-toast";
export const HOW_KEY = "echo-finders:how-echoes-unlock";

export function readNearMemory(): NearMemory {
  try {
    const raw = JSON.parse(localStorage.getItem(NEAR_KEY) ?? "null") as Partial<NearMemory> | null;
    if (!raw || !Array.isArray(raw.shown)) return NO_NEAR_MEMORY;
    return {
      shown: raw.shown.filter((s): s is string => typeof s === "string"),
      lastAt: typeof raw.lastAt === "number" ? raw.lastAt : null,
    };
  } catch {
    return NO_NEAR_MEMORY;
  }
}

export function writeNearMemory(memory: NearMemory): void {
  try {
    localStorage.setItem(NEAR_KEY, JSON.stringify(memory));
  } catch {
    /* Private browsing: the toast may come again next visit, which is the safe side. */
  }
}

/** A flag that is true once set, in this browser. Fails as "not yet". */
export function readFlag(key: typeof LOCKED_KEY | typeof HOW_KEY): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function setFlag(key: typeof LOCKED_KEY | typeof HOW_KEY): void {
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* As above. */
  }
}
