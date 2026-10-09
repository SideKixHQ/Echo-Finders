# Putting the demo somewhere you can use it

*Echo Finders is a Whatishere.com product.*

The point of this is feedback on the thing rather than on screenshots of it. Once it is
connected, every push deploys and you refresh — no commands, no rebuild, nothing to keep in
sync.

## Connecting it, once

In the Vercel dashboard:

1. **Add New… → Project**, and import `SideKixHQ/Echo-Finders`.
   (GitHub still redirects the repository's old name, so an older link will quietly work
   and quietly keep the wrong name alive. Use this one.)
2. Leave every setting alone and press **Deploy**.

That is the whole thing. `vercel.json` at the repository root already says how to build it —
install at the root because this is an npm workspace, compile the content library from
`content/`, then build the prototype — so there is nothing to configure and nothing to
remember next time.

A minute or so later you have a URL. Open it on a phone.

## Where it is

**Project:** `echo-finders`, under the `side-kix` team.

    Dashboard  https://vercel.com/side-kix/echo-finders
    App        https://echo-finders.vercel.app/

The dashboard is where the build logs and the deployment history are, and it is behind a
Vercel login, so it is for you rather than for anybody you send the demo to. The address
above is the one to open and the one to send.

Two reasons it cannot be discovered rather than recorded. `vercel.json` sets
`github: { silent: true }`, so Vercel posts no deployment status back to GitHub for anyone
to read. And the sandbox these sessions run in is refused `*.vercel.app` by its network
policy: a 403 on the tunnel rather than a 404, so the address could not be probed for, and
a deploy still cannot be checked from here after a push.

Neither of those stops anything deploying: every push to `main` goes out regardless. They
only stop this file from filling itself in, and stop a session confirming afterwards that
the deploy was green. If that confirmation is worth having, adding `vercel.app` to the
environment's allowed domains is what buys it.

## Use it on a phone, not a laptop

Two of the more interesting parts only exist on a real device, and Vercel serves over HTTPS,
which is what both of them require:

- **The camera.** Tap *Then & now* on an echo that has a plate. On a laptop you get the
  drawn stand-in; on a phone you get your actual street behind a photograph, and the slider
  between them is the thing the whole screen exists for.
- **The compass.** The bearing arcs need one, and iOS will ask permission the first time —
  that is the *Use the compass* button, and it has to be a tap rather than something the
  page does on its own.

Sound matters too. The proximity cue is a real part of the design and silently missing with
the ringer off.

## What is real and what is standing in

Worth knowing before you judge it, so you spend your attention on the right things.

| | |
|---|---|
| **Real** | The engine. Capture, ranking, the queue, proximity, privacy, the corridor query — the same code an iOS build would run. |
| **Real** | The words. Every script is the real script. |
| **Simulated** | Your position. A `RouteProfile` walks the route for you, so a fifty-minute walk fits in about three minutes. |
| **Standing in** | The voice. Your browser reads the script aloud, which is flat and mistimed — the designed narrators are not rendered yet. |
| **Standing in** | The archive photographs. Drawn, and labelled as such in their own credit line. |
| **Missing** | The basemap. Tile providers are unreachable from the build environment, so the map is vector geometry on its own. |

## Two things in the URL

- `?speed=2` slows the simulation, so the twelve-second capture ring is watchable.
- `?start=0.4` drops you four-tenths of the way along, to skip to a busier stretch.

## Payments (Stripe)

Built and switched off. The app asks `/api/config` whether payments are on, and until all
three settings below exist the answer is no: every purchase is recorded on the phone and
nothing is charged, exactly as before. Turning payments on is these steps, not a deploy.

1. **In Stripe** (start in **test mode**, the toggle top right), create two products:
   - **City Pass**: a one-off price, $9.99 (or whatever price you settle on).
   - **All-Access**: a recurring yearly price, $34.99.
   Copy each price's id (`price_…`).
2. **In Stripe**, Settings → Billing → Customer portal: turn on *update payment method*,
   *invoice history* and *cancel subscriptions* (at period end).
3. **In Vercel**, Project → Settings → Environment Variables, add:

       STRIPE_SECRET_KEY        sk_test_…  (sk_live_… when going live)
       STRIPE_PRICE_CITY_PASS   price_…    (the City Pass price)
       STRIPE_PRICE_ALL_ACCESS  price_…    (the All-Access price)

   Then redeploy (Deployments → the latest → Redeploy) so the functions pick them up.
4. **US only (2026-10-09).** In Stripe, Radar → Rules, add **Block if `:card_country: !=
   'US'`**, in test mode and again in live mode. Checkout always asks for a billing
   address.
5. **Sales tax.** In Stripe, Tax → Settings: add the business address and register the
   state or states where tax is collected (an accountant's call; usually the home state to
   start). Then add `STRIPE_AUTOMATIC_TAX` = `on` in Vercel and redeploy. Until then
   checkout charges the price with no tax line; Stripe refuses automatic tax before the
   address exists, so it is a switch rather than always on.
6. Buy something on the phone with Stripe's test card `4242 4242 4242 4242`, any future
   date, any CVC. You come back to the app owning it, and Settings → Membership → Payment
   card opens Stripe's page for the card and receipts.

To go live, repeat 1 to 5 in live mode with the live key and live price ids.

**Done in test mode (2026-10-09):** both products exist in the Stripe sandbox (*Echo Finders
City Pass* `price_1UOliPIsk2G8juHsveyHcC5X`, *Echo Finders All-Access*
`price_1UOliRIsk2G8juHsxx1UHAoC`), the customer portal is configured, and both price ids
are set in Vercel, labelled TEST MODE. Left for James: the test secret key, the Radar rule
and the tax settings.

What it does not do yet, on purpose: there are no accounts, so Stripe is the record of who
paid, and the phone keeps the Stripe customer id. Restore works on the phone that bought; a
second phone waits for accounts (`docs/03-selling.md`). No webhook is needed for this: the
app reads what was bought from Stripe directly when it comes back from checkout.

The secret key lives only in Vercel. It is never in the repository and never in the app.

## What is most useful to hear from you

Not bugs — I can find those. The things only you can answer:

- Does arriving at an echo feel like anything?
- Is ninety seconds too long, standing on a street?
- Would you have pressed play, or walked on?
- Does the collection feel worth keeping, or like a number going up?
