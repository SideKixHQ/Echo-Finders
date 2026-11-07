# Echo Finders — Refund Policy

**Draft for legal review. Not yet published.**
Last updated: 7 November 2026 · Part of the [Terms of Service](terms-of-service.md).

We would rather refund you than keep money for something that did not work for you. This page
says when we refund, how to ask, and how long it takes.

---

## The short version

| You bought | Refund in full if you ask within |
|---|---|
| **Week Pass** ($3.99) | **48 hours** of paying |
| **City Pass** ($9.99) | **14 days** of paying |
| **All-Access** ($34.99 a year) | **14 days** of paying, or of an annual renewal |
| Anything that **did not work on your device** | **30 days** of paying |

No questions beyond what we need to find your payment. One goodwill refund per pass type per
person; refunds for something that did not work are not limited.

---

## The details

### Week Pass
A Week Pass lasts seven days from the moment you pay, so the refund window is short: ask within
48 hours of paying and we refund it in full. After that it has largely been used.

### City Pass
Ask within 14 days of paying and we refund it in full. After 14 days a City Pass is not
refundable, because it does not expire.

**If you upgraded from a Week Pass** (the City Pass cost less because your week counted), a
refund of the City Pass refunds what you paid for it. The Week Pass refund window is separate
and runs from when you bought the week.

### All-Access
- **Cancelling** stops the next renewal; you keep All-Access until the end of the year you paid
  for. Cancel in **Settings → Membership → Cancel All-Access**. Cancelling on its own does not
  refund anything.
- **A refund** of the first year, or of a renewal, in full if you ask within 14 days of that
  charge. If you forgot to cancel before a renewal, this is the window to ask.
- After 14 days, the year already paid for is not refunded, but you keep using it to the end.

### When it did not work
If Echo Finders did not work on your device for something you paid for (it would not play, a
pass did not unlock, you were charged twice), ask within 30 days and we refund it, whatever
kind of purchase it was. Telling us what happened helps us fix it for the next person, but it
is not a condition of the refund.

### What we cannot refund
- Purchases more than the windows above, unless it did not work (above) or the law where you
  live says otherwise.
- Free stories. They are free.

## How to ask

Contact us at [contact address — to be set before publication] with:
- the email address on your Stripe receipt, or the receipt itself; and
- which purchase you want refunded.

You can also find your receipts on the card page in **Settings → Payment card**, which Stripe
provides.

## What happens next

We reply within [2 business days]. Refunds go back to the card you paid with, through Stripe.
Banks usually show the refund within 5 to 10 business days. A refunded pass stops working on
your device the next time the app checks your purchases.

## Chargebacks

Please ask us before disputing a charge with your bank. A refund from us is faster for you, and
a dispute costs us a fee whatever its outcome. If you do dispute a charge, the purchase it
paid for is paused while the dispute is open.

## Changes

We may change this policy for future purchases. A change never applies to a purchase you have
already made under the earlier policy.

---

### For James (not part of the published text)
These windows are proposals: 48 hours for the Week Pass (it only lasts 7 days), 14 days for the
City Pass and All-Access, 30 days for anything that did not work, one goodwill refund per pass
type. They are deliberately based on time, not on how many stories were heard: listening is
recorded only on the listener's phone, so a rule based on usage could not be checked. Reply time
and the contact address are placeholders. Refunds are issued from the Stripe dashboard
(Payments → the charge → Refund).

**Not true yet, and needed before publishing "it stops working":** a refund does not currently
take a Week Pass or City Pass away. `api/_entitlement.ts` counts any Checkout Session with
`payment_status: "paid"`, and Stripe leaves a refunded session marked paid; the refund lives on
its payment intent. The fix is small: have `/api/entitlement` read each session's payment
intent and skip one whose charge is refunded. A refunded *and cancelled* All-Access subscription
already stops, because the subscription itself ends.
