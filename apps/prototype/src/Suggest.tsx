/**
 * Settings › Know a story? Suggestions from anyone, free.
 *
 * James, 2026-11-09: "Should we have a fun way for users to suggest a place to add echoes or
 * to suggest an echo? Like they know a story or they created one", then "start with
 * suggestions". Three kinds (`SUGGEST_KINDS`):
 *
 * - "I know a story" and "A place you should add" go to editorial research. Nothing a
 *   listener sends is published as it is: it is a lead, checked from scratch (ADR-0013,
 *   "the editorial library stays closed").
 * - "It happened to me here" is the waiting list for Firsthand, echoes told in the
 *   teller's own voice (ADR-0013). Recording is not built yet, so the form says so rather
 *   than pretending the story will play.
 *
 * Where: a name they type, and, only if they tick the box, where they are standing now,
 * asked of the browser at that moment. Nothing about position is sent otherwise.
 * It goes the way feedback goes (`feedback.ts`), tagged so editorial can find it.
 */

import { useState } from "react";
import type { Echo } from "@echofinders/core";
import { MAX_MESSAGE, SUGGEST_KINDS, sendFeedback, type SuggestKind, type SuggestedSpot } from "./feedback";

type Status = "idle" | "sending" | "sent" | "failed";
type Locating = "off" | "asking" | "on" | "refused";

const PROMPTS: Readonly<Record<SuggestKind, { story: string; place: string }>> = {
  story: { story: "What happened there? Who told you, or where did you read it?", place: "Where is it?" },
  place: { story: "What's there, and why should people hear about it?", place: "Which place?" },
  mine: { story: "Tell us what happened. A proposal, a first date, a day you'll never forget.", place: "Where did it happen?" },
};

function here(): Promise<SuggestedSpot> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("no geolocation"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy }),
      reject,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}

interface FormProps {
  readonly dsn: string | undefined;
  readonly release: string;
  readonly onCancel: () => void;
  readonly initialKind?: SuggestKind;
  /** The echo whose card it was opened from: its place is filled in and the story tagged. */
  readonly echo?: Echo;
}

