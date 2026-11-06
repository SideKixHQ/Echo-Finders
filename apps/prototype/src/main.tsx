import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { startErrorReporting } from "./error-report";
// The fonts, from our own origin (see index.html): Sora for text, Space Grotesk for figures.
import "@fontsource/sora/400.css";
import "@fontsource/sora/500.css";
import "@fontsource/sora/600.css";
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/500.css";
import "./theme.css";

// Off unless VITE_SENTRY_DSN is set in Vercel (`error-report.ts`, DEPLOY.md).
startErrorReporting(import.meta.env.VITE_SENTRY_DSN, __BUILD_COMMIT__);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
