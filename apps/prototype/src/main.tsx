import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
// The fonts, from our own origin (see index.html): Sora for text, Space Grotesk for figures.
import "@fontsource/sora/400.css";
import "@fontsource/sora/500.css";
import "@fontsource/sora/600.css";
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/500.css";
import "./theme.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
