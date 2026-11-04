# Submitting to Apple — what stands in the way

*Echo Finders is a Whatishere.com product.*

Written 2026-11-04 by reading the repository, running the gate, and checking Apple's
current App Review Guidelines rather than remembering them. Every claim below was verified
against a file, a command, or Apple's own published text; the last section says what could
not be verified from here and why.

---

## The headline

**There is nothing to submit.** Echo Finders has no iOS target. Not an incomplete one, not
a stale one — none.

```
find . -iname "*.xcodeproj" -o -iname "*.pbxproj" -o -iname "Info.plist" \
       -o -iname "capacitor.config.*" -o -iname "Podfile" -o -iname "eas.json"
→ no results
grep -riE "capacitor|cordova|react-native|expo|tauri" package.json apps/*/package.json
→ no results
```

This is not an oversight. It is a decision, twice stated:

- **ADR-0001** (accepted 2026-09-21): "The passenger client is a **web PWA**." The reasoning
  is about inflight delivery — seatback systems render web content in an embedded browser
  and a native binary cannot be deployed there at all.
- **`docs/00-build-plan.md`**, under *What we deliberately are NOT building yet*:
  "Native iOS/Android apps — ADR-0001."

So "submit to Apple" reverses an accepted ADR. CLAUDE.md says to check the ADRs before
reversing any decision, which is what this document is for. It is not an argument against
doing it — the App Store may well be right for a consumer launch, and `docs/10-blockers.md`
already records that James has an Apple developer account. It is a statement that the work
has not started and that reversing ADR-0001 is a decision, not a task.

There is also a second, quieter problem. ADR-0001's case for web is about **airlines**.
Consumers-first was decided on 2026-10-14. If the consumer product is native and the
airline product is web, that is two clients, and the ADR's consolation — "`@echofinders/core`
is pure TypeScript and runs unchanged inside React Native" — is the thing that makes it
affordable. Worth deciding deliberately rather than discovering.

---

## Two routes to an App Store build, and what each costs

### A. Wrap the existing PWA (Capacitor or a WKWebView shell)

Fastest. Days, not weeks. It also walks straight into **Guideline 4.2, Minimum
Functionality**, which says verbatim:

> Your app should include features, content, and UI that elevate it beyond a repackaged
> website. If your app is not particularly useful, unique, or "app-like," it doesn't belong
> on the App Store.

A thin wrapper around a web app is the textbook 4.2 rejection. Echo Finders has a real
argument against it — camera viewfinder, compass, GPS proximity, offline audio — but the
argument only works if those are wired to native capabilities rather than running in a
WebView. And a WebView does not fix the problem that made native attractive in the first
place: **screen-lock audio and background location**. A wrapped web view has the same
limits as Safari.

### B. A real native shell around `@echofinders/core`

Weeks. This is what ADR-0001 anticipated, and the only route that actually buys anything:
real background location, real lock-screen audio with `UIBackgroundModes`, StoreKit, and
native permission prompts. `docs/ios-permissions.md` is already written for this route,
including Info.plist purpose strings and draft review notes.

**Route B is the only one that solves blocker #2** (iOS screen lock). Route A is a
distribution change with no capability gain.

---

## Blockers, in the order they would stop a submission

### Tier 1 — the app is not finished

| # | What | Evidence |
|---|---|---|
| A1 | **No iOS target exists.** | Above. |
| A2 | **No audio.** Zero echoes have been rendered. The product is an audio product and there is no audio. Narration is the browser's speech synthesiser, which `speech-audio.ts` itself calls "flat", adding "every duration it produces is wrong". | `find content apps/prototype/public -iname "*.mp3"` → 0 files. `grep -rl "^renders:" content/echoes/` → 0 echoes. |
| A3 | **ElevenLabs is still locked out.** The environment holds a 64-character hex value with no `sk_` prefix. The live API rejects it: `api_key_id_used_as_api_key`. That is the key's ID, not the key. | Tested against `api.elevenlabs.io` on 2026-11-03 and again on 2026-11-04. |
| A4 | **No archive photographs are cleared.** `archive-plate.ts` draws fabricated stand-ins, by design and with an honest credit. No echo carries a photo. | `grep -rl "^photo:" content/echoes/` → 0. |
| A5 | **16 of 329 echoes are approved**, all of them Wilmington. The shipped bundle overrides `editorial` to `"approved"` for all 329, so the live site is showing 313 unreviewed drafts. | `scripts/build-library.mjs:118`. `content:validate` → "329 echoes · 16 approved". |
| A6 | **No service worker. The app cannot work offline at all.** ADR-0001 says "Offline is a service worker plus a cached route package"; ADR-0003 makes the offline package the whole delivery model. The engine's builder (`packages/core/src/pkg/build.ts`) exists and the app never calls it. | `grep -rn "serviceWorker\|workbox\|vite-plugin-pwa" apps/prototype` → nothing. |
| A7 | **iOS screen lock is still untested on a real iPhone**, since one partial result on 2026-10-08. This is the thing that decides whether walking works at all. | `docs/10-blockers.md` #2. |

