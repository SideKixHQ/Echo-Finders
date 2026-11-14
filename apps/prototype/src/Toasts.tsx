/**
 * How people learn and see syncing: three toasts and a one time explainer.
 *
 * The design (approved 2026-11-10, the "Toasts", "Nearby" and "Sync" boards):
 *
 *   A  an echo is close    ember, an orb, the live distance, "Show me" on its own row
 *   B  synced              aqua, a play orb, the echo's title; tapping it plays
 *   C  locked, first tap   indigo, a lock, the real sync radius, "Got it" on its own row
 *
 * B replaced the full screen sync card (`Synced.tsx`, gone). That card took the phone for
 * the one moment the product exists for, and it also took it from somebody who was walking:
 * the approved behaviour is quieter, "it syncs, then you tap Play", and the echo stays in
 * My Echoes and on the bar either way.
 *
 * Every toast sits at the top, under the top bar, clear of the tab bar; every one has an
 * ✕; every control is at least 44px. They are announced through one `role="status"` region
 * that App keeps mounted, because a live region that arrives with its content is often
 * not read at all.
 *
 * The rules for when each shows are in `toast-rules.ts`.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/** How long the slide away takes, ms. Matches `toast-out` in theme.css. */
const LEAVE_MS = 220;

/** Leave with a slide rather than vanishing, then tell the owner it has gone. */
function useLeave(onGone: () => void): [boolean, () => void] {
  const [leaving, setLeaving] = useState(false);
  const gone = useRef(onGone);
  gone.current = onGone;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const leave = useCallback(() => {
    if (timer.current) return;
    setLeaving(true);
    timer.current = setTimeout(() => gone.current(), LEAVE_MS);
  }, []);
  return [leaving, leave];
}

function Close({ onClick }: { readonly onClick: () => void }) {
  return (
    <button className="toast-close" onClick={onClick} aria-label="Dismiss">
      <span aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </span>
    </button>
  );
}

function Shell({ kind, leaving, children }: { readonly kind: string; readonly leaving: boolean; readonly children: ReactNode }) {
  return <div className={`toast toast-${kind}${leaving ? " toast-leaving" : ""}`}>{children}</div>;
}

/** A: an echo is close. Slides away after `showMs` by itself. */
export function NearToast({
  distance,
  title,
  showMs,
  onShow,
  onClose,
}: {
  /** Live, already worded: "80 m". */
  readonly distance: string;
  readonly title: string;
  readonly showMs: number;
  readonly onShow: () => void;
  readonly onClose: () => void;
}) {
  const [leaving, leave] = useLeave(onClose);
  useEffect(() => {
    const t = setTimeout(leave, showMs);
    return () => clearTimeout(t);
  }, [leave, showMs]);
  return (
    <Shell kind="near" leaving={leaving}>
      <span className="toast-orb" aria-hidden="true" />
      <span className="toast-words">
        <b>An echo is close · {distance}</b>
        <span>Walk over to hear it</span>
      </span>
      <Close onClick={leave} />
      <span className="toast-row">
        <button className="toast-act toast-act-go" onClick={onShow} aria-label={`Show me: ${title}`}>
          Show me
        </button>
      </span>
    </Shell>
  );
}

/**
 * B: arrived, and it synced. Tapping it plays.
 *
 * And, when there is one, where to go next on its own row (James, 2026-11-10, bringing
 * back the old card's Next): it opens that echo's card and centres the map on it. It
 * does not start directions; the card's own button does that.
 */
export function SyncedToast({
  title,
  next,
  onPlay,
  onClose,
}: {
  readonly title: string;
  readonly next?: { readonly label: string; readonly title: string; readonly onGo: () => void } | null;
  readonly onPlay: () => void;
  readonly onClose: () => void;
}) {
  const [leaving, leave] = useLeave(onClose);
  return (
    <Shell kind={next ? "synced toast-has-next" : "synced"} leaving={leaving}>
      <button className="toast-play" onClick={onPlay} aria-label={`Synced. Play: ${title}`}>
        <span className="toast-orb toast-orb-play" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
        <span className="toast-words">
          <b>Synced · tap to play</b>
          <span>{title}</span>
        </span>
      </button>
      <Close onClick={leave} />
      {next && (
        <span className="toast-row">
          <button className="toast-act toast-act-next" onClick={next.onGo} aria-label={`${next.label}: ${next.title}`}>
            {next.label}
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </span>
      )}
    </Shell>
  );
}

/** How long "Saved to My echoes" stays, ms: long enough to read, gone before it is in the way. */
export const SAVED_SHOW_MS = 3200;

/**
 * Saved: where it went. Save said "Saved" and nothing said where, and My Echoes did not
 * show it, so a saved echo looked like it had gone nowhere. Slides away by itself.
 */
