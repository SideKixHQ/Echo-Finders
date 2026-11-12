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

It cannot be discovered rather than recorded, because `vercel.json` sets
`github: { silent: true }`: Vercel posts no deployment status back to GitHub for anyone to
read, so nothing on the pull request tells you the deploy landed.

**A deploy can still be confirmed from a session, and should be.** The sandbox is refused
`*.vercel.app` by its network policy, a 403 on the tunnel, so `curl` and ordinary fetches
fail. The Vercel MCP server does not go through the container: it fetches the live site
through the account, and works. Read `/version.json` and compare `commit` against what was
merged.

*Corrected 2026-10-24. This section used to say a deploy could not be checked from here
at all, which was true of `curl` and false overall. Merges went unconfirmed for no reason,
and the suggested fix, allowing `vercel.app` as a domain, was never needed.*

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
| **Real** | Your position, on foot and driving: exploring, a planned walk and a guided walk all follow the phone (or `?at=`). A guided walk shows the way to its first stop and syncs nothing until you are there. |
| **Simulated** | A flight's position, and a walk's with `?simulate`. A `RouteProfile` walks the route for you, so a fifty-minute walk fits in about three minutes. |
| **Standing in** | The voice. Your browser reads the script aloud, which is flat and mistimed — the designed narrators are not rendered yet. |
| **Standing in** | The archive photographs. Drawn, and labelled as such in their own credit line. |
| **Real, near echoes** | The basemap: built from Overture's open data around every echo area (below). Between areas the map is the plain navy field. |

## Five things in the URL

- `?simulate` plays a walk or a road trip back on the simulation instead of the phone's
  position: the demo. Never on by itself (ADR-0018, amended 2026-11-10).
- `?speed=2` slows the simulation, so the twelve-second capture ring is watchable.
- `?start=0.4` drops you four-tenths of the way along, to skip to a busier stretch.
- `?at=<echo id>` or `?at=<lat>,<lng>` stands you there instead of where the phone is, to
  hear an echo and use the player from anywhere (James, 2026-11-08). An amber banner says
  so. Everything else is real, purchases included. For example
  `https://echo-finders.vercel.app/?at=wilmington-ellen-bellamys-long-view`.
- `?owner=<code>` turns on owner or tester mode on that phone (below, "Owner mode").

## The map

The map is built from open data and ships with the app (ADR-0019): streets with their
names, buildings, water, parks and landmarks, drawn by MapLibre in the navy style. There
is no map service, no account and nothing to set in Vercel. The map is
`apps/prototype/public/map/echoes/`: one PMTiles file per zoom-8 square (about 150 km
across, so a city is one or two files) and an `index.json` listing them. Vercel serves
them like any other file, and adding a city adds only that city's file.

**Adding a city.** After new echoes are in the library, in a new place:

    pip install pyarrow pmtiles
    python3 scripts/build-streets.py      # the walking directions
    python3 scripts/build-map.py          # the map

Commit both outputs. `build-map.py` takes a few minutes; it reads Overture Maps
(OpenStreetMap data, ODbL) from Overture's public bucket, only the parts around echoes.

