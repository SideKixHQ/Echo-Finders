# ADR-0003 — Everything ships as a precomputed route package

**Status:** accepted · **Date:** 2026-09-21

## Context
Inflight connectivity is metered, slow, shared between hundreds of passengers, and
frequently absent over oceans and at altitude changes. Streaming audio per passenger on
demand is not viable, and calling a ranking API mid-flight is not viable either.

## Decision
All selection work happens **before pushback**. Pre-flight download is the primary
delivery path, not a fallback: a passenger who lands on the app mid-flight with nothing
cached should be the exception we design around, not the case we design for. A route package is a single signed bundle:

- the flight plan and corridor geometry,
- the ranked candidate echo set (roughly 3× what a flight can play, so filter changes
  and skips still have material),
- audio, transcripts and images, content-addressed,
- map tiles for the corridor at the zoom levels we allow.

In flight the client does zero network I/O. Position advances, the client picks the next
echo from a set it already holds.

## Consequences
- Package size is the constraint that governs content length and audio bitrate.
  Budget: **≤250 MB for a 3-hour domestic flight** at 64 kbps mono Opus.
- Kids mode, true-crime off and category filters must all be satisfiable from one
  package, so the package carries every variant the passenger might switch to.
- Onboard servers can host packages for the routes that aircraft actually flies, which is
  how this scales to a fleet without any passenger-facing bandwidth at all.
- The package ships *candidates plus geometry*, not a fixed running order. Because the
  engine is pure TypeScript with no I/O it runs unchanged in the passenger's browser, so
  the client re-runs `buildPlaylist` locally whenever a filter changes. Switching on true
  crime over Virginia re-sequences the rest of the flight instantly, offline.
- Budget pressure must degrade every audience together. The builder interleaves its
  coverage playlists round-robin for exactly this reason; taking them in declaration order
  silently starved children's content, which is the failure mode that matters most.
