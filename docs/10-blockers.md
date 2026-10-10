# What will get in the way

*Echo Finders is a Whatishere.com product.*

Written 2026-10-06 from the docs, the decision records and what the app actually does today.
**We build and solve as we go**: this is not a gate to stop at, it is the list to keep in view
so nothing here is a surprise. Strike items through when they are settled, with the PR or
decision that settled them.

## Decisions only James can make
- [ ] Does **true crime** ship in v1, or wait for a lawyer? (5 echoes; 2 allege, 1 unsolved)
- [ ] **Who reviews and approves content?** A named editor, and a CODEOWNERS team that exists.
- [ ] **Consumers first, or airlines?** The airline cycle is "measured in quarters" (ADR-0007).
- [ ] Is a **native iOS shell** acceptable for walking if screen-lock defeats the web app?
- [ ] **Approve pricing.** Proposed: City Pass $9.99 once, All-Access $34.99 a year, web checkout
  only (`03-selling.md`). Shown on the prototype paywall; nothing is charged until Stripe lands.

## Tier 1: blocks a real public launch

| # | Blocker | Where | First move |
|---|---|---|---|
| 1 | **No content is approved.** All 26 echoes are `editorial: draft`, `factCheck: unchecked`; the demo stamps them approved. Phase 1 wants 60–100 approved on one corridor. Human review is ~95% of library cost ($40k–85k for 5,000). | `content/echoes/*`, `library.generated.ts:6-8`, `02-costs.md:68-93` | Name an editor; approve the 13 Lower Manhattan echoes properly. Tooling: `content:status`, `content:review`, and `claims` required to approve (162 checkable sentences, 0 quoted). |
| 2 | **iOS screen lock.** In a web app on iPhone, audio and GPS stop at screen lock. The wake-lock answer needs iOS 18.4+ and a home-screen install and has never been tried on a real phone. If it fails, walking needs a native shell and App Store review of background location. | ADR-0001, ADR-0011, `ios-permissions.md` | Test on a real iPhone: `/locktest.html` measures what survives a lock (audio file, speech voice, Web Audio, GPS, timers, wake lock, lock-screen controls), in Safari and from the home screen. First result (2026-10-08, James): narration kept playing through a lock, with no lock-screen controls. Decides web vs native for walking. |
| 3 | **No real voice.** Browser speech stands in ("flat and mistimed"). ~~The ElevenLabs licence for redistribution inside a white-label airline product is unconfirmed~~: confirmed fine by James (2026-10-09). | `DEPLOY.md:71`, `01-services.md:110-113` | Voice names and which one is for children, then render. |
| 4 | **Legal.** Privacy policy is an unpublished draft with no contact. True crime needs a lawyer before the first one ships; every `reviewedBy` is TODO. 14 open lawyer questions: indemnification, media liability insurance, UK/EU, DMCA agent, COPPA (not named anywhere). | `privacy-policy.md`, `protection-policy.md:62-301` | One lawyer session on privacy + true crime, or pull true crime from v1. |
| 5 | **Rights.** Archive photos are drawn stand-ins (candidates in `docs/09-archive-photos.md`, none cleared). Most map-tile licences forbid offline caching, which flights need; the self-hosted Protomaps file (OpenStreetMap data, ODbL) does not, which settles the tile half once it is live (#7). | `archive-plate.ts`, `01-services.md:34` | Clear the photo list. |

## Tier 2: blocks earning and scaling

| # | Blocker | Where |
|---|---|---|
| 6 | **No backend.** No accounts, ~~payments~~ (Stripe Checkout for the City Pass and All-Access is built in `api/` and switches on when the keys are in Vercel, `DEPLOY.md` Payments; until accounts exist Stripe is the record and Restore works only on the phone that bought), analytics, error reporting (Sentry listed, not wired), database. | `03-selling.md:69-78`, `01-services.md:86-97` |
| 7 | ~~**Map tiles.** MapTiler vs Protomaps undecided ("decide it with a spike"). Per-load tiles ~ $250/mo at 100k users, against ~$75/mo for everything else.~~ Decided (James, 2026-10-09): Protomaps, self-hosted on Cloudflare R2, navy style; built 2026-10-10. Left: James uploads the US file and sets `VITE_MAP_TILES_URL` (`DEPLOY.md`, The map). Until then the app still draws Esri, which is not licensed for a paid app. | `01-services.md:101-107`, `02-costs.md` |
| 8 | **Airlines.** Seatback browsers (Panasonic, Thales) untested; aircraft position feed assumed, not secured; indemnification open. Flight corridor query is 944 ms at 50k echoes (urgent around 5,000). | ADR-0001/0002/0012, `01-services.md:58-73` |
| 9 | **The numbers disagree.** Contribution per customer is $15.25 or $5.85 (break-even 17 or 43 customers/month; plan on 43). Infrastructure is $250/mo in one doc, $75 in another. Several prices are from memory. | `03-selling.md:25-36`, `02-costs.md:185-187` |

## Tier 3: slows how we build

| # | Blocker | Status |
|---|---|---|
| 10 | **Cloud sandbox network** blocks loc.gov, nypl.org, wikimedia.org, nps.gov, si.edu, wikidata.org, api.elevenlabs.io: research, photos and audio. | Open. Allowlist them under the environment's Network access. |
| 11 | **Nothing can be checked on a real device from a session.** Sessions cannot reach `*.vercel.app` or a phone; every visual change needs James's eyes. | Open by nature. Screenshots plus a phone check per merge. |
| 12 | **Weak safety nets.** CI skipped the audits; branch protection is off; the CODEOWNERS editorial team does not exist. | Audits move into CI with Playwright as a real dependency. Branch protection and the team are GitHub settings for James. |
| 13 | **Stale docs.** Build plan said Phase 0; ADR-0005 vs 01-services on Postgres timing; ADR-0012 says `apps/*` does not exist. | Build plan marker updated with this doc; the ADR contradictions remain. |
| 14 | **Driving safety.** Nothing stops a driver using the screen while moving. | Open; deliberately deferred 2026-10-06. |

## Settled
- ~~The layout audit hung~~: it clicked controls that no longer exist; fixed and green (#28).
- ~~Audits only ran by hand~~: see #12.