It also rebuilds the zoomed-out map: `map/world.pmtiles` (land, coastline, borders, main
roads and towns everywhere, from Natural Earth, public domain, plus Overture's towns near
the echoes) and `map/coast.pmtiles` (the real shoreline around the echoes, zoom 8 to 12,
Overture's land, ODbL). `python3 scripts/build-map.py --world` rebuilds just those two.
Then `npm run content:land` lists any approved echo that stands in the water.

**Adding a drive.** A driving route's line follows the road it names
(`follows:` in `content/routes/<id>.yml`), traced once from the same Overture roads:

    pip install pyarrow pyyaml
    python3 scripts/build-route-paths.py   # writes content/routes/<id>.path.json
    npm run library:build

Commit the `.path.json`. Without one, a drive is drawn as straight lines between its
waypoints, as flights are. Directions while driving are left to the phone's own maps app.

**Picking up new streets and buildings.** About once a year, set `OVERTURE_RELEASE` to a
newer Overture release (https://docs.overturemaps.org/release/latest/) and run both again.

**Size.** Each area adds roughly 0.2 to 2 MB, to its own square's file, so no one file
grows toward GitHub's 100 MB limit, and a rebuild changes only the squares that gained
or lost echoes. `python3 scripts/build-map.py --reshard` re-cuts an old single
`echoes.pmtiles` into squares. `VITE_MAP_TILES_URL`, if ever set, still wins, and one
ending in `.pmtiles` is read as a single file.

The fonts for street names ship with the app (`apps/prototype/public/fonts`, Noto Sans,
SIL Open Font Licence). The credit under the map reads *© OpenStreetMap · Overture Maps*.

## Payments (Stripe)

**On, in test mode (2026-11-07).** The app asks `/api/config` whether payments are on; until
the three required settings below exist the answer is no, every purchase is recorded on the
phone and nothing is charged. Turning payments on is these steps, not a deploy.

1. **In Stripe** (start in **test mode**, the toggle top right), create three products and
   one extra price:
   - **Week Pass**: a one-off price, $3.99.
   - **City Pass**: a one-off price, $9.99, and a second one-off price of $6.00 for a City
     Pass bought while a Week Pass is running (`docs/03-selling.md`).
   - **All-Access**: a recurring yearly price, $34.99.
   Copy each price's id (`price_…`).
2. **In Stripe**, Settings → Billing → Customer portal: turn on *update payment method*,
   *invoice history* and *cancel subscriptions* (at period end).
3. **In Vercel**, Project → Settings → Environment Variables, add:

       STRIPE_SECRET_KEY        sk_test_…  (sk_live_… when going live)
       STRIPE_PRICE_CITY_PASS   price_…    (the City Pass price)
       STRIPE_PRICE_ALL_ACCESS  price_…    (the All-Access price)
       STRIPE_PRICE_WEEK_PASS   price_…    (optional: the Week Pass price)
       STRIPE_PRICE_CITY_UPGRADE price_…   (optional: the $6.00 City Pass price)

   The last two are optional: without them the checkout sends $3.99 and $6.00 from `PLANS`
   as one-off prices, which charges the same, but the sales then don't show under those
   products in Stripe's reports.

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

**Done in test mode:** the products exist in the Stripe sandbox:

| Product | Price id |
|---|---|
| Echo Finders City Pass, $9.99 (2026-10-09) | `price_1UOliPIsk2G8juHsveyHcC5X` |
| Echo Finders All-Access, $34.99 a year (2026-10-09) | `price_1UOliRIsk2G8juHsxx1UHAoC` |
| Echo Finders Week Pass, $3.99 (2026-11-07) | `price_1UZCRHIsk2G8juHswinYXO8o` |
| City Pass with a Week Pass counted, $6.00 (2026-11-07) | `price_1UZCRHIsk2G8juHselastC9M` |

The customer portal is configured (card updates, receipts, cancel at period end), and
cards, Apple Pay, Google Pay and Link are on (checked 2026-11-07). The live site's checkout
answers with test sessions (`cs_test_…`): only Stripe's test cards work. **Left for James to
go live:** activate the Stripe account (business details and bank), then repeat steps 1 to 5
in live mode, with the live key and live price ids in Vercel; the Radar rule; the tax
settings; and Stripe's renewal reminder email (Settings → Billing → Subscriptions and
emails) for All-Access.

What it does not do yet, on purpose: there are no accounts, so Stripe is the record of who
paid, and the phone keeps the Stripe customer id. Restore works on the phone that bought; a
second phone waits for accounts (`docs/03-selling.md`). No webhook is needed for this: the
app reads what was bought from Stripe directly when it comes back from checkout.

**The bank statement (2026-11-12).** Every Echo Finders charge reads "CHARACTER LIMIT LLC",
the account's statement descriptor (Stripe: Settings → Business → Public details). Checkout
adds no suffix: Stripe joins a suffix to the short descriptor, at most 10 characters, so the
company name could not appear in full alongside one. The All-Access product must not carry
its own statement descriptor (Product catalog → All-Access → Edit), or it overrides this.

The secret key lives only in Vercel. It is never in the repository and never in the app.

## Owner mode

James's own phone, with every echo unlocked and playable from anywhere (2026-11-08).
Open `https://echo-finders.vercel.app/?owner=<code>` once on the phone: the app checks the
code with `/api/owner` against `OWNER_CODE` (Vercel, Production, sensitive) and marks that
phone; the code is taken off the address straight away. Settings › Privacy › Owner mode
turns it off. To change the code, change `OWNER_CODE` in Vercel and redeploy: old links
stop working, phones already marked stay marked until turned off.

**Tester mode** is the same link with the tester code, `TESTER_CODE` (Vercel, Production,
sensitive), for anyone James wants testing (2026-11-08). It opens the same things and
Settings calls it Tester mode. A tester phone asks `/api/owner` again every time the app
opens, so changing `TESTER_CODE` and redeploying turns every tester off at once; give the
people who should keep testing the new link. James's own phone is unaffected.

**The App Store reviewer's key** is `REVIEWER_CODE` (Vercel, Production, sensitive;
2026-11-11). It opens tester mode exactly as `TESTER_CODE` does, typed into Settings ›
Skeleton key, but it is a separate code: changing the tester code never locks a reviewer out
mid review. Put it in App Store Connect's review notes for each submission, and retire it by
removing the variable once the app is approved.

