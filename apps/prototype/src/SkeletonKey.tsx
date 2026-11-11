/**
 * Settings › Skeleton key: an owner or tester code typed inside the app.
 *
 * James (2026-11-11): the home-screen icon on his iPhone never got owner mode, because the
 * icon keeps its own storage and cookies apart from Safari and has no address bar for the
 * owner link. Everyone sees this row, so he asked for "something fun": a skeleton key opens
 * every door, which is what owner mode does, and to anyone without a code it reads as a
 * small secret rather than a broken feature.
 *
 * The check is the server's (`api/owner.ts` via `claimWithCode`), the same as the link.
 */

import { useState } from "react";
import { claimWithCode, type AccessRole, type KeyResult } from "./owner";

export function SkeletonKey({ onUnlocked }: { readonly onUnlocked: (role: AccessRole) => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [state, setState] = useState<"idle" | "trying" | KeyResult>("idle");

  const tryKey = async () => {
    setState("trying");
    const result = await claimWithCode(code);
    setState(result);
    if (result === "owner" || result === "tester") {
      setCode("");
      onUnlocked(result);
    }
  };

  return (
    <section className="panel feedback skeleton-key">
      <h3>Skeleton key</h3>
      {open ? (
        <form
          className="feedback-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim() && state !== "trying") void tryKey();
          }}
        >
          <label className="feedback-field">
            <span>Your key</span>
            <input
              type="text"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (state === "wrong" || state === "offline") setState("idle");
              }}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={200}
              autoFocus
            />
          </label>
          {state === "wrong" && (
            <p className="feedback-error" role="alert">
              That key doesn't fit this lock.
            </p>
          )}
          {state === "offline" && (
            <p className="feedback-error" role="alert">
              Couldn't check it, probably the connection. Try again in a moment.
            </p>
          )}
          <div className="feedback-actions">
            <button
              type="button"
              className="feedback-link"
              onClick={() => {
                setOpen(false);
                setCode("");
                setState("idle");
              }}
            >
              Cancel
            </button>
            <button type="submit" className="feedback-send" disabled={!code.trim() || state === "trying"}>
              {state === "trying" ? "Turning…" : "Turn the key"}
            </button>
          </div>
        </form>
      ) : (
        <button className="setting-row setting-link" onClick={() => setOpen(true)}>
          <span className="setting-text">
            <strong>Got a key from us?</strong>
            <small>It opens every echo, from anywhere, on this phone.</small>
          </span>
          <svg viewBox="0 0 24 24" aria-hidden="true" className="setting-chev">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </section>
  );
}