export function SuggestForm({ dsn, release, onCancel, initialKind, echo }: FormProps) {
  const [kind, setKind] = useState<SuggestKind | undefined>(initialKind);
  const [place, setPlace] = useState(echo ? echo.point.place : "");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [at, setAt] = useState<SuggestedSpot | undefined>(undefined);
  const [locating, setLocating] = useState<Locating>("off");
  const [status, setStatus] = useState<Status>("idle");
  /** Whether the last one sent carried an email: the only way we can ever answer it. */
  const [canReply, setCanReply] = useState(false);

  const toggleHere = async (on: boolean) => {
    if (!on) {
      setAt(undefined);
      setLocating("off");
      return;
    }
    setLocating("asking");
    try {
      setAt(await here());
      setLocating("on");
    } catch {
      setAt(undefined);
      setLocating("refused");
    }
  };

  const send = async () => {
    setStatus("sending");
    const ok = await sendFeedback(dsn, release, {
      ...(kind ? { kind } : {}),
      message,
      email,
      place,
      ...(at ? { at } : {}),
      ...(echo ? { echo: { id: echo.id, title: echo.title } } : {}),
      source: "suggest",
    });
    setStatus(ok ? "sent" : "failed");
    if (ok) {
      setCanReply(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()));
      setMessage("");
      setPlace(echo ? echo.point.place : "");
      setEmail("");
      setAt(undefined);
      setLocating("off");
    }
  };

  if (status === "sent") {
    return (
      <div className="feedback-done" role="status">
        <strong>
          {kind === "mine"
            ? canReply
              ? "Thank you. We'll email you when you can record it."
              : "Thank you. It's with us."
            : canReply
              ? "Thank you. We'll look into it, and write if we use it."
              : "Thank you. We'll look into it."}
        </strong>
        <button className="feedback-link" onClick={echo ? onCancel : () => setStatus("idle")}>
          {echo ? "Done" : "Suggest another"}
        </button>
      </div>
    );
  }

  const prompts = PROMPTS[kind ?? "story"];
  const ready = message.trim().length > 0 && (place.trim().length > 0 || at !== undefined);

  return (
    <form
      className="feedback-form suggest-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && status !== "sending") void send();
      }}
    >
      <fieldset className="feedback-kinds">
        <legend className="sr-only">What kind of suggestion?</legend>
        {(Object.keys(SUGGEST_KINDS) as SuggestKind[]).map((k) => (
          <label key={k} className={`feedback-kind${kind === k ? " on" : ""}`}>
            <input type="radio" name="suggest-kind" value={k} checked={kind === k} onChange={() => setKind(k)} />
            {SUGGEST_KINDS[k]}
          </label>
        ))}
      </fieldset>
      {kind === "mine" && (
        <p className="suggest-note">
          Soon you'll be able to record moments like this in your own voice, right where they
          happened. Leave your email below and we'll tell you when.
        </p>
      )}
      <label className="feedback-field">
        <span>{prompts.place}</span>
        <input type="text" value={place} onChange={(e) => setPlace(e.target.value)} maxLength={200} placeholder="A street, a building, a bench" />
      </label>
      <label className="suggest-here">
        <input type="checkbox" checked={locating === "on" || locating === "asking"} onChange={(e) => void toggleHere(e.target.checked)} />
        <span>
          {locating === "asking"
            ? "Finding where you are…"
            : locating === "refused"
              ? "Couldn't get your location. Name the place above instead."
              : "I'm standing there now: add my location"}
        </span>
      </label>
      <label className="feedback-field">
        <span>{prompts.story}</span>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={MAX_MESSAGE} rows={5} required />
      </label>
      <label className="feedback-field">
        <span>Your email, if you'd like us to credit you or reply</span>
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
        <button type="submit" className="feedback-send" disabled={!ready || status === "sending"}>
          {status === "sending" ? "Sending…" : "Send"}
        </button>
      </div>
      <p className="feedback-note">
        Sent with what you wrote and the app's version. Your location only if you ticked the box,
        your email only if you typed it. We check every echo before anyone hears it.
      </p>
    </form>
  );
}

/** Settings › Know a story? */
export function Suggest({ dsn, release }: { readonly dsn: string | undefined; readonly release: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="panel feedback suggest">
      <h3>Know an echo?</h3>
      {open ? (
        <SuggestForm dsn={dsn} release={release} onCancel={() => setOpen(false)} />
      ) : (
        <button className="setting-row setting-link" onClick={() => setOpen(true)}>
          <span className="setting-text">
            <strong>Suggest an echo or a place</strong>
            <small>An echo you know, a place we should add, or something that happened to you there.</small>
          </span>
          <svg viewBox="0 0 24 24" aria-hidden="true" className="setting-chev">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </section>
  );
}

/**
 * The same form in a sheet, from an echo's card ("Know more about this place?"), with the
 * place filled in. A story is remembered at the spot, so the ask belongs where the listener
 * is looking at it, not three taps away in Settings. The map's rail was to have one too;
 * James (2026-11-09) held it until it is in the design: "hold the map button".
 */
export function SuggestSheet({
  dsn,
  release,
  echo,
  onClose,
}: {
  readonly dsn: string | undefined;
  readonly release: string;
  readonly echo: Echo;
  readonly onClose: () => void;
}) {
  return (
    <div className="atr feedback" role="dialog" aria-label="Know more about this place?">
      <div className="atr-head">
        <div className="atr-what">
          <h2>Know more about this place?</h2>
          <p>{echo.point.place.split(",")[0]}</p>
        </div>
        <button className="pw-close" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div className="report-body">
        <SuggestForm dsn={dsn} release={release} onCancel={onClose} initialKind="story" echo={echo} />
      </div>
    </div>
  );
}
