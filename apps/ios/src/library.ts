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
import type { Echo, AudioRender } from "@echofinders/core";
import { LIBRARY } from "../../prototype/src/library.generated";

export const ECHOES: readonly Echo[] = LIBRARY;

const BY_ID: ReadonlyMap<string, Echo> = new Map(ECHOES.map((echo) => [echo.id, echo]));

export function echoById(id: string | undefined): Echo | undefined {
  return id ? BY_ID.get(id) : undefined;
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
