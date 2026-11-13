/**
 * Privacy.
 *
 * Its own screen rather than a row in settings, because the choices here are the ones a
 * person should be able to find without hunting, and because two of them delete data the
 * moment they are switched off.
 *
 * Every control says what is *lost* by turning it off. A switch whose consequence is
 * unclear is not really a choice. (The "What works right now" ON/OFF table that listed the
 * engine's `featureAvailability` was taken off this screen, 2026-11-10: it was a developer's
 * view of the app, and each switch already says what turning it off costs.)
 */

import { useState, type ReactNode } from "react";
import type { PrivacySettings } from "@echofinders/core";
import { SENTRY_DSN, errorReportsAllowed, setErrorReportsAllowed } from "./error-report";
import { Feedback } from "./Feedback";
import { Suggest } from "./Suggest";
import { feedbackAvailable } from "./feedback";
import { forgetOnServer, type AccessRole } from "./owner";
import { SkeletonKey } from "./SkeletonKey";

interface Props {
  readonly settings: PrivacySettings;
  readonly onChange: (next: PrivacySettings) => void;
  readonly storedPositions: number;
  readonly collectionSize: number;
  readonly onDelete: (what: "positions" | "everything") => void;
  /** Open the journey screen: how you are travelling, and which journey. */
  readonly onJourney: () => void;
  /** What it currently says, so the row reports rather than only offering. */
  readonly journey: string;
  /**
   * Kids mode and the theme, which used to sit on the map's control column.
   *
   * They are settings. One narrows the library through the engine's age gate and the
   * other repaints the whole app, and neither is a thing you do TO the map in front of
   * you, which is what the rest of that column is for. Parked there they also cost the
   * column two of its six slots, and six was the count that pushed the top button
   * through the category chips.
   */
  readonly kids: boolean;
  readonly onKids: (on: boolean) => void;
  readonly theme: "dark" | "light";
  /** Owner mode is on (`owner.ts`), with the way to turn it off. */
  readonly owner?: boolean;
  /** It is tester mode rather than the owner's own phone: the same, named for what it is. */
  readonly tester?: boolean;
  readonly onOwnerOff?: () => void;
  /** A key typed into Settings › Skeleton key was right (`SkeletonKey.tsx`). */
  readonly onUnlocked?: (role: AccessRole) => void;
  readonly onTheme: (theme: "dark" | "light") => void;
  /** Settings › Membership, first: what you have is the first thing anybody looks for here. */
  readonly membership?: ReactNode;
  /** Inside the iPhone app only: open its Offline echoes screen (D9). Absent in a browser. */
  readonly onOfflineEchoes?: (() => void) | undefined;
}

