import { defineConfig } from "vite";
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

export default defineConfig({
  define: {
    __BUILD_COMMIT__: JSON.stringify(commit()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [react()],
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
