/**
 * Settings › Membership: what you have, and every way to change it.
 *
 * James asked for the four things any paid app keeps here: membership options, restore
 * purchases, a payment card, and cancel. Each row says what it does today rather than
 * pretending, because real payments switch on only once the Stripe keys are in Vercel
 * (`payments.ts`), and accounts do not exist yet (`docs/10-blockers.md` #6):
 *
 *   - Membership options opens the two plans, as the paywall offers them.
 *   - Restore reads back what this device has bought: from Stripe when payments are on,
 *     from the device record otherwise. Moving a purchase to another phone needs an
 *     account, and the row says so after it runs.
 *   - The card row opens Stripe's own page (card, receipts, cancel) once this device has
 *     bought through Stripe. Before that it is a statement, not a button: a button that
 *     did nothing would be worse than a sentence.
 *   - Cancel stops All-Access renewing and keeps the year already paid for, which is the
 *     promise the paywall makes ("cancel any time"). At Stripe it is the subscription's
 *     `cancel_at_period_end`. It asks once before it acts, because it is about money.
 *
 * A City Pass is bought once and has nothing to cancel, and the plan line says that rather
 * than showing a cancel row that could only fail.
 */

import { useState } from "react";
import { CITIES, FREE_ECHO_LIMIT, type Membership } from "@echofinders/core";

interface Props {
  readonly membership: Membership;
  /** How many of the free ten are left, for the free plan's line. */
  readonly freeLeft: number;
  /** Open the plans. */
  readonly onOptions: () => void;
  /** Read back what this device holds (from Stripe, when payments are on), and say what. */
  readonly onRestore: () => Membership | Promise<Membership>;
  /** Cancel All-Access renewal (false) or turn it back on (true). */
  readonly onRenewal: (on: boolean) => void;
  /** Real payments are switched on (`payments.ts`). */
  readonly payments?: boolean;
  /** This device has bought through Stripe, so Stripe has a card page for it. */
  readonly canManageCard?: boolean;
  /** Open Stripe's page for the card, receipts and cancelling. */
  readonly onCard?: () => void;
  /** What went wrong talking to payments, said where the listener is looking. */
  readonly error?: string | null;
}

export function MembershipPanel({
  membership,
  freeLeft,
  onOptions,
  onRestore,
  onRenewal,
  payments = false,
  canManageCard = false,
  onCard,
  error = null,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [restored, setRestored] = useState<string | null>(null);
  const { name, detail } = describe(membership, freeLeft);

  return (
    <section className="panel membership" aria-labelledby="membership-h">
      <h3 id="membership-h">Membership</h3>

      <div className="setting-row membership-plan">
        <span className="setting-text">
          <strong>{name}</strong>
          <small>{detail}</small>
        </span>
      </div>

      <button className="setting-row setting-link membership-row" onClick={onOptions}>
        <span className="setting-text">
          <strong>Membership options</strong>
          <small>
            {membership.plan === "free"
              ? "A City Pass, or All-Access for every city, road trip and flight."
              : "See the plans, or add a year of All-Access."}
          </small>
        </span>
        <Chevron />
      </button>

      {canManageCard && onCard ? (
        <button className="setting-row setting-link membership-row" onClick={onCard}>
          <span className="setting-text">
            <strong>Payment card</strong>
            <small>Change your card, see receipts or cancel. Stripe holds it, never Echo Finders.</small>
          </span>
          <Chevron />
        </button>
      ) : (
        <div className="setting-row membership-row">
          <span className="setting-text">
            <strong>Payment card</strong>
            <small>
              {payments
                ? "No card yet. When you buy, Stripe holds your card, never Echo Finders, and you change it here."
                : "No card yet: payments are not switched on. When they are, your card is held by Stripe, never by Echo Finders, and you change it here."}
            </small>
          </span>
          {!payments && <span className="membership-soon mono">Soon</span>}
        </div>
      )}

      <button
        className="setting-row setting-link membership-row"
        onClick={async () => {
          const now = await onRestore();
          setRestored(
            now.plan === "free"
              ? "Nothing to restore on this device."
              : `Restored: ${describe(now, freeLeft).name}.`,
          );
        }}
      >
        <span className="setting-text">
          <strong>Restore purchases</strong>
          <small>Bought here before and not seeing it? This reads it back.</small>
        </span>
        <Chevron />
      </button>
      {/* Spoken when it changes, so a screen reader hears the result of the tap. */}
      <p className="membership-note" role="status">
        {error && <>{error} </>}
        {restored && (
          <>
            {restored} Bought on another phone or browser? That moves over once accounts
            arrive.
          </>
        )}
      </p>

      {membership.plan === "all-access" &&
        (membership.renews ? (
          confirming ? (
            <div className="membership-confirm" role="group" aria-label="Cancel All-Access">
              <p>
                Cancel All-Access? You keep everything until {day(membership.until)}. It
                just won&rsquo;t renew.
              </p>
              <div className="membership-confirm-actions">
                <button className="membership-keep" onClick={() => setConfirming(false)}>
                  Keep All-Access
                </button>
                <button
                  className="membership-cancel"
                  onClick={() => {
                    onRenewal(false);
                    setConfirming(false);
                  }}
                >
                  Cancel renewal
                </button>
              </div>
            </div>
          ) : (
            <button className="danger-row membership-danger" onClick={() => setConfirming(true)}>
              <span>Cancel All-Access</span>
              <small>Stops it renewing. You keep everything until {day(membership.until)}.</small>
            </button>
          )
        ) : (
          <button className="setting-row setting-link membership-row" onClick={() => onRenewal(true)}>
            <span className="setting-text">
              <strong>Turn renewal back on</strong>
              <small>All-Access ends {day(membership.until)} unless it renews.</small>
            </span>
            <Chevron />
          </button>
        ))}
    </section>
  );
}

function describe(membership: Membership, freeLeft: number): { name: string; detail: string } {
  switch (membership.plan) {
    case "free":
      return {
        name: "Free",
        detail: `${freeLeft} of ${FREE_ECHO_LIMIT} free echoes left. Everything you find and hear stays yours.`,
      };
    case "lifetime":
      return {
        name: "Lifetime unlock",
        detail: "Everything, for good. You bought it before the plans changed, and it stays.",
      };
    case "city-pass": {
      const names = cityNames(membership.cities);
      return {
        name: `${names} City Pass`,
        detail: `Every echo in ${names}, for good. Bought once: nothing to renew or cancel.`,
      };
    }
    case "all-access": {
      const kept = membership.cities.length
        ? ` Your ${cityNames(membership.cities)} City Pass stays after.`
        : "";
      return {
        name: "All-Access",
        detail: membership.renews
          ? `Every city, road trip and flight. Renews ${day(membership.until)}.${kept}`
          : `Ends ${day(membership.until)}. It will not renew.${kept}`,
      };
    }
  }
}

function cityNames(ids: readonly string[]): string {
  return ids.map((id) => CITIES.find((c) => c.id === id)?.name ?? id).join(" and ");
}

function day(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="setting-chev">
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}
