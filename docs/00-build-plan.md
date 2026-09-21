# Echo Finder — Build Plan & Order of Operations

*Echo Finder is a Whatishere.com product.*

## The thing we are actually building

The app is not the asset. The asset is **a verified, geo-tagged echo library plus the
engine that assembles a personalised audio route for any given flight**. An airline can
replace a UI in a quarter. They cannot replace 5,000 fact-checked, rights-cleared,
narrated, coordinate-anchored echoes and the ranking logic that turns them into a
three-hour listen that never repeats itself and never plays a murder to a seven-year-old.

Every sequencing decision below follows from that. We build the engine and the library
first, and the pretty map last, because the map is the easy part.

## Order of operations

### Phase 0 — Foundation (week 1) ← **we are here**
- Monorepo, TypeScript strict, test runner.
- `@echofinder/core`: the domain model and the engine. Pure TypeScript, zero I/O, zero
  external services. Everything below depends on it; it depends on nothing.
- Content schema + validator, so bad content cannot enter the library.
- Decision records for the calls that are expensive to reverse.

**Exit test:** `npm test` green, and we can compute a flight corridor, rank echoes along
it and emit a playlist entirely offline, from fixture data.

### Phase 1 — Content library v0 (weeks 2–4)
- Five corridors: JFK↔MIA, JFK↔LAX, ATL↔MCO, ORD↔DEN, CLT↔JFK.
- 60–100 approved echoes on the first corridor before writing a line of UI.
- Echo discovery from NPS / Library of Congress / Smithsonian / Wikidata, drafted by
  AI, **published only by a human**.
- Content lives as reviewed files in git (see ADR-0005) — not a CMS, not yet.
- One narrator, TTS, three lengths (30s / 90s / 3min), kids variant.

**Exit test:** a JFK→MIA route package builds to a real playlist with real audio and
every claim traceable to a cited source.

### Phase 2 — Delivery (weeks 4–6)
- Postgres + PostGIS as the system of record; content files compile into it.
- Route package builder: corridor → ranked echoes → signed offline bundle.
- API: `GET /routes/:id/package` returns everything a flight needs, once, before pushback.

**Exit test:** an aircraft with no internet after pushback still plays a full flight.

### Phase 3 — The passenger app (weeks 6–10)
- Web PWA (see ADR-0001). Real vector map, animated flight path, tappable pins.
- Audio engine driven by the position source, not by a timer.
- Categories, kids mode, age gate, true-crime toggle, save-for-later.

**Exit test:** a simulated JFK→MIA flight, start to finish, headphones on, no babysitting.

### Phase 4 — The commercial layer (weeks 10–14)
- Save-for-later → post-flight email + Google Maps deep links + My Maps import
  (see ADR-0004 — "save to Google Maps" does not mean what the spec assumes).
- Geo-fenced audio ad slots with airline-level kill switch.
- Airline admin: category restrictions, branding, content blocklist.

**Exit test:** a demo flight an airline VP can sit through, and a rate card.

## What we deliberately are NOT building yet

| Not yet | Why |
|---|---|
| Native iOS/Android apps | ADR-0001. A captive-portal web app is how passengers actually reach inflight software. |
| A headless CMS | ADR-0005. Git review gates are stricter than any CMS workflow and cost nothing. |
| Accounts / login | Anonymous listening is the MVP. Save-for-later works via an emailed link. |
| Live ADS-B integration | ADR-0002. The aircraft already knows where it is; and when it won't tell us, the flight plan does. |
| Community submissions | Editorial control is the moat. Opening it early destroys the moat. |
| Real-time echo generation in flight | There is no bandwidth. Everything ships precomputed. |
