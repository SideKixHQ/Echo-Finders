import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// The engine from source, as the prototype and `tsconfig.api.json` see it: the root test run
// comes before the engine is built, so its `dist` may not exist yet.
export default defineConfig({
  resolve: {
    alias: {
      "@echofinders/core": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)),
    },
  },
  test: { include: ["test/api/**/*.test.ts"], root: fileURLToPath(new URL("../..", import.meta.url)) },
});
