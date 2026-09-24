/**
 * First run.
 *
 * The design carries one of these and we had never built it, which left the product with
 * no answer to three questions that decide whether anybody gets far enough to enjoy it.
 * It is not a welcome screen. Every step here exists because something downstream breaks
 * without it.
 *
 * **Who is listening** sets kids mode, and kids mode is an *age* handed to the engine, not
 * a filter over a view (`listenerFor`). Asked once, up front, it gates the library
 * everywhere: scheduler, capture, packaging, playback. Left to be discovered later it is a
 * switch a parent finds after the wrong echo has already played.
 *
 * **Headphones, then location.** These are one step on purpose. The policy in
 * `@echofinders/core` is explicit that a permission asked cold is a permission lost —
 * on iOS a refusal cannot be re-prompted, only fixed in Settings, which nobody does. So
 * the ask arrives at the one moment its reason is self-evident: the listener has just been
 * told the app finds things near them, they are holding the phone, and the button says
 * what it is for before the system prompt appears. The rationale is read from
 * `CAPABILITY_NEEDS` rather than written here, so the policy and the words a person reads
 * cannot drift apart.
 *
 * **The journey** is last because it is the only step with a wrong answer that costs
 * nothing: pick the wrong walk and you change it in a tap. It hands off to the package
 * screen, which is where the download already lives.
 *
 * Skippable throughout, except that skipping the location step means skipping the product.
 * That is stated plainly rather than enforced with a disabled button, because a person who
 * wants to look around before granting anything should be allowed to, and the map behind
 * this is perfectly legible without a fix.
 */

import { useState } from "react";
import { CAPABILITY_NEEDS } from "@echofinders/core";
import type { LocationState } from "./browser-location";

export interface OnboardingProps {
  /** Ask the browser for a real fix. Resolves once the answer is known. */
  readonly onAskLocation: () => Promise<LocationState>;
  readonly kids: boolean;
  readonly onKids: (on: boolean) => void;
  /** Done, one way or another. */
  readonly onDone: () => void;
}

const LOCATION = CAPABILITY_NEEDS.find((n) => n.capability === "location-foreground")!;

type Step = "who" | "sound" | "ready";
const ORDER: readonly Step[] = ["who", "sound", "ready"];

export function Onboarding({ onAskLocation, kids, onKids, onDone }: OnboardingProps) {
  const [step, setStep] = useState<Step>("who");
  const [asking, setAsking] = useState(false);
  const [located, setLocated] = useState<LocationState["kind"] | null>(null);
  const index = ORDER.indexOf(step);

  const next = () => {
    const to = ORDER[index + 1];
    if (to) setStep(to);
    else onDone();
  };

  const ask = async () => {
    setAsking(true);
    const state = await onAskLocation();
    setAsking(false);
    setLocated(state.kind);
    // A refusal does not trap anybody on this screen. It is explained on the next one.
    next();
  };

  return (
    <div className="onb" role="dialog" aria-modal="true" aria-label="Welcome to Echo Finders">
      <div className="onb-top">
        <span className="onb-dots" aria-hidden="true">
          {ORDER.map((s) => (
            <i key={s} className={s === step ? "on" : ""} />
          ))}
        </span>
        <button className="onb-skip" onClick={onDone}>
          Skip
        </button>
      </div>

      <div className="onb-body">
        {step === "who" && (
          <>
            <h2>Who is listening?</h2>
            <p className="onb-lead">
              This decides what the app will play, everywhere. You can change it later from
              the smiley on the map.
            </p>
            {/*
              Choosing advances. There is no separate Next on this step and there should
              not be: the answer *is* the action, and a card that records a choice and then
              leaves somebody looking for a button they cannot find is a dead end. The first
              build of this had exactly that, and the only way out of the screen was Skip.
            */}
            <button
              className={!kids ? "onb-card on" : "onb-card"}
              onClick={() => {
                onKids(false);
                next();
              }}
              aria-pressed={!kids}
            >
              <b>Just me</b>
              <small>Everything, including the darker history. True crime stays off unless
                you ask for it.</small>
            </button>
            <button
              className={kids ? "onb-card on" : "onb-card"}
              onClick={() => {
                onKids(true);
                next();
              }}
              aria-pressed={kids}
            >
              <b>There are children with me</b>
              <small>
                The library narrows to what suits an eight year old, and the shorter telling
                comes on with it.
              </small>
            </button>
          </>
        )}

        {step === "sound" && (
          <>
            <h2>Headphones on</h2>
            <p className="onb-lead">
              Echo Finders is heard, not read. As you get close to something you will hear a
              sonar ping quicken, so you can find it without looking at the screen.
            </p>
            {/*
              The rationale is the engine's, not a second copy of it written here. If the
              policy changes its mind about why it needs this, the screen changes with it.
            */}
            <div className="onb-perm">
              <span className="onb-perm-ic" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z" />
                  <circle cx="12" cy="10" r="2.4" />
                </svg>
              </span>
              <div>
                <b>One permission</b>
                <small>{LOCATION.rationale}</small>
              </div>
            </div>
            <button className="onb-go" onClick={() => void ask()} disabled={asking}>
              {asking ? "Waiting for your answer…" : "Allow location"}
            </button>
            <button className="onb-alt" onClick={next}>
              Not yet
            </button>
          </>
        )}

        {step === "ready" && (
          <>
            <h2>{located === "denied" ? "No location yet" : "You are ready"}</h2>
            <p className="onb-lead">
              {located === "denied"
                ? LOCATION.ifRefused +
                  " You can grant it later from your browser's site settings, and everything else here still works."
                : "Pick a journey, carry it with you, and walk. Echoes open as you reach them and wait until you press play."}
            </p>
            <button className="onb-go" onClick={onDone}>
              Choose a journey
            </button>
          </>
        )}
      </div>
    </div>
  );
}
