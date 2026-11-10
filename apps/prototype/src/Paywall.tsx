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

import { useState, type ReactNode } from "react";
import { CITIES, FREE_ECHO_LIMIT, PLANS, type City, type Echo } from "@echofinders/core";

export type Plan = "week" | "city" | "allAccess";

export interface PaywallProps {
  /**
   * The echo they tried to play. Named, because it is the reason to buy.
   *
   * Absent when it was opened from Settings › Membership options: nobody was stopped, so
   * the screen offers rather than explains, and its way out says Close, not Not now.
   */
  readonly echo?: Echo;
  /** The city it is in, or null on the road and in the air: no City Pass to offer. */
  readonly city: City | null;
  /** How many they have heard. Shown as a fact, never as a warning. */
  readonly heardCount: number;
  /** All-Access already running: the City Pass would add nothing, and buying adds a year. */
  readonly allAccessRunning?: boolean;
  /**
   * What the City Pass costs this listener, in minor units: less than the list price when a
   * Week Pass for this city is still running, which counts towards it (`cityPassPriceMinor`).
   * Then the Week Pass is not offered again; the upgrade is.
   */
  readonly cityPassMinor?: number;
  /**
   * The same, for a city chosen under "Buying for another city?". Absent: the list price.
   */
  readonly cityPassMinorFor?: (cityId: string) => number;
  /** The plan, and for a City or Week Pass the city it is for. */
  readonly onBuy: (plan: Plan, cityId?: string) => void;
  readonly onClose: () => void;
}

/**
 * "All-Access" kept on one line. It broke at its own hyphen ("All-" at the end of one line,
 * "Access" on the next), which reads as two words. A nowrap span rather than a
 * non-breaking hyphen character, so the name stays the same text for search, screen
 * readers and the audits that look for it.
 */
export function keepWhole(text: string): ReactNode {
  const parts = text.split("All-Access");
  if (parts.length === 1) return text;
  return parts.flatMap((part, i) =>
    i === 0 ? [part] : [<span key={i} className="nobreak">All-Access</span>, part],
  );
}

/** How many City Passes cost more than a year of All-Access. Four, at $9.99 and $34.99. */
const CITIES_WHERE_ALL_ACCESS_WINS =
  Math.floor(PLANS.allAccess.amountMinor / PLANS.city.amountMinor) + 1;

const COUNT_WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight"];

