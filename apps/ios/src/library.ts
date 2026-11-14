/**
 * The echo library, the very one the web app plays.
 *
 * There is one generated library: `scripts/build-library.mjs` compiles `content/` into
 * `apps/prototype/src/library.generated.ts`, and this module imports that file in place.
 * No copy, no second export step, so the phone and the web app cannot drift: rebuild the
 * library once and both have it. Metro reaches the file because `metro.config.js` watches
 * `apps/prototype/src`; its one import is `import type`, which Babel erases, so nothing in
 * the web app's dependency tree comes with it.
 *
 * It is the web app's demo copy (editorial status overridden so drafts can play). The
 * native app is in preview builds only, exactly where that copy belongs.
 */
import { Directory, File, Paths } from "expo-file-system";
import type { Echo, AudioRender, Route } from "@echofinders/core";
import { LIBRARY, ROUTES } from "../../prototype/src/library.generated";
import { mergeLibrary, missingIds, parseLibraryFile, shouldFetchLibrary, type LibraryFile } from "./library-file";

/** The library this build was made with. */
export const ECHOES: readonly Echo[] = LIBRARY;

const BUILT: LibraryFile = { echoes: LIBRARY, routes: ROUTES };

// --- The site's library, fetched and kept ---------------------------------------------------
//
// Echoes added after this build was made are on the site (`/library.json`), not in the app.
// The phone fetches that file whenever the app comes on screen (at most every half hour),
// and at once when the page hands over a plan naming an echo the phone does not have, and
// keeps the last good copy in the documents directory, so a launch with no signal still
// knows it. With no copy kept and no signal, the built in library is all there is.

/** Where the site's library is, beside the page the app shows (`shell/logic.ts`). */
const LIBRARY_URL = "https://echo-finders.vercel.app/library.json";

const keptFile = () => new File(new Directory(Paths.document, "library"), "library.json");

function readKept(): LibraryFile | null {
  try {
    const file = keptFile();
    return file.exists ? parseLibraryFile(JSON.parse(file.textSync())) : null;
  } catch {
    return null;
  }
}

function keep(text: string): void {
  try {
    const dir = new Directory(Paths.document, "library");
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    // Written beside it and moved into place, so a copy kept is always whole.
    const tmp = new File(dir, "library.json.tmp");
    if (tmp.exists) tmp.delete();
    tmp.create();
    tmp.writeSync(text);
    tmp.moveSync(keptFile(), { overwrite: true });
  } catch {
    /* Fetched again next time. */
  }
}

let live: LibraryFile = mergeLibrary(BUILT, readKept());
let byId: ReadonlyMap<string, Echo> = new Map(live.echoes.map((echo) => [echo.id, echo]));
const listeners = new Set<() => void>();
const fetching = { lastFetchMs: Number.NEGATIVE_INFINITY, inFlight: false };

/** Every echo the phone knows now: the site's, as last fetched, and the built in ones. */
export function currentEchoes(): readonly Echo[] {
  return live.echoes;
}

/** Every route the phone knows now, the same way. */
export function currentRoutes(): readonly Route[] {
  return live.routes;
}

/** Told when a newer library arrives. Returns how to stop. */
export function onLibraryChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/**
 * Fetch the site's library if it is due, or if `wanted` names an echo the phone lacks.
 * Resolves true when a newer library is now in use.
 */
export async function refreshLibrary(wanted: readonly string[] = []): Promise<boolean> {
  const missing = missingIds(live.echoes, wanted).length > 0;
  if (!shouldFetchLibrary(fetching, Date.now(), missing)) return false;
  fetching.inFlight = true;
  fetching.lastFetchMs = Date.now();
  try {
    const res = await fetch(LIBRARY_URL, { cache: "no-cache" });
    if (!res.ok) return false;
    const text = await res.text();
    const fetched = parseLibraryFile(JSON.parse(text));
    if (!fetched) return false;
    keep(text);
    live = mergeLibrary(BUILT, fetched);
    byId = new Map(live.echoes.map((echo) => [echo.id, echo]));
    for (const listener of listeners) listener();
    return true;
  } catch {
    // No signal, or a file that would not read: the copy kept, or the built in one, holds.
    return false;
  } finally {
    fetching.inFlight = false;
  }
}

/** The same, by id. */
export function currentById(): ReadonlyMap<string, Echo> {
  return byId;
}

export function echoById(id: string | undefined): Echo | undefined {
  return id ? byId.get(id) : undefined;
}

/**
 * Where the rendered narration is served: the web app's own site. `build-library.mjs`
 * copies `content/audio/<id>/<voice>.mp3` to `apps/prototype/public/audio`, and the web
 * app plays it from `/<audioKey>` (`narration.ts`). The phone streams the same file from
 * the same place, so a new render reaches both with one deploy.
 */
export const AUDIO_ORIGIN = "https://echo-finders.vercel.app";

/**
 * The rendered recording for an echo, if it has one. Renders keyed `speech/<id>` are the
 * web app's stand in (the browser reads the script aloud); they are not files, and the
 * phone does not play them.
 */
export function renderedAudio(echo: Echo): (AudioRender & { url: string }) | null {
  const render = echo.renders?.find((r) => r.audioKey.startsWith("audio/"));
  return render ? { ...render, url: `${AUDIO_ORIGIN}/${render.audioKey}` } : null;
}

/** "4 min listen", as the web app says it (`going.ts`). */
export function listenLength(seconds: number): string {
  return `${Math.max(1, Math.round(seconds / 60))} min listen`;
}

/** "350 m away", "2.4 km away", "1,083 km away". */
export function distanceLabel(km: number): string {
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m away`;
  if (km < 9.95) return `${km.toFixed(1)} km away`;
  return `${Math.round(km).toLocaleString("en-US")} km away`;
}
