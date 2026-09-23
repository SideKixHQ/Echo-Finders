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

## What we can actually cut

The table above is the full arc through Phase 4. Asked what we need *to ship*, the honest
answer is **three accounts, two of which we already hold** — and that is not corner-cutting,
it falls directly out of decisions already made. The engine is pure TypeScript with no I/O,
so it runs on the listener's device; content lives in git and compiles to static files;
audio is rendered once. Nothing is generated at runtime, so there is nothing to run.

### The MVP list

| Service | Why it survives the cut |
|---|---|
| **GitHub** | Code and the content library with its editorial gate. Already held, free. |
| **Cloudflare** (Pages + R2) | One account covers hosting *and* file storage, with zero egress fees. Picking one vendor for both is why this list is three lines rather than four. |
| **ElevenLabs** | Narration. Nothing else does this. Already held. |
| *(Anthropic API)* | Only if we draft with AI. With a copywriter writing, its remaining job is the fact-check pre-pass — smaller spend, and the highest-return one we have. |

### What comes off, and when it comes back

| Deferred | Why it is not needed yet | Bring it back when |
|---|---|---|
| **Supabase** (Postgres + PostGIS) | Content is in git and the corridor query runs client-side. There is no server-side query to accelerate. | Accounts, sync, or contributions land |
| **Fly.io / Railway** | There is no API to host. The route package is a static file. | Same |
| **MapTiler** | A per-load tile provider would cost ~$250/month at 100k listeners — more than three times everything else combined (`02-costs.md`). A self-hosted Protomaps extract on R2 costs cents and sidesteps the offline-caching licence problem at the same time. | Never, most likely |
| **Google Places** | Enriches save-for-later, which is a Phase 4 feature. Build-time only when it arrives. | Save-for-later ships |
| **Sentry** | Genuinely useful, free tier, and nothing is in anyone's hands yet. | First external testers |
| **Vercel** | Cloudflare Pages does the same job in the account we already need for storage. | Only if we want preview URLs badly enough to run two vendors |
| **Resend · Stripe · PostHog** | Phase 4 commercial layer. | There is something to charge for |

The rule underneath all of this: **a service earns its place when something cannot be
precomputed.** Almost nothing here cannot be precomputed, which is the same property that
keeps the marginal cost per listener under a tenth of a penny.

## Two contract questions to start now, because they have long lead times
1. **Voice licensing.** Whether the ElevenLabs plan permits redistribution inside a
   white-labelled airline product. If it does not, the fallback is a licensed voice actor
   or an enterprise TTS agreement, and that negotiation is measured in months — so it is
   worth confirming long before the library is fully voiced.
2. **True-crime liability.** Defamation exposure on echoes involving living people, and
   whether the airline's contract indemnifies us or we indemnify them. Get this in front
   of a lawyer before the first true-crime echo ships, not after. ADR-0006's
   primary-record rule reduces but does not remove this exposure.