A2, A4 and A5 together are a direct hit on **Guideline 2.1(a), App Completeness**:

> placeholder text, empty websites, and other temporary content should be scrubbed before
> submission.

Fabricated photographs and a browser-TTS stand-in voice are exactly that.

### Tier 2 — legal and store metadata that does not exist

| # | What | Evidence |
|---|---|---|
| B1 | **The privacy policy is an unpublished draft with a placeholder contact** (`[privacy contact address — to be set before publication]`) and is served nowhere — it exists only as `docs/privacy-policy.md`. | Guideline **5.1.1(i)** requires a privacy policy link "in the App Store Connect metadata field **and within the app** in an easily accessible manner". |
| B2 | **There is no Terms of Service or EULA.** Nothing in the repo. Apple applies its standard EULA by default, but a subscription product normally wants its own. | `grep -rliE "terms of (service\|use)\|EULA" docs/ apps/ README.md` → nothing. |
| B3 | **There is no support contact anywhere.** No email address exists in the repository. App Store Connect requires a support URL, and Guideline 1.2 requires "published contact information". | `grep -rnoiE "<email pattern>" docs/ README.md DEPLOY.md` → nothing. |
| B4 | **No custom domain.** The app lives at `echo-finders.vercel.app`. Allowed, but a consumer product's support and privacy URLs on a `vercel.app` subdomain reads as unfinished. | `vercel.json`. |
| B5 | **The privacy policy has never had legal review**, and `docs/ios-permissions.md` lists that as one of two things to do before submitting. True crime ships on James's say-so (2026-10-13) with fact-checking and a disclaimer, which is a commercial decision rather than a legal opinion. | |

### Tier 3 — payments, which is where the money changes

**Guideline 3.1.1** is unambiguous:

> If you want to unlock features or functionality within your app, (by way of example:
> subscriptions, in-game currencies, game levels, access to premium content, or unlocking a
> full version), you must use in-app purchase.

City Pass and All-Access unlock premium content. In an iOS app they need **StoreKit
in-app purchase**. The current implementation is Stripe Checkout in a browser (`api/checkout.ts`,
`apps/prototype/src/payments.ts`), still in test mode.

The nuance, and it is real: **Guideline 3.1.1(a)** was rewritten after the 2025 Epic
injunction and now says entitlements for external purchase links "are not required for
developers to include buttons, external links, or other calls to action in their **United
States storefront** apps". Two things follow.

- On the US storefront an app may link out to Stripe. That is genuinely useful here,
  because `DEPLOY.md` already records a Stripe Radar rule blocking non-US cards — the
  product is US-only today anyway.
- It does **not** remove 3.1.1's requirement to offer IAP for unlocking content, and it
  does not permit alternative payment processing inside the app. Links must open in the
  default browser.

Two consequences worth costing before anything is built:

1. **Pricing was approved on web-checkout economics.** $9.99 City Pass and $34.99/year
   All-Access were approved 2026-10-14 against Stripe's fees. `docs/10-blockers.md` records
   that James "accepts the App Store's 15%" — that is the Small Business Program rate,
   which requires enrolment and applies below $1M/year. Worth confirming enrolment rather
   than assuming the rate.
2. **Restore across devices does not work.** There are no accounts: the phone keeps the
   Stripe customer id, so Restore only works on the phone that bought
   (`apps/prototype/src/payments.ts:94`). 3.1.1 says "you should make sure you have a
   restore mechanism for any restorable in-app purchases." StoreKit gives cross-device
   restore for free via the Apple ID, so going native actually *fixes* this rather than
   complicating it.

### Tier 4 — smaller, but each one is a rejection or a credibility problem