export function Paywall({
  echo,
  city: here,
  heardCount,
  allAccessRunning = false,
  cityPassMinor: herePassMinor = PLANS.city.amountMinor,
  cityPassMinorFor,
  onBuy,
  onClose,
}: PaywallProps) {
  /*
    Buying for another city (James, 2026-11-09, option 3 of three: "buy for another city
    link"). City and Week Passes are still offered first where you are standing; the link
    under the plans is for the trip being planned at home, or a pass bought as a gift. A
    tester away from every city could only ever see All-Access, which is how it was found.
  */
  const [picking, setPicking] = useState(false);
  const [elsewhere, setElsewhere] = useState<City | null>(null);
  const others = CITIES.filter((c) => c.id !== here?.id);
  const city = allAccessRunning ? null : (elsewhere ?? here);
  const cityPassMinor = elsewhere
    ? (cityPassMinorFor?.(elsewhere.id) ?? PLANS.city.amountMinor)
    : herePassMinor;
  const weekRunning = cityPassMinor < PLANS.city.amountMinor;
  const cityPrice = weekRunning ? `$${(cityPassMinor / 100).toFixed(2)}` : PLANS.city.price;
  // The City Pass first when there is one, between the cheaper way in and the better deal
  // from a few cities up; the Week Pass is one tap away for the weekend visitor.
  const [plan, setPlan] = useState<Plan>(here && !allAccessRunning ? "city" : "allAccess");
  const chosen: Plan = city && (plan === "city" || (plan === "week" && !weekRunning)) ? plan : "allAccess";
  const wins = COUNT_WORDS[CITIES_WHERE_ALL_ACCESS_WINS] ?? String(CITIES_WHERE_ALL_ACCESS_WINS);

  return (
    <div
      className="paywall"
      role="dialog"
      aria-modal="true"
      aria-label={echo ? "Keep listening" : "Membership options"}
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
        <h2>{echo ? `That is all ${FREE_ECHO_LIMIT} of your free echoes.` : "Hear every echo."}</h2>

        {/*
          The specific thing behind the wall, by name. A paywall that says "unlock
          everything" is asking somebody to value an abstraction; one that says "you were
          about to hear THIS" is asking them about a story they already walked to.
        */}
        {echo && (
          <p className="paywall-next">
            You were about to hear <strong>{echo.title}</strong>
            <span className="paywall-where"> · {echo.point.place}</span>
          </p>
        )}

        {/*
          Real radio buttons, so a screen reader hears "1 of 3, selected" and arrow keys
          move between them. The whole card is the label, so the whole card is the target.

          Only the chosen plan says what it is. Three cards each with their sentence ran
          134px past an iPhone in Safari (audit-align, paywall); name and price on every card
          and one description under the one you are looking at is the same information, and
          the screen still fits without scrolling.
        */}
        {picking ? (
          <fieldset className="paywall-plans paywall-cities">
            <legend className="paywall-cities-head">Which city is the pass for?</legend>
            {others.map((c) => (
              <button
                key={c.id}
                type="button"
                className="paywall-plan paywall-city"
                onClick={() => {
                  setElsewhere(c);
                  setPlan("city");
                  setPicking(false);
                }}
              >
                <span className="paywall-plan-name">{c.name}</span>
              </button>
            ))}
          </fieldset>
        ) : (
        <fieldset className="paywall-plans">
          <legend className="sr-only">Choose a plan</legend>
          {/*
            The Week Pass (James, 2026-11-06): the beach weekend, at a price nobody has to
            think about. Not offered to someone whose week is already running; for them the
            City Pass below shows what is left to pay.
          */}
          {city && !weekRunning && (
            <label className={`paywall-plan${chosen === "week" ? " on" : ""}`}>
              <input
                type="radio"
                name="plan"
                value="week"
                checked={chosen === "week"}
                onChange={() => setPlan("week")}
              />
              <span className="paywall-plan-head">
                <span className="paywall-plan-name">{PLANS.week.name}</span>
                <span className="paywall-plan-price">
                  {PLANS.week.price} <small>{PLANS.week.per}</small>
                </span>
              </span>
              {chosen === "week" && (
                <span className="paywall-plan-what">
                  Every echo in {city.name} for the next seven days. Nothing to renew, and it
                  counts towards the City Pass if you want it for good.
                </span>
              )}
            </label>
          )}
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
                  {cityPrice} <small>{weekRunning ? "your week counted" : PLANS.city.per}</small>
                </span>
              </span>
              {chosen === "city" && (
                <span className="paywall-plan-what">
                  Every echo in {city.name}, for good, including the ones we add later. Nothing
                  to renew.
                </span>
              )}
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
            {chosen === "allAccess" && (
              <span className="paywall-plan-what">
                Every city, every road trip, every flight. Renews each year; cancel any time.
              </span>
            )}
          </label>
        </fieldset>
        )}

        <p className="paywall-sum">
          {keepWhole(
            allAccessRunning
              ? "You have All-Access. Another year starts when this one ends."
              : city
                ? `Visiting ${wins} cities or more this year? All\u2011Access costs less.`
                : echo
                  ? "City Passes cover a city. This echo is on the road, so it is part of All-Access."
                  : "City Passes cover one city; All-Access opens everything.",
          )}
          {!allAccessRunning && others.length > 0 && (
            <>
              {" "}
              <button
                type="button"
                className="paywall-other"
                aria-expanded={picking}
                onClick={() => setPicking((open) => !open)}
              >
                {picking ? "Back to the plans" : elsewhere ? "A different city?" : "Buying for another city?"}
              </button>
            </>
          )}
        </p>

        <button
          className="paywall-buy"
          disabled={picking}
          onClick={() => onBuy(chosen, chosen === "allAccess" ? undefined : city?.id)}
        >
          {chosen === "week"
            ? `Get the ${PLANS.week.name} · ${PLANS.week.price}`
            : chosen === "city"
            ? `Get the ${PLANS.city.name} · ${cityPrice}`
            : allAccessRunning
              ? `Add a year · ${PLANS.allAccess.price}`
              : `Start All-Access · ${PLANS.allAccess.price} ${PLANS.allAccess.per}`}
        </button>

        {/*
          Saying so, rather than letting somebody find out.

          There is no account yet (`docs/03-selling.md`), so a purchase lives on this
          device and this browser. That is a real limitation and burying it would be the
          kind of thing that turns a customer into a refund and a review. It goes under the
          button in plain words, before the money moves rather than after.
        */}
        {/*
          The terms sit in the same line, in reach before the money moves (what auto-renewal
          laws expect). A line of their own made the paywall 23px taller than an iPhone in
          Safari, and its last button was cut off (audit:align, 2026-11-08).
        */}
        <p className="paywall-small">
          What you buy is saved on this phone.{" "}
          {chosen === "allAccess" ? "Renews yearly until you cancel in Settings. " : ""}
          <a href="https://echofinders.com/terms" target="_blank" rel="noreferrer">Terms</a>
          {" · "}
          <a href="https://echofinders.com/refunds" target="_blank" rel="noreferrer">Refunds</a>
        </p>

        <button className="paywall-later" onClick={onClose}>
          {echo ? "Not now" : "Close"}
        </button>

        {/*
          What they keep either way, and it is not nothing: every echo already found stays
          found, and everything already heard stays playable forever. A paywall that also
          takes away what somebody already had is a different and much worse screen.
        */}
        {echo && (
          <p className="paywall-keep">
            Your {heardCount} echoes stay yours to replay.
          </p>
        )}
      </div>
    </div>
  );
}
