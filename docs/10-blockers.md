# What will get in the way

*Echo Finders is a Whatishere.com product.*

Written 2026-10-06 from the docs, the decision records and what the app actually does today.
**We build and solve as we go**: this is not a gate to stop at, it is the list to keep in view
so nothing here is a surprise. Strike items through when they are settled, with the PR or
decision that settled them.

## Decisions only James can make
- [x] ~~Does **true crime** ship in v1, or wait for a lawyer?~~ Ships (James, 2026-10-13): "we are all
  good as long as you double check the facts and have a disclaimer." So every true-crime echo must be
  fact-checked against its sources and carry a disclaimer on screen.
- [x] ~~**Who reviews and approves content?**~~ James (2026-10-13): "i give you content after review
  or i review it when you create it." Content James supplies arrives reviewed; content Claude
  drafts is reviewed by James before approval.
- [ ] **Consumers first, or airlines?** The airline cycle is "measured in quarters" (ADR-0007).
- [ ] Is a **native iOS shell** acceptable for walking if screen-lock defeats the web app? James
  (2026-10-13) already has an Apple developer account and accepts the App Store's 15%.
- [ ] **Approve pricing.** Proposed: City Pass $9.99 once, All-Access $34.99 a year, web checkout
  only (`03-selling.md`). Shown on the prototype paywall; nothing is charged until Stripe lands.

## Tier 1: blocks a real public launch

| # | Blocker | Where | First move |
|---|---|---|---|
| 0 | **Echoes everywhere people are.** James (2026-10-13): a launch needs echoes "all over the country. all major cities." Today the library is 145 echoes, 101 of them downtown Wilmington and 16 in New York. | `content/echoes/*`, `docs/00-build-plan.md` | Pick the city list (the 50 largest US metros to start), and a per-city floor (say 30 echoes in a walkable core) before a city is called covered. Each city also needs `build-streets.py` and `build-map.py` run (ADR-0019). |
| 1 | **No content is approved.** All 145 echoes are `editorial: draft`, `factCheck: unchecked`; the demo stamps them approved. Phase 1 wants 60–100 approved on one corridor. Human review is ~95% of library cost ($40k–85k for 5,000). | `content/echoes/*`, `library.generated.ts:6-8`, `02-costs.md:68-93` | James reviews (decided 2026-10-13, above). Start with the 101 downtown Wilmington echoes. Tooling: `content:status`, `content:review`, and `claims` required to approve (162 checkable sentences, 0 quoted). |
| 2 | **iOS screen lock.** In a web app on iPhone, audio and GPS stop at screen lock. The wake-lock answer needs iOS 18.4+ and a home-screen install and has never been tried on a real phone. If it fails, walking needs a native shell and App Store review of background location. | ADR-0001, ADR-0011, `ios-permissions.md` | Test on a real iPhone: `/locktest.html` measures what survives a lock (audio file, speech voice, Web Audio, GPS, timers, wake lock, lock-screen controls), in Safari and from the home screen. First result (2026-10-08, James): narration kept playing through a lock, with no lock-screen controls. Decides web vs native for walking. |
| 3 | **No real voice.** Browser speech stands in ("flat and mistimed"). ~~The ElevenLabs licence for redistribution inside a white-label airline product is unconfirmed~~: confirmed fine by James (2026-10-09). | `DEPLOY.md:71`, `01-services.md:110-113` | Voice names and which one is for children, then render. |
| 4 | **Privacy policy.** ~~True crime needs a lawyer~~: settled, see above (James, 2026-10-13). The privacy policy is still an unpublished draft with no contact. | `privacy-policy.md` | Add a contact and publish it with the app. |
| 5 | **Rights.** Archive photos are drawn stand-ins (candidates in `docs/09-archive-photos.md`, none cleared). Most map-tile licences forbid offline caching, which flights need; the self-hosted Protomaps file (OpenStreetMap data, ODbL) does not, which settles the tile half once it is live (#7). | `archive-plate.ts`, `01-services.md:34` | Clear the photo list. |

## Tier 2: blocks earning and scaling

| # | Blocker | Where |
|---|---|---|
| 6 | **No backend.** No accounts, ~~payments~~ (Stripe Checkout for the City Pass and All-Access is built in `api/` and switches on when the keys are in Vercel, `DEPLOY.md` Payments; until accounts exist Stripe is the record and Restore works only on the phone that bought), analytics, error reporting (Sentry listed, not wired), database. | `03-selling.md:69-78`, `01-services.md:86-97` |
| 7 | ~~**Map tiles.** MapTiler vs Protomaps undecided ("decide it with a spike"). Per-load tiles ~ $250/mo at 100k users, against ~$75/mo for everything else.~~ Decided (James, 2026-10-09): navy style; built 2026-10-10. Settled 2026-10-12 (ADR-0019): built from Overture's open data around every echo and served with the app from Vercel, no R2 and no upload. Esri is no longer drawn. | `01-services.md:101-107`, `02-costs.md` |
| 8 | **Airlines.** Seatback browsers (Panasonic, Thales) untested on real hardware; emulated 2026-10-13 and seat mode built (ADR-0020: full-screen landscape layout, fonts and coastlines served with the app); aircraft position feed assumed, not secured; indemnification open. Flight corridor query is 944 ms at 50k echoes (urgent around 5,000). | ADR-0001/0002/0012, `01-services.md:58-73` |
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