| # | What | Evidence |
|---|---|---|
| D1 | **`contentWarning` is never shown to anyone.** The validator requires it and its own error message says it "must be read before the echo begins"; `parse.ts` reads it; `types.ts` carries it; no component renders it. Twenty true-crime echoes carry a warning nobody sees. What *is* shown is `CRIME_NOTE`, a generic presumption-of-innocence line — a different thing serving a different purpose. | `grep -rn "contentWarning" apps/prototype/src --include=*.tsx` → nothing outside the generated bundle. `validate.ts:453`. |
| D2 | **The analytics opt-in controls nothing.** `Privacy.tsx:174` offers a toggle; `PrivacySettings.analytics` is read by nothing. The privacy policy describes usage statistics as opt-in and anonymous. Offering a consent control for a system that does not exist is the kind of mismatch Apple's App Privacy declaration punishes. | |
| D3 | **No crash or error reporting.** Sentry is listed in `01-services.md` and is not wired. Submitting a first native build with no crash visibility is flying blind through exactly the period you need it. | |
| D4 | **Age rating is undecided.** Twenty true-crime echoes, `minAge` enforced in ranking (`score.ts:92`), and a kids mode. Apple's questionnaire will produce a rating; a 17+ rating would change how the kids mode reads in the listing. **Guideline 1.1.2** covers "realistic portrayals of people or animals being killed", which is worth reading against the true-crime scripts before answering the questionnaire. | |
| D5 | **The voices have no names.** `content/voices.yml` carries `name: TODO` for all three, so `voices.ts` ships placeholders rather than putting fiction in the interface. Cosmetic, but it is on screen under the player. | |

---

## What is genuinely in good shape

Worth saying, because the list above is long and the app is not in bad condition.

- **637 tests pass** across 30 files, and the gate runs typecheck, tests, content
  validation, build and eight browser audits.
- **33,107 lines** of app source. The feature surface is real: map, walk mode, viewfinder,
  compass, collection, routes, paywall, privacy settings, seatback mode, transcripts.
- **The content pipeline is unusually rigorous.** Every approved echo has every checkable
  sentence quoted verbatim against a cited source, enforced in CI, with nothing
  provenance-related reaching the client.
- **The privacy position is a real asset.** Location is processed on device and never
  transmitted. "Data Not Collected" is an honest answer and a rare one, and
  `docs/ios-permissions.md` already has the App Privacy table and the background-location
  review notes drafted.

---

## Questions only James can answer

1. **Is this actually a reversal of ADR-0001, or does "ready to submit" mean something
   else** — an installable PWA, a TestFlight build, a demo? The answer changes everything
   below it.
2. **If native: wrapper or real shell?** Route A is days and buys distribution only. Route
   B is weeks and is the only one that fixes screen-lock audio and background location.
3. **Who builds and maintains the iOS client?** This repository has no Swift, no Xcode
   project and no iOS CI.
4. **Does the web client stay?** Airlines need it (ADR-0001). Two clients is a standing
   cost.
5. **IAP or US-storefront link-out, and is Small Business Program enrolment done?** The
   approved prices assumed Stripe's fees.
6. **What is the legal entity and seller of record** for App Store Connect — Whatishere.com?
   An organisation account needs a D-U-N-S number, which can take days.
7. **What are the support and privacy URLs, and the contact address?** Three fields that
   cannot be left blank, and none exists today.
8. **Who is the lawyer**, for the privacy policy, the terms, and a read of the true-crime
   material against Guideline 1.1.2?
9. **How many approved echoes is a product?** Sixteen is not. Phase 1's own exit test wants
   60–100 on one corridor.
10. **Which geography ships first?** The 2026-11-04 instruction to focus on Wilmington,
    Wrightsville Beach and Carolina Beach suggests a Cape Fear regional product, which
    would be a coherent and achievable v1 — far more so than the 88-place list in
    `12-cities.md`. Today Wilmington has 105 echoes and the two beach towns have **zero**.

---

## What could not be verified from here, and why

- **Anything on a real iPhone.** Screen lock, camera, compass and sound need James's own
  device. This is blocker #11 and it is unchanged.
- **The Apple developer account's state** — enrolment type, Small Business Program status,
  agreements signed. Not visible from a repository.
- **Whether Stripe's live mode is configured.** `DEPLOY.md` records test mode only, with
  the secret key, Radar rule and tax settings still outstanding for James.
- **The exact current text of Apple's guidelines beyond what was fetched.** The quotations
  above come from `developer.apple.com/app-store/review/guidelines/` read on 2026-11-04,
  but the page is 114,000 characters and roughly the last 14,000 were not read. Re-read
  before submitting: Apple revises these without notice, and
  `docs/ios-permissions.md` already carries the same warning about Info.plist key names.
