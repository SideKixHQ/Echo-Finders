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

## Two contract questions to start now, because they have long lead times
1. **Voice licensing.** Whether the ElevenLabs plan permits redistribution inside a
   white-labelled airline product. If it does not, the fallback is a licensed voice actor
   or an enterprise TTS agreement, and that negotiation is measured in months — so it is
   worth confirming long before the library is fully voiced.
2. **True-crime liability.** Defamation exposure on echoes involving living people, and
   whether the airline's contract indemnifies us or we indemnify them. Get this in front
   of a lawyer before the first true-crime echo ships, not after. ADR-0006's
   primary-record rule reduces but does not remove this exposure.
