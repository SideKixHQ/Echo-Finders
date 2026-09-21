# ADR-0001 — The passenger client is a web app, not Flutter or React Native

**Status:** accepted · **Date:** 2026-09-21

## Context
The original spec proposed Flutter or React Native. That is the right instinct for a
consumer travel app and the wrong one for inflight entertainment.

## How passengers actually reach inflight software
1. **Seatback systems** (Panasonic eX3/eXW, Thales AVANT) render their web content in an
   embedded browser. A native binary cannot be deployed there at all.
2. **BYOD portals** are captive-portal web pages served from the onboard server. The
   passenger joins the aircraft wifi and a page opens. There is no app store, because
   there is usually no internet with which to reach an app store.
3. A passenger who did not install our app before boarding **cannot install it after
   boarding**. Any native-only strategy loses everyone who did not plan ahead, which is
   almost everyone.

## Decision
The passenger client is a **web PWA** built with Next.js + MapLibre GL, designed to be
served either from our CDN (pre-flight) or from an onboard server (in-flight), and
installable to a home screen for frequent flyers.

## Consequences
- One codebase demos to an airline as a URL. That matters enormously in a sales cycle.
- Offline is a service worker plus a cached route package, not an app bundle.
- If a consumer-brand native app later earns its place, it wraps the same engine:
  `@echofinders/core` is pure TypeScript and runs unchanged inside React Native.
- We give up native background audio. Mitigation: the Media Session API plus a wake lock
  covers a seated passenger with headphones in, which is the entire use case.
