/**
 * Errors from listeners' phones, reported to Sentry.
 *
 * "You cannot reproduce a bug that happened at 35,000 feet" (`docs/01-services.md`), and
 * the same is true of a street in Wilmington. Until now an error on a listener's phone was
 * seen by nobody.
 *
 * No Sentry SDK. The app bundle is already past 500 KB and is read over plane wifi and
 * counted against the offline budgets in `modes.ts`; the SDK would add tens of kilobytes to
 * do what this does in a page: catch uncaught errors and unhandled promise rejections and
 * post each one to Sentry's ingest endpoint.
 *
 * Off unless `VITE_SENTRY_DSN` is set in Vercel. A Sentry DSN is designed to be public (it
 * only allows sending events), but it still lives in the environment, not the repository,
 * so turning reporting on or off is a setting rather than a deploy of new code.
 *
 * Privacy (`docs/privacy-policy.md`): an event carries the error, its stack, the page path
 * without its query string, the build's commit and the browser's user agent. Nothing else:
 * no position, no collection, no identifiers, no IP address stored (`sendDefaultPii` is off
 * by default in Sentry, and no user is attached here).
 *
 * At most a handful of events per session, so a loop that throws on every frame cannot
 * spend the free tier's quota in a minute.
 */

const MAX_EVENTS = 5;

interface Dsn {
  readonly endpoint: string;
  readonly key: string;
}

/** `https://<key>@<host>/<project>` into the endpoint and key Sentry's store API wants. */
export function parseDsn(dsn: string | undefined): Dsn | null {
  if (!dsn) return null;
  const m = /^https:\/\/([^@/]+)@([^/]+)\/(\d+)\s*$/.exec(dsn.trim());
  if (!m) return null;
  const [, key, host, project] = m;
  return { endpoint: `https://${host}/api/${project}/store/`, key: key! };
}

interface Frame {
  readonly filename?: string;
  readonly function?: string;
  readonly lineno?: number;
  readonly colno?: number;
}

/** A browser stack, as Sentry frames. Oldest frame first, as Sentry expects. */
export function framesOf(stack: string | undefined): Frame[] {
  if (!stack) return [];
  const frames: Frame[] = [];
  for (const line of stack.split("\n")) {
    // Chrome: "    at fn (url:line:col)" or "    at url:line:col"
    // Safari / Firefox: "fn@url:line:col"
    const m =
      /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/.exec(line) ?? /^(.*?)@(.+?):(\d+):(\d+)\s*$/.exec(line);
    if (!m) continue;
    frames.push({
      function: m[1] || "?",
      filename: stripQuery(m[2]!),
      lineno: Number(m[3]),
      colno: Number(m[4]),
    });
  }
  return frames.reverse();
}

function stripQuery(url: string): string {
  const i = url.search(/[?#]/);
  return i < 0 ? url : url.slice(0, i);
}

export function eventFor(error: unknown, release: string, path: string): Record<string, unknown> {
  const err = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Non-Error thrown");
  return {
    platform: "javascript",
    level: "error",
    release,
    environment: "production",
    request: { url: stripQuery(path) },
    exception: {
      values: [
        {
          type: err.name || "Error",
          value: err.message.slice(0, 1000),
          stacktrace: { frames: framesOf(err.stack) },
        },
      ],
    },
  };
}

/**
 * Start reporting. Call once, before the app renders. Does nothing when no DSN is set or
 * the page is not running in a browser.
 */
export function startErrorReporting(dsnValue: string | undefined, release: string): void {
  const dsn = parseDsn(dsnValue);
  if (!dsn || typeof window === "undefined") return;
  let sent = 0;

  const send = (error: unknown) => {
    if (sent >= MAX_EVENTS) return;
    sent++;
    const body = JSON.stringify(eventFor(error, release, window.location.pathname));
    const url = `${dsn.endpoint}?sentry_version=7&sentry_key=${encodeURIComponent(dsn.key)}`;
    // keepalive so an error during page unload still gets out. A failure to report is
    // swallowed: the reporter must never become a second error.
    fetch(url, { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(
      () => undefined,
    );
  };

  window.addEventListener("error", (e) => send(e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => send(e.reason));
}
