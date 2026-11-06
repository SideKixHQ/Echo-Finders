/**
 * Feedback from listeners, sent to Sentry's User Feedback inbox.
 *
 * James, 2026-11-06: "We should also have a way for users to submit feedback." There was
 * none. The thumbs on an echo (`ratings.ts`) stay on the phone, and the privacy policy has
 * no contact address yet, so a listener with something to say had nowhere to say it.
 *
 * Why Sentry: the app has no backend that keeps anything (`docs/10-blockers.md` #6), and
 * Sentry is already the one service wired for hearing from phones (`error-report.ts`). Its
 * User Feedback inbox is built for exactly this, sits next to the error reports a message
 * may be about, and needs no new account, key or server: the same public DSN, a different
 * kind of item in the same request. When there is a backend, this is the one function to
 * point somewhere else.
 *
 * Not gated by the error-report switch. That switch is about things sent *without* asking;
 * this is a person pressing Send on words they wrote, which is the asking.
 *
 * What goes: what they typed, which kind of feedback it is, the email address if they gave
 * one, the build's commit and the page path. Nothing else: no position, no collection.
 */

import { parseDsn } from "./error-report";

export type FeedbackKind = "broken" | "idea" | "fact";

export const FEEDBACK_KINDS: Readonly<Record<FeedbackKind, string>> = {
  broken: "Something's not working",
  idea: "An idea",
  fact: "A story got something wrong",
};

/** Long enough for a real paragraph, short enough that nobody pastes a book. */
export const MAX_MESSAGE = 2000;

export interface Feedback {
  readonly kind: FeedbackKind;
  readonly message: string;
  readonly email?: string;
  /**
   * The echo it is about, when it was sent from that echo's card ("Something wrong with
   * this story?"). Tagged by id so every report on one echo can be found together, and
   * named in the message so the inbox list says which story without opening it.
   */
  readonly echo?: { readonly id: string; readonly title: string };
  /** Where in the app it was sent from. */
  readonly source?: "settings" | "echo-card";
}

/** Feedback can be sent from this build only when Sentry is configured for it. */
export function feedbackAvailable(dsn: string | undefined): boolean {
  return parseDsn(dsn) !== null;
}

/** A plausible address, or nothing. Not validation: Sentry and a human read it. */
export function cleanEmail(email: string | undefined): string | undefined {
  const e = email?.trim();
  return e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : undefined;
}

function eventId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The request body: a Sentry envelope holding one `feedback` item.
 * https://develop.sentry.dev/sdk/data-model/envelope-items/#user-feedback
 */
export function feedbackEnvelope(
  feedback: Feedback,
  release: string,
  path: string,
  now: Date = new Date(),
  id: string = eventId(),
): string {
  const email = cleanEmail(feedback.email);
  const header = { event_id: id, sent_at: now.toISOString() };
  const item = { type: "feedback" };
  const payload = {
    event_id: id,
    timestamp: now.getTime() / 1000,
    platform: "javascript",
    level: "info",
    release,
    environment: "production",
    tags: { kind: feedback.kind, ...(feedback.echo ? { echo: feedback.echo.id } : {}) },
    contexts: {
      feedback: {
        // The kind leads the message so it reads in the inbox list, where tags do not show.
        message: `[${FEEDBACK_KINDS[feedback.kind]}${feedback.echo ? ` · ${feedback.echo.title}` : ""}] ${feedback.message.trim().slice(0, MAX_MESSAGE)}`,
        ...(email ? { contact_email: email } : {}),
        url: path.replace(/[?#].*$/, ""),
        source: feedback.source ?? "settings",
      },
    },
  };
  return [header, item, payload].map((part) => JSON.stringify(part)).join("\n");
}

/** Send it. Resolves true when Sentry accepted it, false otherwise (offline, refused). */
export async function sendFeedback(
  dsnValue: string | undefined,
  release: string,
  feedback: Feedback,
): Promise<boolean> {
  const dsn = parseDsn(dsnValue);
  if (!dsn || !feedback.message.trim()) return false;
  const url = `${dsn.endpoint.replace(/store\/$/, "envelope/")}?sentry_version=7&sentry_key=${encodeURIComponent(dsn.key)}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      // No Content-Type: a string body goes as text/plain, which needs no CORS preflight,
      // as Sentry's own browser SDK sends it. One round trip on a weak signal, not two.
      body: feedbackEnvelope(feedback, release, window.location.pathname),
    });
    return res.ok;
  } catch {
    return false;
  }
}
