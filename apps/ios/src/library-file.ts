/**
 * The library as the site serves it now (`/library.json`, emitted by the web app's build,
 * `apps/prototype/vite.config.ts`), the pure half of `library.ts`.
 *
 * The app is built with the library of its day. The page it shows is the site's, so it
 * knows echoes added since; with the screen locked the phone decides arrival itself
 * (`PocketJudge`), and it can only decide for echoes it has. So the phone fetches the
 * site's library, keeps it, and uses it beside the one it was built with.
 *
 * Nothing here touches the network or the disk, so the root suite tests it
 * (`test/ios/library-file.test.ts`).
 */
import type { Echo, Route } from "@echofinders/core";

/** The file's shape. `v` is bumped if it ever changes. */
export const LIBRARY_FILE_VERSION = 1;

export interface LibraryFile {
  readonly echoes: readonly Echo[];
  readonly routes: readonly Route[];
}

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Enough of an echo for the phone to find it and play it: an id, a place, a radius. */
function isEcho(v: unknown): v is Echo {
  if (!record(v) || typeof v["id"] !== "string" || typeof v["title"] !== "string") return false;
  const point = v["point"];
  if (!record(point) || !record(point["at"]) || !finite(point["triggerRadiusKm"])) return false;
  const at = point["at"];
  if (!finite(at["lat"]) || !finite(at["lng"])) return false;
  const renders = v["renders"];
  return renders === undefined || Array.isArray(renders);
}

function isRoute(v: unknown): v is Route {
  return record(v) && typeof v["id"] === "string" && typeof v["mode"] === "string" && record(v["origin"]) && record(v["destination"]);
}

/**
 * The file as fetched or as kept, if it is one. A file that is not, or not this version,
 * is refused whole; an odd echo or route in a good file is left out, the rest kept.
 */
export function parseLibraryFile(raw: unknown): LibraryFile | null {
  if (!record(raw) || raw["v"] !== LIBRARY_FILE_VERSION) return null;
  const echoes = raw["echoes"];
  const routes = raw["routes"];
  if (!Array.isArray(echoes) || !Array.isArray(routes)) return null;
  const goodEchoes = echoes.filter(isEcho);
  if (goodEchoes.length === 0) return null;
  return { echoes: goodEchoes, routes: routes.filter(isRoute) };
}

/**
 * The library to use: the site's, plus anything only the built in one has. The site's
 * copy wins for an echo both have, since it is the newer telling. An echo the site has
 * since dropped stays known, which costs nothing: the phone only plays what the page's
 * plan names, and the page has the site's library.
 */
export function mergeLibrary(built: LibraryFile, fetched: LibraryFile | null): LibraryFile {
  if (!fetched) return built;
  const echoIds = new Set(fetched.echoes.map((e) => e.id));
  const routeIds = new Set(fetched.routes.map((r) => r.id));
  return {
    echoes: [...fetched.echoes, ...built.echoes.filter((e) => !echoIds.has(e.id))],
    routes: [...fetched.routes, ...built.routes.filter((r) => !routeIds.has(r.id))],
  };
}

/** Ids a plan names that this library does not have: worth fetching the site's library for. */
export function missingIds(library: readonly Echo[], ids: readonly string[]): string[] {
  const known = new Set(library.map((e) => e.id));
  return ids.filter((id) => !known.has(id));
}

/** How long a fetched library is fresh enough not to fetch again, unless an echo is missing. */
export const LIBRARY_REFRESH_MS = 30 * 60 * 1000;

/** The least time between two fetches, even when the plan names an echo we lack. */
export const LIBRARY_RETRY_MS = 60 * 1000;

/**
 * Fetch again? Never twice at once; when stale; or soon when the plan names an echo we
 * lack (not more than once a minute, so an echo the site has not served yet costs one
 * request a minute, not one per plan).
 */
export function shouldFetchLibrary(state: { readonly lastFetchMs: number; readonly inFlight: boolean }, nowMs: number, missing: boolean): boolean {
  if (state.inFlight) return false;
  const since = nowMs - state.lastFetchMs;
  return since >= (missing ? LIBRARY_RETRY_MS : LIBRARY_REFRESH_MS);
}
