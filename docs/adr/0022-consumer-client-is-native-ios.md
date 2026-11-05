# ADR-0022: The consumer client is a native iOS app, built with React Native

**Status:** accepted · **Date:** 2026-11-05 · **Amends ADR-0001 for the consumer product**

## Context

ADR-0001 decided the passenger client is a web PWA, and its reasoning was entirely about
**airlines**: seatback systems render web content in an embedded browser, BYOD portals are
captive web pages, and a passenger who did not install before boarding cannot install after
boarding. All of that is still true.

What changed is who the first customer is. Consumers were chosen over airlines on
2026-10-14, and airline work waits for a buyer. So the client ADR-0001 was written for is
no longer the client being built first, and its reasoning does not transfer.

Against the consumer product, web loses on two counts.

**Capability.** Walking mode promises an echo opens when you arrive with the phone in a
pocket and the screen off. A web app cannot do that at all. It has no background location,
no reliable lock-screen audio and no StoreKit. The wake lock built in September only ever
covered a phone the listener is holding, and `docs/10-blockers.md` #2 has treated the
screen-lock test as the deciding experiment since October. That framing was wrong: even a
passing result would not give a web app the ability to wake itself from a pocket. The test
is still worth running, but it was never going to decide this.

**Credibility.** James (2026-11-04), asked why the App Store matters: "its credibility."
A consumer product people pay $9.99 for is expected to be in the App Store, and the
developer account, enrolment and agreements are already in place at no cost.

## Decision

The consumer client is a **native iOS app built with React Native**, in this monorepo,
importing `@echofinders/core` unchanged.

**The web client stays.** It is the only thing that can run on a seatback (ADR-0001) and
the only thing a QR code on a street sign can open with no install. One engine, two shells.

### Why React Native rather than Flutter, Swift or a wrapper

`packages/core` is 8,957 lines of pure TypeScript across 42 files, with 637 tests, and it
was checked for browser APIs on 2026-11-05 and has none. It is the most valuable and the
subtlest code in the project: ranking, playlist scheduling, proximity, route profiles,
entitlement, privacy.

- **React Native** imports it unchanged.
- **Flutter** is Dart, so it means rewriting the engine in another language and re-earning
  637 tests. It would also leave the React web app in place for seatbacks, so the engine
  would exist twice, in two languages. That is the worst available outcome.
- **Swift** has the same rewrite problem as Flutter without the second platform.
- **A Capacitor or WKWebView wrapper** keeps all the code and solves nothing: a WebView has
  the same background limits as Safari, and a thin wrapper around a website is the
  textbook Guideline 4.2 rejection.

What this costs is the views: roughly 14,570 lines of TSX become React Native components.
About a third of the app's code, and none of the engine.

## Consequences

- **A second client to maintain**, deliberately. The alternative is losing either the
  airline path or the consumer one.
- **Payments change.** Guideline 3.1.1 requires StoreKit to unlock content in an iOS app.
  Prices were approved on Stripe's fees (`docs/03-selling.md`), so the economics want
  rechecking. StoreKit does fix cross-device Restore, which the Stripe path cannot do
  without accounts.
- **ADR-0003's offline package finally has a client that can hold it.** The web app has no
  service worker and cannot work offline at all; a native app can carry audio and tiles
  properly.
- **ADR-0021 becomes exercisable** rather than merely tested. Two-stage arrival was written
  for a platform that can register Core Location regions, and this is that platform.
- **`docs/00-build-plan.md` is now wrong** where it lists native iOS and Android under
  "What we deliberately are NOT building yet". Android is still not being built; iOS is.
- **Android is free later and is not promised now.** React Native builds it from the same
  source, but no commitment is made here.
- **`docs/ios-permissions.md` stops being hypothetical.** It was written in September for
  exactly this route: Info.plist purpose strings, the background-location request ladder,
  the App Privacy table and draft review notes.
