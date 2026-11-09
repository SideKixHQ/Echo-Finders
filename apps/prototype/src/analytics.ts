/**
 * Anonymous usage statistics, through Vercel Web Analytics.
 *
 * What it counts: visits, and a handful of moments that say whether the app works as a
 * business (an echo played, the paywall shown, a checkout started, a purchase completed).
 * What it does not: who. Vercel Web Analytics sets no cookie, and identifies a visit only by
 * a hash that changes daily and is never stored with the IP address it came from.
 *
 * On unless the listener turns it off (James, 2026-11-07: "on by default, can turn off"),
 * in Settings › Privacy › Anonymous usage statistics. The switch is read at every event,
 * not once at start, so turning it off takes effect at once without a reload.
 *
 * The address is sent without anything after the "?": the app's links can carry a journey,
 * a checkout session or coordinates (DEPLOY.md, "Two things in the URL"), and none of that
 * belongs in a page count.
 *
 * Events only reach the dashboard once Web Analytics is enabled on the Vercel project
 * (DEPLOY.md, Analytics). Until then the script is not served and this does nothing.
 */

import { inject, track, type BeforeSendEvent } from "@vercel/analytics";
import { readSettings } from "./settings-store";

function allowed(): boolean {
  return readSettings().privacy.analytics;
}

/** The address without its query string or fragment. */
export function withoutQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

export function startAnalytics(): void {
  inject({
    framework: "vite",
    beforeSend: (event: BeforeSendEvent) => (allowed() ? { ...event, url: withoutQuery(event.url) } : null),
  });
}

/**
 * The moments worth counting. A closed list, so nothing personal can be passed by accident:
 * every property is a category, a plan or a city id, never a person, a place they stood or
 * a free-text field.
 */
export type AppEvent =
  | { readonly name: "Echo played"; readonly category: string }
  | { readonly name: "Paywall shown"; readonly category: string }
  | { readonly name: "Shared echo opened"; readonly category: string }
  | { readonly name: "Checkout started"; readonly plan: string; readonly city: string }
  | { readonly name: "Purchase completed"; readonly plan: string };

export function count(event: AppEvent): void {
  if (!allowed()) return;
  const { name, ...properties } = event;
  try {
    track(name, properties);
  } catch {
    /* Counting must never break the thing being counted. */
  }
}
