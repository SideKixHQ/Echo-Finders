import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

/**
 * Which build this is.
 *
 * "What I see doesn't look updated" is a question nobody could answer: the deploy is
 * silent by design (`vercel.json` sets `github.silent`), the sandbox cannot reach
 * `*.vercel.app` to look, and the app itself said nothing about its own version. So it
 * says it now, on the settings screen, and the answer takes a screenshot rather than an
 * argument.
 *
 * Vercel hands the commit over in the environment; locally, ask git. Neither is fatal if
 * it fails, because a build stamp is not worth failing a build over.
 */
function commit(): string {
  const fromVercel = process.env.VERCEL_GIT_COMMIT_SHA;
  if (fromVercel) return fromVercel.slice(0, 7);
  try {
    return execSync("git rev-parse --short=7 HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

/**
 * `/version.json`, so "is this old?" is one URL rather than an argument.
 *
 * The stamp already existed on the settings screen, which is two taps in from My Echoes
 * and therefore no use at all to somebody staring at a page asking whether it updated.
 * This is a flat file at a fixed address: open https://<the app>/version.json and it says
 * which commit is live and when it was built.
 *
 * It sits alongside the settings stamp rather than replacing it, because they answer
 * slightly different questions. The file says what the SERVER has. The settings line says
 * what the JAVASCRIPT CURRENTLY RUNNING IN THIS TAB is, which is the one that catches a
 * stale cached bundle. Two different answers means a cache, and that is worth being able
 * to tell apart.
 */
function versionFile(): Plugin {
  return {
    name: "echo-finders-version",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify(
          { commit: commit(), builtAt: new Date().toISOString() },
          null,
          2,
        ),
      });
    },
  };
}

/**
 * `/library.json`: the library this build plays, for the iPhone app.
 *
 * With the screen locked the page may not run, so the phone decides itself when an echo
 * is reached, from the page's plan (`apps/ios/src/shell/logic.ts`, `PocketJudge`). It
 * needs each echo's place and radius for that, and the library built into the app only
 * has the echoes that existed when the app was built. So the phone fetches this file and
 * keeps it (`apps/ios/src/library.ts`): an echo added after the build starts on its own
 * too. The same echoes and routes as `library.generated.ts`, nothing more.
 */
function libraryFile(): Plugin {
  return {
    name: "echo-finders-library",
    async generateBundle() {
      const { LIBRARY, ROUTES } = await import("./src/library.generated");
      this.emitFile({
        type: "asset",
        fileName: "library.json",
        source: JSON.stringify({ v: 1, commit: commit(), echoes: LIBRARY, routes: ROUTES }),
      });
    },
  };
}

export default defineConfig({
  define: {
    __BUILD_COMMIT__: JSON.stringify(commit()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [react(), versionFile(), libraryFile()],
  resolve: {
    alias: {
      /**
       * Resolve the engine from source, not from its build output.
       *
       * Without this the prototype imports `packages/core/dist`, which only matches the
       * source if somebody remembered to rebuild — and the failure is silent and
       * spectacularly misleading. It cost an afternoon once already: a newly added option
       * was passed correctly, read correctly, and ignored, because the compiled copy being
       * imported had never heard of it. Typecheck and tests both passed, since one uses
       * source and the other uses `--noEmit`.
       *
       * The published package still ships from `dist`. This only changes how the prototype
       * finds it in development, which is exactly where the two can drift apart.
       */
      "@echofinders/core": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)),
    },
  },
  server: { host: "127.0.0.1", port: 5173 },
});
