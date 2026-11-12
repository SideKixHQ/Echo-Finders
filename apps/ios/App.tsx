/**
 * The iPhone app (ADR-0012), on the same engine as the web app.
 *
 * The TestFlight test shell, the live web app in a WebView (ADR-0012, amendment of
 * 2026-11-11). `index.ts` starts it only when the bundle is built with
 * `EXPO_PUBLIC_SHELL=web` (the eas `production` profile); every other build starts the
 * native app in `src/app/`. The shell is deleted once the native app is ready. It never
 * goes to the App Store.
 */
import WebShell from "./src/WebShell";

export default function App() {
  return <WebShell />;
}
