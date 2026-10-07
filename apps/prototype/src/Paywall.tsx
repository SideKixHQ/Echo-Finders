/**
 * The one time the app asks for money.
 *
 * It arrives on the eleventh echo, in the street, with headphones in — which is the worst
 * possible moment to be sold to and the only honest one. By then somebody has walked to
 * ten places and heard ten stories, so the question is not "will you gamble on this"
 * but "do you want the rest of it". That is the whole reason the free tier is ten rather
 * than two, and why this screen can be short.
 *
 * TWO OFFERS, AND NOTHING ELSE. A City Pass for the visitor here for two days: one city,
 * paid once, nothing to cancel. All-Access for whoever will cross several cities, a road
 * trip and a flight in a year, and it renews, which is said beside the price rather than
 * found on a statement. The sum that decides between them is printed as a fact ("four
 * cities or more, All-Access costs less") instead of a "best value" badge. No countdown, no
 * struck-through price, no pre-ticked upgrade: every trick that makes a paywall convert
 * better also makes it the moment somebody decides this app is like all the others.
 * Respect is a stated value of this product and this is the screen that tests whether we
 * meant it.
 *
 * An echo outside every city (a parkway, a flight path) has no City Pass to sell, so only
 * All-Access is offered and the screen says why rather than showing a pass that would not
 * open the story they asked for.
 *
 * It is also the screen most likely to be read in bright sun by somebody who has been
 * walking for an hour, so: one heading, two plain choices, one button, one way out.
 *
 * The echo they were reaching for is named at the top. Not decoration — it is the whole
 * argument. "Unlock everything" is abstract; "you were about to hear The bull was dumped
 * here in the night" is the specific thing they are being kept from.
 */

import { useState } from "react";
import { FREE_ECHO_LIMIT, PLANS, type City, type Echo } from "@echofinders/core";

export type Plan = "city" | "allAccess";

export interface PaywallProps {
  /** The echo they tried to play. Named, because it is the reason to buy. */
  readonly echo: Echo;
  /** The city it is in, or null on the road and in the air: no City Pass to offer. */
  readonly city: City | null;
  /** How many they have heard. Shown as a fact, never as a warning. */
  readonly heardCount: number;
  readonly onBuy: (plan: Plan) => void;
  readonly onClose: () => void;
}

/** How many City Passes cost more than a year of All-Access. Four, at $9.99 and $34.99. */
const CITIES_WHERE_ALL_ACCESS_WINS =
  Math.floor(PLANS.allAccess.amountMinor / PLANS.city.amountMinor) + 1;

const COUNT_WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight"];

export function Paywall({ echo, city, heardCount, onBuy, onClose }: PaywallProps) {
  // The City Pass first when there is one: the visitor on a short trip is most people here.
  const [plan, setPlan] = useState<Plan>(city ? "city" : "allAccess");
  const chosen = city && plan === "city" ? "city" : "allAccess";
  const wins = COUNT_WORDS[CITIES_WHERE_ALL_ACCESS_WINS] ?? String(CITIES_WHERE_ALL_ACCESS_WINS);

  return (
    <div
      className="paywall"
      role="dialog"
      aria-modal="true"
      aria-label="Keep listening"
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

        {/*
          Real radio buttons, so a screen reader hears "1 of 2, selected" and arrow keys
          move between them. The whole card is the label, so the whole card is the target.
        */}
        <fieldset className="paywall-plans">
          <legend className="sr-only">Choose a plan</legend>
          {city && (
            <label className={`paywall-plan${chosen === "city" ? " on" : ""}`}>
              <input
                type="radio"
                name="plan"
                value="city"
                checked={chosen === "city"}
                onChange={() => setPlan("city")}
              />
              <span className="paywall-plan-head">
                <span className="paywall-plan-name">{city.name} {PLANS.city.name}</span>
                <span className="paywall-plan-price">
                  {PLANS.city.price} <small>{PLANS.city.per}</small>
                </span>
              </span>
              <span className="paywall-plan-what">
                Every echo in {city.name}, for good, including the ones we add later. Nothing
                to renew.
              </span>
            </label>
          )}
          <label className={`paywall-plan${chosen === "allAccess" ? " on" : ""}`}>
            <input
              type="radio"
              name="plan"
              value="allAccess"
              checked={chosen === "allAccess"}
              onChange={() => setPlan("allAccess")}
            />
            <span className="paywall-plan-head">
              <span className="paywall-plan-name">{PLANS.allAccess.name}</span>
              <span className="paywall-plan-price">
                {PLANS.allAccess.price} <small>{PLANS.allAccess.per}</small>
              </span>
            </span>
            <span className="paywall-plan-what">
              Every city, every road trip, every flight. Renews each year; cancel any time.
            </span>
          </label>
        </fieldset>

        <p className="paywall-sum">
          {city
            ? `Visiting ${wins} cities or more this year? All-Access costs less.`
            : "City Passes cover a city. This echo is on the road, so it is part of All-Access."}
        </p>

        <button className="paywall-buy" onClick={() => onBuy(chosen)}>
          {chosen === "city"
            ? `Get the ${PLANS.city.name} · ${PLANS.city.price}`
            : `Start All-Access · ${PLANS.allAccess.price} ${PLANS.allAccess.per}`}
        </button>

        {/*
          Saying so, rather than letting somebody find out.

          There is no account yet (`docs/03-selling.md`), so a purchase lives on this
          device and this browser. That is a real limitation and burying it would be the
          kind of thing that turns a customer into a refund and a review. It goes under the
          button in plain words, before the money moves rather than after.
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
