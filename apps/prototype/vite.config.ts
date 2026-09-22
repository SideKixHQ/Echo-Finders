import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
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