export function SavedToast({
  title,
  showMs,
  onClose,
}: {
  readonly title: string;
  readonly showMs: number;
  readonly onClose: () => void;
}) {
  const [leaving, leave] = useLeave(onClose);
  useEffect(() => {
    const t = setTimeout(leave, showMs);
    return () => clearTimeout(t);
  }, [leave, showMs]);
  return (
    <Shell kind="saved" leaving={leaving}>
      <span className="toast-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      </span>
      <span className="toast-words">
        <b>Saved to My echoes</b>
        <span>{title}</span>
      </span>
      <Close onClick={leave} />
    </Shell>
  );
}

/**
 * "Link copied": Share on a computer, where there is no share sheet and the link goes to
 * the clipboard (`share.ts`). It copied silently, which looked like Share doing nothing.
 * The Saved toast's shape and colours, one line, and it slides away by itself.
 */
export function CopiedToast({ showMs, onClose }: { readonly showMs: number; readonly onClose: () => void }) {
  const [leaving, leave] = useLeave(onClose);
  useEffect(() => {
    const t = setTimeout(leave, showMs);
    return () => clearTimeout(t);
  }, [leave, showMs]);
  return (
    <Shell kind="saved toast-copied" leaving={leaving}>
      <span className="toast-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M12 15V3M8.5 6.5L12 3l3.5 3.5" />
          <path d="M7 10H5v11h14V10h-2" />
        </svg>
      </span>
      <span className="toast-words">
        <b>Link copied</b>
      </span>
      <Close onClick={leave} />
    </Shell>
  );
}

/**
 * The usage counts note, once (approved 2026-11-13, option A): the near toast's shape,
 * an orb, the words, and OK and Settings on their own row, with the ✕ every toast has
 * (James, 2026-11-14), which counts as OK. Each of the three dismisses it for good;
 * Settings also opens Settings at the switch.
 */
export function UsageNoteToast({ onOk, onSettings }: { readonly onOk: () => void; readonly onSettings: () => void }) {
  const [leaving, leave] = useLeave(onOk);
  return (
    <Shell kind="near toast-usage" leaving={leaving}>
      <span className="toast-orb" aria-hidden="true" />
      <span className="toast-words">
        <b>We count visits, not you</b>
        <span>Anonymous usage counts help us improve Echo Finders. Turn them off any time in Settings.</span>
      </span>
      <Close onClick={leave} />
      <span className="toast-row">
        <button className="toast-act toast-act-go" onClick={leave}>
          OK
        </button>
        <button className="toast-act" onClick={onSettings}>
          Settings
        </button>
      </span>
    </Shell>
  );
}

/** C: the first tap on a locked echo, once ever. */
export function LockedToast({ line, onClose }: { readonly line: string; readonly onClose: () => void }) {
  const [leaving, leave] = useLeave(onClose);
  return (
    <Shell kind="locked" leaving={leaving}>
      <span className="toast-lock" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V8a4 4 0 018 0v3" />
        </svg>
      </span>
      <span className="toast-words">
        <b>Echoes unlock where they happened</b>
        <span>{line}</span>
      </span>
      <Close onClick={leave} />
      <span className="toast-row">
        <button className="toast-act toast-act-ok" onClick={leave}>
          Got it
        </button>
      </span>
    </Shell>
  );
}

/**
 * "How echoes unlock": once, after first run.
 *
 * Its own full screen layer, over the map at the first run's height, with one button. The
 * audits press its Got it right after the first run (`.how-go`).
 */
export function HowEchoesUnlock({ onDone }: { readonly onDone: () => void }) {
  return (
    <div className="how" role="dialog" aria-modal="true" aria-labelledby="how-title">
      <div className="how-body">
        <h1 id="how-title">How echoes unlock</h1>
        <p className="how-lede">Every echo plays where it happened.</p>
        <ol className="how-steps">
          <li className="how-step how-step-far">
            <span className="how-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V8a4 4 0 018 0v3" />
              </svg>
            </span>
            <span className="how-say">
              <b>Far away</b>
              <span>Locked. Tap Walk there to go.</span>
            </span>
          </li>
          <li className="how-step how-step-close">
            <span className="how-mark" aria-hidden="true">
              <i className="how-ring" />
              <i className="how-orb" />
            </span>
            <span className="how-say">
              <b>Getting close</b>
              <span>The pin glows and buzzes.</span>
            </span>
          </li>
          <li className="how-step how-step-synced">
            <span className="how-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
            <span className="how-say">
              <b>Synced</b>
              <span>Tap Play. It stays in My echoes.</span>
            </span>
          </li>
        </ol>
      </div>
      <button className="how-go" onClick={onDone}>
        Got it
      </button>
    </div>
  );
}
