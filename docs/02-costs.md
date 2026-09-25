# What Echo Finders costs to run

*Echo Finders is a Whatishere.com product.*

Every figure below is computed from the repository, not estimated in the abstract: script
lengths from `content/echoes/`, audio sizes from the bitrate in `packages/core/src/pkg/build.ts`,
route sizes from the per-mode budgets in `packages/core/src/modes.ts`.

## The shape of it, before the numbers

**This is a content business with almost no marginal cost.** Serving one more listener costs
a fraction of a penny per month. Adding one more *echo* costs real money, mostly in a
person's time.

That is not luck — it falls directly out of decisions already made. The engine is pure
TypeScript with no I/O, so it runs on the listener's device and there is no ranking API to
call. Content lives in git and compiles to static files. Audio is pre-rendered once and
served from a bucket with no egress fee. Nothing is generated at runtime, so nothing is
billed at runtime.

The whole cost model rests on those four properties. The section at the end lists what
would break them.

## Per user, per month

At 100,000 monthly listeners: **$0.00075** — under a tenth of a penny.

At 1,000,000: **$0.0001**. It gets cheaper with scale, because almost all of the bill is
fixed.

A heavy user — twenty walks a month, fifteen echoes each — downloads about 210 MB and still
costs essentially nothing, because R2 charges nothing for egress. The only per-user line is
bucket read operations, at $0.36 per million.

## Monthly, in total

### MVP — one city, walking, no backend

| | |
|---|---|
| Vercel (hobby) | $0 |
| Cloudflare R2 — ~100 echoes, 70 MB | $0 (inside free tier) |
| Domain | ~$1.50 |
| **Total** | **under $5/month** |

No Postgres, no API server, no tile subscription. The engine runs client-side and the
content is precompiled, so the MVP genuinely has no backend to pay for.

### At scale — 5,000 echoes, 100k monthly listeners

| | |
|---|---|
| R2 storage — 5 GB library | $0.08 |
| R2 read operations — ~1.5M | $0.54 |
| R2 egress | **$0** |
| Protomaps basemap extract, self-hosted on R2 | ~$0.25 |
| Vercel Pro | $20 |
| Sentry | $26 |
| Supabase Pro *(only once accounts or sync exist)* | $25 |
| Domain | $1.50 |
| **Total** | **≈ $75/month** |

At a million listeners this rises to roughly $100 — the only line that scales is bucket
reads, and it scales at $0.36 per million.

## One-time, to build the library

The numbers below are for a 5,000-echo library. Measured inputs: **805 characters and 89
seconds per echo**, average, across the 25 written so far.

| | Amount | Cost |
|---|---|---|
| **ElevenLabs narration** | 6.5M characters (4.0M scripts + plain-language cuts + ~30% re-renders) | **$800 – $1,300** |
| **Anthropic API — drafting and fact-check pre-pass** | ~2 calls/echo, ~30k in / ~2k out each | **$700 – $1,800** |
| **Google Places enrichment** | build-time only | $0 (inside the $200/mo credit) |
| **Human editorial review** | 5,000 × 15–30 min | **$40,000 – $85,000** |

Anthropic rates are $5/$25 per million tokens on Opus 5, $2/$10 on Sonnet 5, halved again
through the Batch API — so the model choice moves the drafting line by about 2.5×, and it is
the smallest line but one. ElevenLabs rates should be re-checked before committing; theirs
move.

### The only number that matters

**Human review is 95% of the cost of the library.** It is thirty to fifty times the API and
narration bills combined, and it is the thing that cannot be bought down by choosing a
cheaper model.

That makes the highest-leverage engineering work in this project not a feature. If a
pre-check that quotes each claim beside the exact sentence in the cited source cuts review
from twenty minutes to seven, it saves on the order of **$30,000** — and costs a few hundred
dollars of API calls plus a week of work. Nothing else available to us returns anything like
that.

True crime runs two to three times longer per echo and needs a second reviewer, which is
already why it is gated separately (`trueCrimeReview`). Budget it apart from the rest.

## Flight data, which is cheaper than it sounds

Flying needs a flight number to resolve to a route, and right now four numbers are hardcoded
(`apps/prototype/src/flights.ts`). Real lookup is an API, and the prices vary by two orders
of magnitude depending on what you ask for.

**The thing that makes this cheap is that we need almost nothing.** One call per person per
journey, at the start. No live position tracking, because the phone has GPS. No polling. No
historical data. And no flight number at all: what builds a journey is an origin and a
destination, so the app asks for two airports and ships the airport list in the bundle
(`apps/prototype/src/airports.ts`), which costs nothing and works with the wifi off.

