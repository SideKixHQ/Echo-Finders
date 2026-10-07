# What we charge, and what it would take to charge it

*Echo Finders is a Whatishere.com product.*

`02-costs.md` is what the thing costs us to run. This is the other side, and none of it is
built. Written down because the pricing below was decided in conversation and very nearly
got lost: it survives here rather than in a chat log.

## The model

**Proposed 7 Oct 2026, waiting for James's sign-off.** The evidence is in
`11-pricing-research.md`. The paywall in the prototype shows these two offers; nothing
charges money yet.

| | |
|---|---|
| Free | 10 echoes (proposed: 10 per city; the app counts 10 in total for now) |
| City Pass | **$9.99 once.** One city, for good, including echoes added there later |
| All-Access | **$34.99 a year.** Every city, road trip and flight. Renews; cancel any time |
| Checkout | Web only (Stripe, with Apple Pay and Google Pay). No App Store purchases |
| Floor | Nothing sold under $4.99, and no lifetime plan at launch |

The $6.99 lifetime unlock is retired. It priced under every comparable product (single
audio tours sell at $8–15; Autio, the closest analogue, at $35.99 a year) and earned
nothing when the second city launched. Anyone who bought it keeps everything.

An echo outside every city (a parkway, a flight path) has no City Pass; only All-Access
opens it. Cities are a centre and a radius in `packages/core/src/entitlement/entitlement.ts`.

The shape is still the right one for this product: an echo costs an hour to research,
verify and write, and then serves thousands of people for almost nothing. Produce once,
sell many times. Ten free is enough to be a real walk rather than a demo, which is what
makes the payment a decision about more rather than a toll gate.

## What 80% margin takes

80% margin means fees, running costs and producing the stories stay at or under 20% of
revenue.

- **Fees.** Stripe is about 2.9% + $0.30: about 6% of $9.99 and 4% of $34.99, so a City
  Pass keeps about $9.40 and All-Access about $33.65. On $4.99 the fee is about 9%, on
  $2.99 about 13%: hence the floor. Apple's 30% breaks the target outright and its 15%
  leaves 5% for everything else, hence web only.
- **Running.** About $0.001 per user per month. Effectively nothing.
- **Content is the cost.** About $8–18 per echo today, almost all of it human review.
- **Per city.** A 300-echo city costs about $2.5k–5.3k to produce and needs about
  $18k–38k of sales to sit at 80%: roughly 1,800–3,800 City Passes, or the All-Access
  equivalent.
- **The whole library.** 5,000 echoes plus a year of running is about $42k–91k, which
  needs about $306k–650k of sales: roughly 19,000–41,000 buyers.

80% is a scale outcome, not a day-one number, and it improves every year because the
library is paid for once. What gets there sooner: cutting review from about 20 minutes an
echo to 7 (the `claims` tooling), which halves every figure above; and the two below.

## Tourism boards and airlines

- **Tourism boards** are the best-documented buyer: commissioned tours sell for
  $4k–10k each. Proposed: about **$7,500 for a 25-echo city pack**, which costs about
  $200–450 to produce and pays for a city's content before any listener buys.
- **Airlines** reuse the library already built, so they are nearly pure margin, but the
  sales cycle is measured in quarters and no comparable price is public. Count them as
  zero until a contract is signed.

## How they would buy, and why that is not a small question

The mechanism is the easy half. Stripe Checkout from the web app, no App Store, which keeps
about 97% instead of 70–85% and sidesteps store discovery — already on the risk list — and
ships in weeks rather than after a review cycle. ADR-0001 chose web first for its own
reasons and this agrees with it.

The hard half is that **a purchase needs something to attach to, and there is nothing**.
Today the collection lives in IndexedDB keyed by route, on one device, with no account. A
payment against that is a payment somebody loses when they clear their browser or pick up
their phone instead of their laptop.

So selling anything needs, in order:

1. **An identity.** The smallest honest version is an email and a magic link, not a
   password and not a social login. It is also the only thing that makes a purchase
   survive a device.
2. **An entitlement store.** One row: who, what they bought, when. This is the Supabase
   line in `02-costs.md` that is currently deferred, and it stops being deferrable the
   moment money is involved.
3. **A gate the engine can see.** `checkEligibility` already decides what a listener may
   hear, on age and category. Paid-or-not belongs in the same gate rather than beside it,
   or the map will advertise an echo the player then refuses.
4. **Stripe Checkout and a webhook** that writes the entitlement.

Note what is *not* on that list: nothing about the audio, the map, the packages or the
content model changes. The engine already gates playback centrally, which is the piece that
usually makes this hard.

## What exists today

| | |
|---|---|
| Pricing model | proposed, above. The prototype paywall offers both plans; nothing is charged |
| Paywall / free-tier split | built in the prototype: 10 free, then City Pass or All-Access |
| Accounts or identity | none |
| Entitlements | none |
| Stripe | not integrated |
| Onboarding | **not built.** The design has one and we have not used it |
| Permissions — camera, compass | built, including the iOS gesture requirement (`use-sensors.ts`) |
| Permissions — location | **not built.** The prototype's position is simulated, so the browser has never been asked |

The two that block a paid test are location permission and the entitlement chain. The
prototype has never asked for a real fix, which means the single most failure-prone moment
in the whole product — a listener standing in a street, deciding whether to grant
background location — has not been designed, let alone tested.

## The onboarding the design already has

`design/echo-finders-phone.prototype.html` carries a first-run flow we have not built:
choose the journey, pick interests, say who is listening, a headphone check, and the
offline pack. Two of those are doing real work rather than welcoming anybody.

**Who is listening** is how kids mode gets set without a parent hunting for it, and kids
mode is an age handed to the engine, not a filter — so asking once, up front, is the
difference between a gate that holds everywhere and a switch somebody finds later.

**The headphone check** is the one moment to ask for location, because it is the only point
where the reason is self-evident: the listener has just been told the app finds things near
them, and is holding the phone. A permission prompt that arrives with its reason already
understood is granted; the same prompt on a cold start is denied.

That is the argument for building onboarding before the paywall rather than after: it is
where permission, audience and the offline package are all settled, and all three decide
whether anybody gets far enough to be asked for money.
