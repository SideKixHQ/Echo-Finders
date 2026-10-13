/**
 * The listener's own routes: named lists of echoes to walk, kept for later.
 *
 * James (2026-10-13): "Let the user create different routes … you can see your plan
 * routes? create routes? delete them, start them all from that screen?" A planned walk
 * (`PlanWalk.tsx`) is made and walked in one go; a route is the same list kept, so it can
 * be built up over days from the map and started when there is time.
 *
 * Device-local, like the saved list and the heard count (`heard-store.ts`): there is no
 * account yet. Clearing the browser loses them.
 */

export interface SavedRoute {
  readonly id: string;
  readonly name: string;
  /** Echo ids, in walking order (`orderStops` from the first one). */
  readonly stops: readonly string[];
  readonly createdAt: number;
}

const KEY = "echo-finders:routes";

function isRoute(r: unknown): r is SavedRoute {
  if (!r || typeof r !== "object") return false;
  const o = r as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    typeof o.createdAt === "number" &&
    Array.isArray(o.stops) &&
    o.stops.every((s) => typeof s === "string")
  );
}

export function readRoutes(): readonly SavedRoute[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isRoute) : [];
  } catch {
    return [];
  }
}

export function writeRoutes(routes: readonly SavedRoute[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(routes));
  } catch {
    /* Kept for this session only. */
  }
}

/** "Route 3": the first number not already taken, so deleting one does not leave a gap. */
export function nextRouteName(routes: readonly SavedRoute[]): string {
  const taken = new Set(routes.map((r) => r.name));
  let n = routes.length + 1;
  for (let i = 1; i <= n; i++) {
    if (!taken.has(`Route ${i}`)) {
      n = i;
      break;
    }
  }
  return `Route ${n}`;
}

export function newRoute(routes: readonly SavedRoute[], stops: readonly string[] = [], name?: string): SavedRoute {
  return {
    id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: name?.trim() || nextRouteName(routes),
    stops,
    createdAt: Date.now(),
  };
}