export function Privacy({
  settings,
  onChange,
  storedPositions,
  collectionSize,
  onDelete,
  onJourney,
  journey,
  kids,
  onKids,
  theme,
  onTheme,
  owner = false,
  tester = false,
  onOwnerOff,
  onUnlocked,
  membership,
  onOfflineEchoes,
}: Props) {
  // Kept by error-report.ts itself, not in PrivacySettings: it has to be readable before
  // the app renders, which is when reporting starts.
  const [errorReports, setErrorReports] = useState(errorReportsAllowed);

  return (
    <div className="screen-body">
      {/* Titled, like every tab. It had no title at all, so it was a page of switches
          that did not say what it was. */}
      <header className="screen-head">
        <h1>Settings</h1>
      </header>
      {membership}
      {/*
        How you are travelling, first, because it is the setting that changes what the app
        *is* rather than what it shows, and because it was unreachable.

        It was asked once during onboarding, on a screen that says "you can switch later",
        and then offered nowhere: the only way back to it was the download icon on the map's
        control column, which nobody would guess and which does not look like a question
        about how you are getting around. Settings is where people look for a setting.
      */}
      <section className="panel">
        <h3>Your journey</h3>
        <button className="setting-row setting-link" onClick={onJourney}>
          <span className="setting-text">
            <strong>{journey}</strong>
            <small>Change how you are travelling, or pick another journey.</small>
          </span>
          <svg viewBox="0 0 24 24" aria-hidden="true" className="setting-chev">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </section>

      {/*
        The two that came off the map. Kids mode first: it is the only setting in the app
        that changes which echoes exist at all.
      */}
      <section className="panel">
        <h3>This app</h3>
        {/* The phone's own screen for what is saved for no signal (D9, mock 3, approved
            2026-11-13). Only the iPhone app can save, so only it has the row. */}
        {onOfflineEchoes && (
          <div className="setting" data-app-only>
            <button className="setting-row setting-link" onClick={onOfflineEchoes}>
              <span className="setting-text">
                <strong>Offline echoes</strong>
                <small>Save a place to your phone and its echoes play with no signal: on a flight, a drive or a walk.</small>
              </span>
              <svg viewBox="0 0 24 24" aria-hidden="true" className="setting-chev">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
        <Toggle
          label="Kids mode"
          detail="Only echoes written for children, and nothing with an age on it."
          cost="Turn off and the whole library comes back, true crime included."
          on={kids}
          onToggle={() => onKids(!kids)}
        />
        <Toggle
          label="Dark map"
          detail="A night map, which is what the app is drawn for. Follows your phone until you switch it here."
          cost="Turn off for the daylight map, which is easier in bright sun."
          on={theme === "dark"}
          onToggle={() => onTheme(theme === "dark" ? "light" : "dark")}
        />
      </section>

      <header className="screen-head">
        <h1>Privacy</h1>
        <p>Everything here is on your device. None of it is sent to us.</p>
      </header>

      {/*
        Back to what this setting actually buys: background location. Whether echoes then
        *talk* is a separate question, asked in Plan — conflating the two meant a listener
        could not have a phone collecting in their pocket without also agreeing to be
        narrated at.
      */}
      <Toggle
        label="Hands-free"
        detail="Echoes open with your phone pocketed and the screen off."
        cost="Turn off and echoes still open. You just keep the app on screen while you travel."
        on={settings.handsFree}
        onToggle={() => onChange({ ...settings, handsFree: !settings.handsFree })}
      />

      <Toggle
        label="Remember where I stood"
        detail="Turns your collection into a personal map of where you have been."
        cost={
          storedPositions > 0
            ? `Turning this off deletes ${storedPositions} saved position${storedPositions === 1 ? "" : "s"} now. Your collection stays.`
            : "Off by default. This is the only thing here that is about you rather than about a place."
        }
        on={settings.recordPrecisePlaces}
        onToggle={() =>
          onChange({ ...settings, recordPrecisePlaces: !settings.recordPrecisePlaces })
        }
      />

      <Toggle
        label="Keep my collection"
        detail="Records which echoes you synced, and when."
        cost="Turn off and echoes still open as you walk. Nothing is kept afterwards."
        on={settings.keepCollection}
        onToggle={() => onChange({ ...settings, keepCollection: !settings.keepCollection })}
      />

      <Toggle
        label="Anonymous usage statistics"
        detail="How many people visit and play echoes. Never who, and never where you are."
        cost="On unless you turn it off. No cookies, nothing that identifies you."
        on={settings.analytics}
        onToggle={() => onChange({ ...settings, analytics: !settings.analytics })}
      />

      <Toggle
        label="Send error reports"
        detail="When something breaks, what broke and in which version. Never where you are."
        cost="Off by default. Turn on and a crash on your phone is one we can fix."
        on={errorReports}
        onToggle={() => {
          setErrorReportsAllowed(!errorReports);
          setErrorReports(!errorReports);
        }}
      />

      {owner && onOwnerOff && (
        <section className="panel">
          <h3>{tester ? "Tester mode" : "Owner mode"}</h3>
          <button className="danger-row policy-row" onClick={onOwnerOff}>
            <span>On: every echo unlocked, and playable from anywhere</span>
            <small>
              Only on this phone. Tap to turn it off; your key turns it back on, here under
              Skeleton key or from your link.
            </small>
          </button>
        </section>
      )}

      <section className="panel panel-danger">
        <h3>Your data</h3>
        <a className="danger-row policy-row" href="https://echofinders.com/privacy" target="_blank" rel="noreferrer">
          <span>Privacy policy</span>
          <small>What we collect, why, and how to turn each part off.</small>
        </a>
        <a className="danger-row policy-row" href="https://echofinders.com/terms" target="_blank" rel="noreferrer">
          <span>Terms of service</span>
          <small>Passes, renewals, safety and accuracy, in plain words.</small>
        </a>
        <a className="danger-row policy-row" href="https://echofinders.com/refunds" target="_blank" rel="noreferrer">
          <span>Refund policy</span>
          <small>When we refund a pass, and how to ask.</small>
        </a>
        <button className="danger-row" onClick={() => onDelete("positions")}>
          <span>Delete my positions</span>
          <small>Removes every saved standing position. Keeps your collection.</small>
        </button>
        <button className="danger-row" onClick={() => onDelete("everything")}>
          <span>Delete everything</span>
          <small>
            {collectionSize === 0
              ? "Removes everything this phone keeps for the app. Immediate and permanent."
              : `Removes all ${collectionSize} synced echo${collectionSize === 1 ? "" : "es"}. Immediate and permanent.`}
          </small>
        </button>
        <button className="danger-row" onClick={startOver}>
          <span>Start over</span>
          <small>
            Clears your echoes, ratings and settings on this phone and opens the app fresh,
            from the first screen.
          </small>
        </button>
      </section>

      {/*
        Feedback, last before the build stamp, which travels with it. Only when this build
        has somewhere to send it (`feedback.ts`).
      */}
      {feedbackAvailable(SENTRY_DSN) && (
        <>
          <Suggest dsn={SENTRY_DSN} release={__BUILD_COMMIT__} />
          <Feedback dsn={SENTRY_DSN} release={__BUILD_COMMIT__} />
        </>
      )}

      {/*
        Skeleton key: an owner or tester code typed in the app, for the home-screen icon that
        the owner link cannot reach. Gone once a key has worked; the mode's own panel above
        takes its place.
      */}
      {!owner && onUnlocked && <SkeletonKey onUnlocked={onUnlocked} />}

      {/*
        Which build this is.
        "It doesn't look updated" was unanswerable: the deploy posts nothing back to GitHub,
        and the app said nothing about its own version, so there was no way to tell a stale
        deploy from stale state in a browser from a change that had not landed. This is the
        cheapest possible answer and it fits in a screenshot.
      */}
      <p className="build-stamp">
        Build {__BUILD_COMMIT__} · {new Date(__BUILD_TIME__).toLocaleString()}
      </p>
    </div>
  );
}

/**
 * Forget everything this device is holding, and reload.
 *
 * Not the same as "delete everything", which is a privacy promise about *your data*. This
 * is the other failure: an old visit left state behind that makes a new build look like an
 * old one, most of all the onboarding flag, which sends you straight past the six screens
 * that were the thing worth looking at.
 *
 * Every step is wrapped, because a private window can refuse any of them and a reset that
 * throws halfway is worse than no reset.
 */
function startOver(): void {
  // Owner and tester mode live in a server cookie too (`owner.ts`): start over forgets that.
  forgetOnServer();
  try {
    localStorage.clear();
  } catch {
    /* Blocked storage. The reload below is still worth doing. */
  }
  try {
    sessionStorage.clear();
  } catch {
    /* As above. */
  }
  try {
    indexedDB.deleteDatabase("echo-finders");
  } catch {
    /* As above. */
  }
  location.reload();
}

function Toggle({
  label,
  detail,
  cost,
  on,
  onToggle,
}: {
  label: string;
  detail: string;
  cost: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="setting">
      <button
        className={`setting-row${on ? " setting-on" : ""}`}
        onClick={onToggle}
        role="switch"
        aria-checked={on}
      >
        <span className="setting-text">
          <strong>{label}</strong>
          <small>{detail}</small>
        </span>
        <span className="switch" aria-hidden="true">
          <span className="knob" />
        </span>
      </button>
      <p className="setting-cost">{cost}</p>
    </div>
  );
}
