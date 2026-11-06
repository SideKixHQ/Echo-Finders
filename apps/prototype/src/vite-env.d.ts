/// <reference types="vite/client" />

/** Injected by `vite.config.ts`. See the note there. */
declare const __BUILD_COMMIT__: string;
declare const __BUILD_TIME__: string;

interface ImportMetaEnv {
  /** Sentry DSN for error reports (`error-report.ts`). Unset means reporting is off. */
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_MAP_TILES_URL?: string;
}
