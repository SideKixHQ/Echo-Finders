/**
 * Privacy.
 *
 * Its own screen rather than a row in settings, because the choices here are the ones a
 * person should be able to find without hunting, and because two of them delete data the
 * moment they are switched off.
 *
 * Every control says what is *lost* by turning it off. A switch whose consequence is
 * unclear is not really a choice, and the fallbacks come from the engine
 * (`featureAvailability`) rather than being written twice.
 */

import {
  capabilitiesImpliedBy,
  featureAvailability,
  type Capability,
  type FeatureId,
  type PrivacySettings,
} from "@echofinders/core";

interface Props {
  readonly settings: PrivacySettings;
  readonly onChange: (next: PrivacySettings) => void;
  readonly storedPositions: number;
  readonly collectionSize: number;
  readonly onDelete: (what: "positions" | "everything") => void;
}

const FEATURE_LABELS: Record<FeatureId, string> = {
  "map-browsing": "Browsing the map",
  "capture-on-screen": "Opening echoes",
  "capture-hands-free": "Hands-free walking",
  "haptic-guidance": "Buzz as you get closer",
  "camera-viewfinder": "Camera view",
  "passing-alerts": "Alerts when passing something",
};

export function Privacy({ settings, onChange, storedPositions, collectionSize, onDelete }: Props) {
  // What the app would actually be granted, given these settings. Shown so the fallbacks
  // below are the real ones rather than a hand-written list that drifts.
  const granted = [...capabilitiesImpliedBy(settings)] as Capability[];
  const features = featureAvailability([...granted, "haptics"]);

  return (
    <div className="screen-body">
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
        detail="Which features get used. Never who used them."
        cost="Off by default, like everything here that is for our benefit rather than yours."
        on={settings.analytics}
        onToggle={() => onChange({ ...settings, analytics: !settings.analytics })}
      />

      <section className="panel">
        <h3>What works right now</h3>
        <ul className="feature-list">
          {features.map((feature) => (
            <li key={feature.feature} className={`feature feature-${feature.level}`}>
              <span className="feature-name">{FEATURE_LABELS[feature.feature]}</span>
              <span className="feature-level">
                {feature.level === "full" ? "on" : feature.level === "degraded" ? "limited" : "off"}
              </span>
              {feature.fallback && <small className="feature-fallback">{feature.fallback}</small>}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel panel-danger">
        <h3>Your data</h3>
        <button className="danger-row" onClick={() => onDelete("positions")}>
          <span>Delete my positions</span>
          <small>Removes every saved standing position. Keeps your collection.</small>
        </button>
        <button className="danger-row" onClick={() => onDelete("everything")}>
          <span>Delete everything</span>
          <small>
            Removes all {collectionSize} synced echo{collectionSize === 1 ? "" : "es"}. Immediate
            and permanent.
          </small>
        </button>
        <button className="danger-row" onClick={startOver}>
          <span>Start over</span>
          <small>
            Forgets the onboarding, your ratings and everything synced, then reloads. Use it
            when the app looks like an older version of itself.
          </small>
        </button>
      </section>

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
