/**
 * The one time the app asks for money.
 *
 * It arrives on the eleventh echo, in the street, with headphones in — which is the worst
 * possible moment to be sold to and the only honest one. By then somebody has walked to
 * ten places and heard ten stories, so the question is not "will you gamble $6.99 on this"
 * but "do you want the rest of it". That is the whole reason the free tier is ten rather
 * than two, and why this screen can be short.
 *
 * WHAT IT DOES NOT DO. It does not dress the price up, run a countdown, offer a
 * subscription, or hint at a better deal later. There is one product at one price, bought
 * once, and every trick that makes a paywall convert better also makes it the moment
 * somebody decides this app is like all the others. Respect is a stated value of this
 * product and this is the screen that tests whether we meant it.
 *
 * It is also the screen most likely to be read in bright sun by somebody who has been
 * walking for an hour, so: one heading, one number, one button, one way out.
 *
 * The echo they were reaching for is named at the top. Not decoration — it is the whole
 * argument. "Unlock everything" is abstract; "you were about to hear The bull was dumped
 * here in the night" is the specific thing they are being kept from.
 */

import { FREE_ECHO_LIMIT, PRICE, type Echo } from "@echofinders/core";

export interface PaywallProps {
  /** The echo they tried to play. Named, because it is the reason to buy. */
  readonly echo: Echo;
  /** How many they have heard. Shown as a fact, never as a warning. */
  readonly heardCount: number;
  readonly onBuy: () => void;
  readonly onClose: () => void;
}

export function Paywall({ echo, heardCount, onBuy, onClose }: PaywallProps) {
  return (
    <div
      className="paywall"
      role="dialog"
      aria-modal="true"
      aria-label="Unlock every echo"
    >
      <div className="paywall-body">
        <p className="paywall-count mono">
          {heardCount} of {FREE_ECHO_LIMIT} free echoes heard
        </p>

        {/*
          The number comes from the constant, not from prose.

          This read "You have heard the free ten." with the word spelled out, which is a
          lie waiting for the day somebody changes FREE_ECHO_LIMIT — and it showed up
          immediately, rendering "0 of 0 free echoes heard" above a heading still
          promising ten. A price and a count are the two things on this screen that must
          never be able to disagree with what the engine actually enforces.
        */}
        <h2>That is all {FREE_ECHO_LIMIT} of your free echoes.</h2>

        {/*
          The specific thing behind the wall, by name. A paywall that says "unlock
          everything" is asking somebody to value an abstraction; one that says "you were
          about to hear THIS" is asking them about a story they already walked to.
        */}
        <p className="paywall-next">
          You were about to hear <strong>{echo.title}</strong>
          <span className="paywall-where"> · {echo.point.place}</span>
        </p>

        <div className="paywall-offer">
          <p className="paywall-price">{PRICE.label}</p>
          <p className="paywall-what">
            Every echo, everywhere, for good. No subscription and nothing to cancel.
          </p>
        </div>

        <button className="paywall-buy" onClick={onBuy}>
          Unlock everything
        </button>

        {/*
          Saying so, rather than letting somebody find out.

          There is no account yet (`docs/03-selling.md`), so a purchase lives on this
          device and this browser. That is a real limitation and burying it would be the
          kind of thing that turns a $6.99 customer into a refund and a review. It goes
          under the button in plain words, before the money moves rather than after.
        */}
        <p className="paywall-small">
          Kept on this device for now. Accounts are coming, and your purchase will move
          with you when they land.
        </p>

        <button className="paywall-later" onClick={onClose}>
          Not now
        </button>

        {/*
          What they keep either way, and it is not nothing: every echo already found stays
          found, and everything already heard stays playable forever. A paywall that also
          takes away what somebody already had is a different and much worse screen.
        */}
        <p className="paywall-keep">
          Your {heardCount} echoes stay yours, and you can keep finding more for free.
        </p>
      </div>
    </div>
  );
}
