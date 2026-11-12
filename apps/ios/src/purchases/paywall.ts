/**
 * The paywall's decisions, pure: whether an echo is locked, and what is offered for it.
 *
 * Locked is the engine's answer (`mayHearAnother`), asked the way the web app asks it
 * (`App.tsx`, `mayStart`): the echo's own point, the echoes already heard, now. Nothing
 * here decides who may listen; it only words the offer.
 *
 * The offers are the web paywall's (`Paywall.tsx`) and its approved words, with two
 * differences the App Store asks for: prices are the App Store's own, in the listener's
 * currency (`Product.displayPrice`), and a Week Pass does not count towards a City Pass
 * (James, 2026-11-11: the $6 upgrade is the website's alone).
 */
import { FREE_ECHO_LIMIT, PLANS, cityAt, mayHearAnother, type City, type Entitlement, type LatLng } from "@echofinders/core";
import { skuFor, type PlanKey } from "./products";

/** May this echo play? The engine's rule; heard echoes always replay. */
export function isLocked(
  entitlement: Entitlement,
  heardIds: readonly string[],
  echo: { readonly id: string; readonly point: { readonly at: LatLng } },
  nowMs: number,
): boolean {
  return !mayHearAnother(entitlement, { categories: [], age: 99, heardEchoIds: heardIds }, echo.id, echo.point.at, nowMs);
}

export interface Offer {
  readonly plan: PlanKey;
  readonly sku: string;
  /** "Week Pass", "Boston City Pass", "All-Access". */
  readonly name: string;
  /** Beside the price: "for 7 days", "once", "a year". */
  readonly per: string;
  /** The sentence under the chosen plan. */
  readonly what: string;
  /** The city a Week or City Pass is for. */
  readonly city?: City;
}

export interface PaywallPlan {
  /** The city the echo is in, or null on the road and in the air. */
  readonly city: City | null;
  readonly offers: readonly Offer[];
  /** The plan chosen when the screen opens: the City Pass where there is one. */
  readonly chosen: PlanKey;
  /** The fact under the plans that decides between them. */
  readonly sum: string;
}

/** How many City Passes cost more than a year of All-Access. Four, at $9.99 and $34.99. */
const CITIES_WHERE_ALL_ACCESS_WINS = Math.floor(PLANS.allAccess.amountMinor / PLANS.city.amountMinor) + 1;
const COUNT_WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight"];

/** What the paywall offers for an echo at this point. */
export function paywallFor(at: LatLng): PaywallPlan {
  const city = cityAt(at);
  const allAccess: Offer = {
    plan: "allAccess",
    sku: skuFor("allAccess"),
    name: PLANS.allAccess.name,
    per: PLANS.allAccess.per,
    what: "Every city, every road trip, every flight. Renews each year; cancel any time.",
  };
  if (!city) {
    return {
      city: null,
      offers: [allAccess],
      chosen: "allAccess",
      sum: "City Passes cover a city. This echo is on the road, so it is part of All-Access.",
    };
  }
  const wins = COUNT_WORDS[CITIES_WHERE_ALL_ACCESS_WINS] ?? String(CITIES_WHERE_ALL_ACCESS_WINS);
  return {
    city,
    offers: [
      {
        plan: "week",
        sku: skuFor("week"),
        name: PLANS.week.name,
        per: PLANS.week.per,
        what: `Every echo in ${city.name} for the next seven days. Nothing to renew.`,
        city,
      },
      {
        plan: "city",
        sku: skuFor("city", city.id),
        name: `${city.name} ${PLANS.city.name}`,
        per: PLANS.city.per,
        what: `Every echo in ${city.name}, for good, including the ones we add later. Nothing to renew.`,
        city,
      },
      allAccess,
    ],
    chosen: "city",
    sum: `Visiting ${wins} cities or more this year? All-Access costs less.`,
  };
}

/** The buy button. Without a price from the App Store, the name alone. */
export function buyLabel(offer: Offer, price: string | null): string {
  const verb = offer.plan === "allAccess" ? `Start ${offer.name}` : `Get the ${offer.plan === "week" ? offer.name : PLANS.city.name}`;
  if (!price) return verb;
  return offer.plan === "allAccess" ? `${verb} · ${price} ${offer.per}` : `${verb} · ${price}`;
}

/** Above the heading: how many of the free echoes have been heard. A fact, not a warning. */
export function heardLine(heardCount: number): string {
  return `${Math.min(heardCount, FREE_ECHO_LIMIT)} of ${FREE_ECHO_LIMIT} free echoes heard`;
}

export const PAYWALL_HEADING = `That is all ${FREE_ECHO_LIMIT} of your free echoes.`;

/**
 * Under the button, before the money moves. Apple asks that an auto-renewing subscription
 * say how it renews and how to stop it, where it is bought.
 */
export function smallPrint(plan: PlanKey): string {
  return plan === "allAccess"
    ? "Charged to your Apple Account. Renews each year unless you cancel at least a day before it ends, in Settings."
    : "Charged to your Apple Account, once.";
}
