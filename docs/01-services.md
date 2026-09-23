# Services & accounts we need

Ordered by when you actually have to sign up. Do not buy anything in a later phase early;
several of these have free tiers that expire on signup date, not on first use.

## Phase 0 — now (cost: $0)
| Service | Why | Plan |
|---|---|---|
| GitHub | Code **and** the content library with its editorial gate (ADR-0005) | already have |
| Nothing else | Phase 0 is pure TypeScript with no I/O by design | — |

## Phase 1 — content library (cost: ~$50–300/mo)
| Service | Why | Notes |
|---|---|---|
| **ElevenLabs** | Narration. Realistic TTS at library scale. | **Account already held.** One open question: whether the plan's commercial terms cover *redistributing* generated audio inside a product licensed to a third party (the airline). That is a step beyond ordinary commercial use and worth confirming before the library is voiced at scale. |
| **Anthropic API** | Echo drafting from source material in the discovery pipeline | pay-as-you-go |
| **Google Places API** | Attraction enrichment: place IDs, photos, ratings (ADR-0004) | $200/mo free credit covers build-time use easily |
| Cloudflare R2 | Audio, images, transcripts, route packages | zero egress fees — this matters when airlines pull packages per aircraft |

Free, no account needed, but budget engineering time: NPS API, Library of Congress,
Smithsonian Open Access, Wikidata/SPARQL, USGS, NOAA, federal and state court records.
Under ADR-0006 these public-domain sources carry the entire MVP library, which is why
there is no rights budget in this phase.

## Phase 2 — delivery (cost: ~$25–100/mo)
| Service | Why | Notes |
|---|---|---|
| **Supabase** | Postgres + **PostGIS** + storage. System of record for serving. | Pro tier. PostGIS must be enabled — corridor queries are the hot path. |
| **Fly.io** or Railway | API hosting close to the CDN | start at ~$5/mo |

## Phase 3 — passenger app (cost: ~$0–50/mo)
| Service | Why | Notes |
|---|---|---|
| **MapTiler** or Protomaps | Vector map tiles. **Must permit offline caching of tiles for a route** — most tile licences forbid it. Protomaps lets us self-host a basemap extract, which sidesteps the licence problem entirely and is the safer bet for an onboard server. | check licence first |
| Vercel | Web app hosting + preview URLs for airline demos | free → $20/mo |
| Sentry | You cannot reproduce a bug that happened at 35,000 feet | free tier |

## Phase 4 — commercial (cost: usage-based)
| Service | Why |
|---|---|
| Resend or Postmark | Post-flight "here's everything you saved" email — the retention loop |
| Stripe | Premium tier, if we go consumer |
| PostHog | Funnel analytics, self-hostable so airline data never leaves our control |

## What we actually need — checked, not assumed

An earlier version of this section cut the list from twelve services to three. Some of those
cuts were right for reasons in the architecture; at least two were right only because they
were asked for, which is not a reason. This is the version that survived checking.

### What the code says

The question underneath "do we need a database" is whether a device can answer *what is near
this route* by itself. Measured, on the real engine:

| | Index size (gzipped) | Corridor query, 50,000 echoes |
|---|---|---|
| Walking route | — | **1.7 ms** |
| Transcontinental flight | — | **944 ms** |
| 5,000-echo index | 0.85 MB | |
| 20,000-echo index | 3.4 MB | |

A world-sized index of everything a query needs — position, radius, category, rating, not
the script or the sources — is a few megabytes gzipped, fetched once and cached. So the
device can hold the whole thing, and for **walking it answers in under two milliseconds at
ten times the library we plan to build.** No server, at any scale, for the mode we lead with.

**The flight number is a real gap, and it is not a database problem.** `findEchoesAlongRoute`
already rejects on a corridor bounding box — but the bounding box of a coast-to-coast route
is most of the United States, so it rejects almost nothing and the spherical projection runs
per echo. The fix is a coarse spatial grid built once per library and walked per route
segment: order of forty lines in `geo/corridor.ts`, no infrastructure. It becomes urgent at
roughly 5,000 echoes on long-haul routes, which is exactly when Phase 1 finishes.

Worth stating plainly: **that is an argument for engine work, not for Postgres.** Buying
PostGIS to solve it would move a solved client-side problem onto a server and reintroduce
the per-user cost the whole architecture avoids.

### The list

| Service | Verdict |
|---|---|
| **GitHub** | Required. Code and the content library with its editorial gate. Held. |
| **ElevenLabs** *(or an alternative — see below)* | Required. Held. |
| **Vercel** | **Keep.** Already held, and the domain with it. Cutting it to consolidate on one vendor saved nothing real and lost per-PR preview URLs, which the demo path in `00-build-plan.md` depends on. |
| **Cloudflare R2** | Required once the library outgrows what Vercel should be serving. Zero egress is what holds the marginal cost at a tenth of a penny (`02-costs.md`). Storage only — not hosting. |
| **Anthropic API** | Required, and *more* valuable with a copywriter, not less: the fact-check pre-pass is the single highest-return line in the budget, and prose written beautifully from a source needs more checking that it did not drift, not less. |
| **Sentry** | **Keep, free tier.** Deferring it was wrong. "You cannot reproduce a bug that happened at 35,000 feet" applies just as much to a street in Manhattan, it costs nothing, and the moment it earns its place is the first external tester — which is soon. |

### Genuinely deferred, with the reason

| Deferred | Why | Bring it back when |
|---|---|---|
| **Supabase** (Postgres + PostGIS) | Measured above: the index fits on the device and the query runs there. Nothing to accelerate. | Accounts, sync, or contributions — all of which need a server for reasons that have nothing to do with geography |
| **Fly.io / Railway** | No API to host. A route package is a static file. | Same as above |
| **Google Places** | Enriches save-for-later, a Phase 4 feature, and build-time only when it arrives | Save-for-later ships |
| **Resend · Stripe · PostHog** | Phase 4 commercial layer | There is something to charge for |

### Still open, not decided

**MapTiler vs. self-hosted Protomaps.** The cost case is decisive — a per-load provider runs
~$250/month at 100k listeners against cents for a `.pmtiles` extract on R2, more than three
times the rest of the bill. But the earlier version of this section presented that as
settled, and it is not: self-hosting means we build the per-route bbox extraction that
offline packages need, and MapTiler's basemap styling is more polished out of the box on a
product where design has been a first-order concern. **Decide it with a spike, not a
spreadsheet** — one afternoon rendering the Lower Manhattan walk both ways.

## Two contract questions to start now, because they have long lead times
1. **Voice licensing.** Whether the ElevenLabs plan permits redistribution inside a
   white-labelled airline product. If it does not, the fallback is a licensed voice actor
   or an enterprise TTS agreement, and that negotiation is measured in months — so it is
   worth confirming long before the library is fully voiced.
2. **True-crime liability.** Defamation exposure on echoes involving living people, and
   whether the airline's contract indemnifies us or we indemnify them. Get this in front
   of a lawyer before the first true-crime echo ships, not after. ADR-0006's
   primary-record rule reduces but does not remove this exposure.
