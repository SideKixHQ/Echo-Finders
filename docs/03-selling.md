# What we charge, and what it would take to charge it

*Echo Finders is a Whatishere.com product.*

`02-costs.md` is what the thing costs us to run. This is the other side, and none of it is
built. Written down because the pricing below was decided in conversation and very nearly
got lost: it survives here rather than in a chat log.

## The model

| | |
|---|---|
| Free | 10 echoes |
| Unlock everything | **$6.99**, one payment |
| First milestone | 100 paying customers |
| Conversion assumed | ~5% of active users |

The shape is right, and it is the right shape for this product specifically: an echo costs
an hour to research, verify and write, and then serves thousands of people for almost
nothing. Produce once, sell many times. Ten free is enough to be a real walk rather than a
demo, which is what makes the payment a decision about more rather than a toll gate.

## One number to resolve before planning against it

The plan carries **$15.25 of contribution per paying customer** and also "100 purchasers →
$575–600 from a $6.99 pack", which is ~$5.85 each and consistent with Apple's 15%
small-business rate. Both cannot be true of a single $6.99 purchase.

It matters more than it looks. At $250/month of infrastructure:

    $250 / $15.25  ≈ 17 customers a month
    $250 / $5.85   ≈ 43 customers a month

Two and a half times harder. $15.25 only holds if the average buyer takes roughly three
packs, and there is no evidence yet that anyone takes one. Plan against $5.85 until a real
purchase says otherwise.

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
| Pricing model | decided, above. Not implemented anywhere |
| Paywall / free-tier split | none |
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