## Analytics (Vercel Web Analytics)

Anonymous counts, on both the app and the website: visits, plus four app events (`Echo
played` and `Paywall shown`, by category; `Checkout started`, by plan and city; `Purchase
completed`, by plan). No cookies, no IP stored, nothing that identifies a person; the
address is sent without its query string (`apps/prototype/src/analytics.ts`).

- **On by default in the app** (James, 2026-11-07), off with Settings › Privacy ›
  Anonymous usage statistics. A phone that saved its settings before this change keeps
  the "off" it saved.
- **Turn it on in Vercel, once per project** (`echo-finders` and `echo-finders-site`):
  the project → **Analytics** tab → **Enable**. Until then the script is not served and
  nothing is counted.
- Visits are counted on every plan. The four app events are Vercel "custom events", which
  need a Pro plan; on Hobby they are dropped and only visits show.

## Error reports (Sentry)

**On.** When something breaks on a listener's phone, the app can send the error and its stack
to Sentry, so it can be fixed without the phone (`error-report.ts`). Sentry project:
`sidekix/echo-finders` (https://sidekix.sentry.io).

**The DSN is in the code** (`DEFAULT_SENTRY_DSN` in `error-report.ts`), not in Vercel (James,
2026-11-06). A DSN is public by design: it only allows sending events, and it ships in the
page anyway. Nothing to set up. To change or stop it:

- **Stop everything now, no deploy:** Sentry → Project Settings → Client Keys → disable the
  key. Reports and feedback are refused at Sentry's end.
- **Point at another project:** set `VITE_SENTRY_DSN` in Vercel (Production) and redeploy; it
  overrides the code. Set it to `off` to switch reporting and feedback off from the build.

Each report carries the error, its stack, the page path without its query string, the build's
commit and the browser's user agent: no position, no collection, no identifiers. At most five
per session. `docs/privacy-policy.md` says the same.

The same DSN carries **feedback**: Settings › Tell us › Send feedback, and "Something wrong
with this story?" on every echo card. What listeners send lands in Sentry under **User Feedback** (`feedback.ts`). Turn on
email alerts for new feedback there, or it will sit unread.

Error reports are **opt-in** (James, 2026-11-06). A phone
sends nothing until its owner turns on Settings › Privacy › Send error reports, so expect
few reports, and turn it on yourself on your own phone when testing.

## The website (echofinders.com)

The marketing site is `apps/site` (`@echofinders/site`): React 18, Vite, Tailwind, two pages
(Home and Partners). It began as James's Airo draft and was brought into the repo on
2026-11-07. Every word and photo is in `apps/site/src/content.ts`; prices there must match
`PLANS` in `packages/core/src/entitlement/entitlement.ts`.

It is its own Vercel project, `echo-finders-site`, with root directory `apps/site`. Merging to
`main` deploys both the app and the site.

**Which pushes build (2026-11-12).** To save Vercel builds, `scripts/vercel-ignore.sh` is each
project's `ignoreCommand`: a push to any branch other than `main` builds nothing (no preview
URLs; CI runs the checks), and a merge to `main` builds a project only when a file it is built
from changed. A merge that only touches `apps/ios` builds neither. The script lists those files
for each project; add to the list when a build starts reading something new. The domain `echofinders.com` is registered at
GoDaddy; its DNS points at Vercel (an `A` record for the apex and a `CNAME` for `www`, values
as shown in the Vercel project's Domains page).

- Photos are Unsplash images loaded from images.unsplash.com, except History, which is a
  public-domain Library of Congress plate of Fort Fisher (`public/fort-fisher.jpg`).
- "Get the app" opens the web app at https://echo-finders.vercel.app/.
- The partner form opens the visitor's email app, addressed to `partners@echofinders.com`;
  contact links use `hello@echofinders.com`. Both addresses must exist.
- Terms and refund policy links go in the footer once those pages are published (#122).

## What is most useful to hear from you

Not bugs — I can find those. The things only you can answer:

- Does arriving at an echo feel like anything?
- Is ninety seconds too long, standing on a street?
- Would you have pressed play, or walked on?
- Does the collection feel worth keeping, or like a number going up?
