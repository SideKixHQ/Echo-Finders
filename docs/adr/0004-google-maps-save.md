# ADR-0004 — "Save to Google Maps" is not an API, and the spec needs adjusting

**Status:** accepted · **Date:** 2026-09-21

## Context
The MVP spec says saved attractions should "integrate with Google Maps to let users save
locations for travel planning". This needs a correction before anyone promises it to an
airline.

**There is no public Google API that writes a place into a user's Saved list, Want-to-go
list, or any My Maps layer on their behalf.** The Maps Platform APIs are read-only with
respect to a user's personal saved places. No amount of OAuth scope changes this.

## Decision
"Save for later" is ours, and the Google hand-off is by deep link and import file:

1. **Saving is a first-class Echo Finder feature.** A saved place lives in the passenger's
   local list and in the post-flight email. That list is ours and is the reason they come
   back.
2. **Per-place Google hand-off** via a Maps URL
   (`https://www.google.com/maps/search/?api=1&query=<lat>,<lng>&query_place_id=<id>`),
   which opens the place in the passenger's own Maps app where saving is one tap.
3. **Whole-trip hand-off** by generating a KML file the passenger imports into Google My
   Maps, plus GPX for other tools.
4. Place IDs, photos and ratings come from the **Places API** at content-build time, not
   in flight, and are cached under the terms of the Places licence.

## Consequences
- Never say "we save it to your Google Maps" in marketing. Say "one tap to open it in
  Google Maps" and "we email you the whole list". Both are true and both survive review.
- Because the saved list is ours, we own the post-flight relationship and the tourism
  board partnerships. That is a better outcome than donating the data to Google.
- Read ADR before wiring Places: we must honour caching and attribution rules, which is
  why place enrichment happens in the content pipeline where it can be audited.