**One correction, found by testing rather than reasoning.** An earlier version of this
section claimed a great circle between two airports was within a few miles of the real track
and therefore good enough. On this corridor it is not. The actual New York to Miami routing
follows the coast; the straight line threads between Cape Hatteras and Savannah, missing both
by more than the eighty kilometre corridor is wide, and five echoes became two. So the
picker prefers a route we have written when the pair matches one, and draws a great circle
only where we have nothing. Where content exists, the track comes with it.

That leaves a real question for later: a corridor we have written echoes for but no track
for. The answer then is either to write the track with the content, which is a few minutes
per route and free, or to buy the filed one. Writing it is almost certainly right, because
a corridor worth twenty echoes is worth ten minutes of waypoints.

| Provider | Entry | What that buys | Per lookup |
| --- | --- | --- | --- |
| FlightAware AeroAPI, Personal | free | $5/month of usage included, 10 result sets a minute | ~$0.001 to $0.05 by endpoint |
| AeroDataBox (RapidAPI) | free | 600 units a month | Pro $5.35/mo, Ultra $32/mo, Mega $160/mo |
| AviationStack | free | 100 requests a month | Basic $49.99 for 10k, Pro $149.99 for 50k, Business $499.99 for 250k |
| FlightAware AeroAPI, Standard | $100/mo minimum | 5 result sets a second, history, email support | metered against the minimum |
| Cirium, OAG | quote | airline-grade schedules and status | enterprise, five figures a year |

What that means for us, at one lookup per flight:

- **Demo and pilot: nothing.** AeroAPI Personal includes $5 a month of usage, which at a
  cheap endpoint is on the order of a thousand lookups. AeroDataBox's free tier does the same
  job. This costs zero until there are real people on real aeroplanes.
- **A thousand to ten thousand flights a month: five to fifty dollars.** AeroDataBox Pro or
  Ultra, or AviationStack Basic at half a cent a lookup.
- **A hundred thousand flights a month: a few hundred dollars**, which is when AeroAPI's
  $100 minimum starts paying for itself and the volume discounts begin.

Worth saying plainly: **the Google Directions key for driving will cost more than this**, and
sooner. A flight is one lookup at the gate; a drive re-routes continuously, so the call
volume is per minute rather than per journey.

Two things that would change the picture. If we ever want the *filed* track rather than a
great circle, that is a different and dearer endpoint, and the case for it is turbulence
reroutes and holding patterns rather than accuracy over open country. And a schedules feed,
so somebody can pick tomorrow's flight before they leave the house, is a different product
from status lookup and prices like one.

## Sizes, for reference

| | |
|---|---|
| One echo, 89s at 64 kbps mono Opus | 695 KB |
| A 12-echo walking route | 8.5 MB *(budget: 60 MB)* |
| A 50-echo flight | 35.6 MB *(budget: 250 MB)* |
| The whole 5,000-echo library with variants | 5.0 GB |

Every mode is using well under a fifth of its package budget, which means **we can afford
96 kbps** — a walk becomes 12.8 MB and the library 7.5 GB, at a storage cost of about eleven
cents a month. Worth doing: this is a product people listen to on headphones in the street,
and it is the cheapest quality improvement available anywhere in the stack.

## What would break this

The near-zero marginal cost is a property of the architecture, not a discount. Four things
would end it, and three are already decided correctly:

1. **Per-load map tiles.** A hosted provider at ~$0.50 per thousand loads would cost ~$250/month
   at 100k listeners — more than three times the rest of the bill combined, and the single
   largest line item on this page. Self-hosting a Protomaps extract on R2 costs cents and
   sidesteps the offline-caching licence problem at the same time (already flagged in
   `01-services.md`). **This is the one live decision on this page.**
2. **Any runtime model call.** Generating or ranking anything per-listener turns a fixed cost
   into a per-user one. ADR-0003 already forbids it, for bandwidth reasons; the economics
   agree.
3. **Runtime TTS.** Same shape. Pre-rendering once is both cheaper and the only thing that
   works offline.
4. **Accounts and sync.** Deferred in the build plan. When it lands it adds Supabase and a
   real per-user data cost — worth doing when there is a reason, not before.

## Two caveats

Anthropic pricing here is current and exact. **ElevenLabs, Cloudflare, Vercel, Sentry and
Supabase figures are from memory and should be verified** before any of them is committed to
— third-party pricing moves, and the ElevenLabs line is the one most likely to be stale.

The other open question is the one already recorded in `01-services.md`: whether our
ElevenLabs plan permits *redistributing* generated audio inside a product licensed to a third
party. That is a step beyond ordinary commercial use. It does not change the numbers above,
but it could change whether they are spendable at all — worth settling before the library is
voiced at scale, because re-voicing 5,000 echoes is the expensive version of finding out.
