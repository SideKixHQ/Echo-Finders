/**
 * Which journey you were on, so the app reopens on it.
 *
 * James (2026-10-09): "can the app load to where ever i am?" It could not. Every load
 * started on the Lower Manhattan demo walk, so "Around here" was three taps away every
 * time, and coming back from Stripe's checkout (a full page load) dropped somebody mid-walk
 * in Manhattan. Now the journey is kept, and with nothing kept the app opens on "Around
 * here": wherever you are, on foot.
 *
 * Unreadable or out of date (a route since removed) counts as nothing kept. A bad value
 * should cost a tap, never a white screen.
 */

export type Travel = "walking" | "driving" | "flight";

export interface KeptJourney {
  readonly roaming: boolean;
  readonly travel: Travel;
  readonly routeId: string | null;
}

const KEY = "echo-finders:journey";

/** Where a new listener starts: here, on foot. */
export const AROUND_HERE: KeptJourney = { roaming: true, travel: "walking", routeId: null };

export function readJourney(routeIds: ReadonlySet<string>): KeptJourney {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<KeptJourney> | null;
    if (!raw || typeof raw !== "object") return AROUND_HERE;
    const travel: Travel = raw.travel === "driving" || raw.travel === "flight" ? raw.travel : "walking";
    const routeId = typeof raw.routeId === "string" && routeIds.has(raw.routeId) ? raw.routeId : null;
    // A route that no longer exists, or a flight with none chosen, has nothing to reopen.
    if (!raw.roaming && !routeId) return AROUND_HERE;
    if (travel === "flight" && !routeId) return AROUND_HERE;
    return { roaming: raw.roaming === true && travel !== "flight", travel, routeId };
  } catch {
    return AROUND_HERE;
  }
}

export function keepJourney(journey: KeptJourney): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(journey));
  } catch {
    /* This session only. */
  }
}
