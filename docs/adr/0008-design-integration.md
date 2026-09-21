# ADR-0008 — What the phone prototype changed in the content model

**Status:** accepted · **Date:** 2026-09-21

## Context
The phone prototype (see `design/`) is further along than a visual comp: it specifies
player behaviour, and player behaviour is a content requirement. Three of its features
cannot be built without changing what a echo *is*, and a fourth is modelled in a way that
would cause real problems in production.

## 1. Long echoes cannot be centred on the place they describe
The prototype's library runs from 3:10 to 15:22. The engine assumed 30s, 90s and 3½
minutes, and centred every echo on the moment the listener was nearest its subject.

At cruise that breaks badly. A ten-minute echo covers roughly 1,400km, so centring it
means beginning five minutes before the place comes into view and ending five minutes after
it is gone. Worse, the scheduler's drift budget is measured from the anchor — so a
ten-minute echo could never satisfy it, and **long-form content would simply never have
played**. The tests passed throughout, because no fixture had a long echo in it.

**Decision:** a echo's anchor — its "you are here" moment — is its midpoint up to four
minutes and a fixed one-minute lead beyond that (`anchorOffsetS`). Long echoes begin
shortly before the place arrives and run on into whatever comes next, which is how a
documentary works anyway. A `deep` format is added at a nominal ten minutes.

## 2. "Simple audio" is a second asset, not a setting
The prototype's toggle reads "Plain words, shorter", and its data carries a distinct title,
duration and script for each echo. That is correct and worth protecting: it is not the same
audio played faster, and it is not a summary generated on the fly.

It also serves far more people than the name suggests — younger listeners, anyone listening
in a second language, anyone tired at the end of a long flight, and anyone who just wants
the short version.

**Decision:** `SimpleVariant` is a first-class part of a echo, validated in CI, and
required to actually be shorter than the full telling.

## 3. Line seeking needs real timings
Previous/next *line* and read-along highlighting both need sentence-level timings. The
prototype estimates them from word count, which is fine for a prototype and not fine once
there is recorded audio, because the drift accumulates over a fifteen-minute echo.

**Decision:** `Transcript` carries per-line `atS` and `durationS`, taken from the TTS
render rather than estimated. The validator enforces monotonic, non-overlapping lines that
fit inside the audio — an overlap silently highlights the wrong line for the remainder of
the echo, which is the sort of bug nobody reports and everybody notices.

## 4. Advertising is not a echo category
The prototype models ads as one more entry in the category list, alongside History and
Kids. That is convenient for rendering and wrong for everything else: it means every age
gate, interest filter, variety rule and already-heard check treats a restaurant promotion
as editorial content.

Advertising needs things a category cannot express: frequency caps, campaign windows, a
per-advertiser kill switch an airline can operate without editing content, mandatory
disclosure, and a hard guarantee it never reaches children.

**Decision:** `Sponsorship` is a property a placement carries, not a category. Validation
requires disclosure and an advertiser id, and gates placements at 13+. Sponsored content is
exempt from the editorial sourcing rules, because an advertisement makes no factual claim we
are vouching for and requiring a citation would only produce meaningless ones.

## What the prototype already gets right
Its saved-list action reads **"Send list to Google Maps"**, not "save to Google Maps" —
which is exactly what ADR-0004 concluded is the only thing that can actually be built.

## Left open
- The prototype's eight UI categories versus the engine's longer taxonomy. Someone has to
  own that mapping: it decides what a filter chip actually filters.
- "Submit a echo" conflicts with ADR-0005, which keeps editorial control closed at launch.
- The narrator picker multiplies TTS cost and package size by the number of voices offered.
