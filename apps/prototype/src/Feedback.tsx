/**
 * Writing to us: the form, and the two places it lives.
 *
 * Settings › Tell us: a row that opens into the form in place, not a modal. Settings is
 * already a page you scroll, and a form that stays where you found it is one you can leave
 * half-written and come back to.
 *
 * The echo card's "Something wrong with this story?" (`ReportEcho`): the same form in a
 * sheet over the map, already set to a wrong fact and tagged with the echo, because the
 * moment somebody notices a story is wrong is while they are looking at it, and asking them
 * to go to Settings and describe which one is how that report never gets written.
 *
 * Three kinds, because they go to different people (a bug to the code, an idea to the plan,
 * a wrong fact to editorial, which matters most: the library's promise is that it is
 * verified). An email only if they want an answer.
 *
 * Both are hidden when the build has no Sentry DSN, because then there is nowhere to send
 * it, and a form that cannot send is worse than none (`feedback.ts`).
 */

import { useState } from "react";
import type { Echo } from "@echofinders/core";
import { FEEDBACK_KINDS, MAX_MESSAGE, sendFeedback, type FeedbackKind } from "./feedback";

type Status = "idle" | "sending" | "sent" | "failed";

interface FormProps {
  readonly dsn: string | undefined;
  readonly release: string;
  readonly initialKind?: FeedbackKind;
  /** The echo it is about, when sent from its card. */
  readonly echo?: Echo;
  readonly onCancel: () => void;
}

export function FeedbackForm({ dsn, release, initialKind, echo, onCancel }: FormProps) {
  // Nothing chosen unless the place it was opened from knows (the echo card's report link
  // does: it is a wrong fact). A default is an answer most people never change.
  const [kind, setKind] = useState<FeedbackKind | undefined>(initialKind);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  const send = async () => {
    setStatus("sending");
    const ok = await sendFeedback(dsn, release, {
      ...(kind ? { kind } : {}),
      message,
      email,
      ...(echo ? { echo: { id: echo.id, title: echo.title }, source: "echo-card" as const } : {}),
    });
    setStatus(ok ? "sent" : "failed");
    // Kept on failure, so nothing they wrote is lost to a dropped connection.
    if (ok) {
      setMessage("");
      setEmail("");
    }
  };

  if (status === "sent") {
    return (
      <div className="feedback-done" role="status">
        <strong>Thank you. It's with us.</strong>
        <button className="feedback-link" onClick={echo ? onCancel : () => setStatus("idle")}>
          {echo ? "Done" : "Send another"}
        </button>
      </div>
    );
  }

  const prompt =
    kind === "fact"
      ? echo
        ? "What's wrong, and how do you know?"
        : "Which story, and what's wrong?"
      : "What happened, or what would help?";

  return (
    <form
      className="feedback-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (message.trim() && status !== "sending") void send();
      }}
    >
      <fieldset className="feedback-kinds">
        <legend className="sr-only">What is it about?</legend>
        {(Object.keys(FEEDBACK_KINDS) as FeedbackKind[]).map((k) => (
          <label key={k} className={`feedback-kind${kind === k ? " on" : ""}`}>
            <input type="radio" name="feedback-kind" value={k} checked={kind === k} onChange={() => setKind(k)} />
            {FEEDBACK_KINDS[k]}
          </label>
        ))}
      </fieldset>
      <label className="feedback-field">
        <span>{prompt}</span>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={MAX_MESSAGE} rows={5} required />
      </label>
      <label className="feedback-field">
        <span>Your email, if you'd like a reply</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </label>
      {status === "failed" && (
        <p className="feedback-error" role="alert">
          It didn't send, probably the connection. What you wrote is still here; try again.
        </p>
      )}
      <div className="feedback-actions">
        <button type="button" className="feedback-link" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="feedback-send" disabled={!message.trim() || status === "sending"}>
          {status === "sending" ? "Sending…" : "Send"}
        </button>
      </div>
      <p className="feedback-note">
        Sent with the app's version{echo ? " and which story this is" : ""}. Not your location, and
        nothing else about you unless you add your email.
      </p>
    </form>
  );
}

/** Settings › Tell us. */
export function Feedback({ dsn, release }: { readonly dsn: string | undefined; readonly release: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="panel feedback">
      <h3>Tell us</h3>
      {open ? (
        <FeedbackForm dsn={dsn} release={release} onCancel={() => setOpen(false)} />
      ) : (
        <button className="setting-row setting-link" onClick={() => setOpen(true)}>
          <span className="setting-text">
            <strong>Send feedback</strong>
            <small>Something broken, an idea, or a story that got a fact wrong. We read every one.</small>
          </span>
          <svg viewBox="0 0 24 24" aria-hidden="true" className="setting-chev">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </section>
  );
}

/** The echo card's report sheet, over the map, in the place the route picker uses. */
export function ReportEcho({
  echo,
  dsn,
  release,
  onClose,
}: {
  readonly echo: Echo;
  readonly dsn: string | undefined;
  readonly release: string;
  readonly onClose: () => void;
}) {
  return (
    <div className="atr feedback" role="dialog" aria-label={`Report a problem: ${echo.title}`}>
      <div className="atr-head">
        <div className="atr-what">
          <h2>Something wrong?</h2>
          <p>{echo.title}</p>
        </div>
        <button className="pw-close" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div className="report-body">
        <FeedbackForm dsn={dsn} release={release} initialKind="fact" echo={echo} onCancel={onClose} />
      </div>
    </div>
  );
}
