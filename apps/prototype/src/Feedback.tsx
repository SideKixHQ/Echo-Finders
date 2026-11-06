/**
 * Settings › Tell us: the one place a listener can write to us.
 *
 * A row that opens into a short form in place, not a modal: Settings is already a page you
 * scroll, and a form that stays where you found it is one you can leave half-written and
 * come back to. Three kinds, because they go to different people (a bug to the code, an
 * idea to the plan, a wrong fact to editorial, which matters most: the library's promise is
 * that it is verified). An email only if they want an answer.
 *
 * Hidden when the build has no Sentry DSN, because then there is nowhere to send it, and a
 * form that cannot send is worse than none (`feedback.ts`).
 */

import { useState } from "react";
import { FEEDBACK_KINDS, MAX_MESSAGE, sendFeedback, type FeedbackKind } from "./feedback";

type Status = "idle" | "sending" | "sent" | "failed";

export function Feedback({ dsn, release }: { readonly dsn: string | undefined; readonly release: string }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>("broken");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  const send = async () => {
    setStatus("sending");
    const ok = await sendFeedback(dsn, release, { kind, message, email });
    setStatus(ok ? "sent" : "failed");
    // Kept on failure, so nothing they wrote is lost to a dropped connection.
    if (ok) {
      setMessage("");
      setEmail("");
    }
  };

  return (
    <section className="panel feedback">
      <h3>Tell us</h3>
      {!open ? (
        <button
          className="setting-row setting-link"
          onClick={() => {
            setOpen(true);
            setStatus("idle");
          }}
        >
          <span className="setting-text">
            <strong>Send feedback</strong>
            <small>Something broken, an idea, or a story that got a fact wrong. We read every one.</small>
          </span>
          <svg viewBox="0 0 24 24" aria-hidden="true" className="setting-chev">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      ) : status === "sent" ? (
        <div className="feedback-done" role="status">
          <strong>Thank you. It's with us.</strong>
          <button className="feedback-link" onClick={() => setStatus("idle")}>
            Send another
          </button>
        </div>
      ) : (
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
            <span>{kind === "fact" ? "Which story, and what's wrong?" : "What happened, or what would help?"}</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={MAX_MESSAGE}
              rows={5}
              required
            />
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
            <button type="button" className="feedback-link" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="feedback-send" disabled={!message.trim() || status === "sending"}>
              {status === "sending" ? "Sending…" : "Send"}
            </button>
          </div>
          <p className="feedback-note">
            Sent with the app's version. Not your location, and nothing else about you unless you
            add your email.
          </p>
        </form>
      )}
    </section>
  );
}
