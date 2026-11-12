import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// The engine from source, as the prototype and `tsconfig.api.json` see it: the root test run
// comes before the engine is built, so its `dist` may not exist yet.
//
// Compiler settings are given here rather than read from each file's tsconfig.json. The
// iPhone app's tsconfig extends `expo/tsconfig.base`, which exists only once apps/ios has its
// own dependencies installed; CI does not install them, so reading it failed every test that
// imports apps/ios source (test/ios). A string `tsconfigRaw` tells Vite not to look one up.
export default defineConfig({
  esbuild: { tsconfigRaw: JSON.stringify({ compilerOptions: { target: "es2022", useDefineForClassFields: true, verbatimModuleSyntax: false } }) },
  resolve: {
    alias: {
      "@echofinders/core": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)),
    },
  },
  test: { include: ["test/api/**/*.test.ts", "test/app/**/*.test.ts", "test/ios/**/*.test.ts"], root: fileURLToPath(new URL("../..", import.meta.url)) },
});
