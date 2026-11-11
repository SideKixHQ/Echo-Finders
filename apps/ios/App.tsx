/**
 * The iPhone app (ADR-0012), on the same engine as the web app.
 *
 * For now it renders the TestFlight test shell, the live web app in a WebView (ADR-0012,
 * amendment of 2026-11-11). The native screens replace `WebShell` here, one at a time, and
 * the shell is deleted when they have. It never goes to the App Store.
 */
import WebShell from "./src/WebShell";

export default function App() {
  return <WebShell />;
}
