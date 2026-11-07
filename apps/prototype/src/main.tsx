import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { SENTRY_DSN, startErrorReporting } from "./error-report";
import { startAnalytics } from "./analytics";
// The fonts, from our own origin (see index.html): Sora for text, Space Grotesk for figures.
import "@fontsource/sora/400.css";
import "@fontsource/sora/500.css";
import "@fontsource/sora/600.css";
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/500.css";
import "./theme.css";

// Sends nothing until the listener turns on Settings › Privacy › Send error reports
// (`error-report.ts`, DEPLOY.md).
startErrorReporting(SENTRY_DSN, __BUILD_COMMIT__);

// Anonymous counts, on unless Settings › Privacy › Anonymous usage statistics is off
// (`analytics.ts`, DEPLOY.md).
startAnalytics();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
