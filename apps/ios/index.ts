/**
 * Which app this build is, decided when the bundle is built.
 *
 *   EXPO_PUBLIC_SHELL=web   the TestFlight test shell: the live web app in a WebView
 *                           (`App.tsx`, `src/WebShell.tsx`). The eas `production` profile
 *                           sets it, so TestFlight keeps the working shell until the native
 *                           app is ready (ADR-0012, amendment of 2026-11-11).
 *   anything else           the native app: Expo Router, from `src/app/_layout.tsx`. The
 *                           `development` and `preview` profiles build this.
 *
 * `EXPO_PUBLIC_*` variables are inlined into the bundle at build time, so this is a build
 * switch, not a runtime one. `require` rather than `import`, because imports are hoisted
 * and would start both.
 */
if (process.env.EXPO_PUBLIC_SHELL === "web") {
  const { registerRootComponent } = require("expo") as typeof import("expo");
  const App = (require("./App") as typeof import("./App")).default;
  // registerRootComponent calls AppRegistry.registerComponent('main', () => App).
  registerRootComponent(App);
} else {
  require("expo-router/entry");
}
