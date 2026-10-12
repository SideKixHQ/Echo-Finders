# ADR-0019 — The map is built from open data and served with the app

**Status:** accepted · **Date:** 2026-10-12 · **Replaces the hosting part of the 2026-10-09
map decision (`docs/10-blockers.md` #7); builds on ADR-0018**

## Context
James (2026-10-12), on the live app:

> "the map is just not detailed. it needs to look more real and be easier to see things
> when your walking or searchin on the map. Its hard to see streets and names and
> buildings it should be immersive."

The live app had never drawn the detailed map. The navy vector style was built on
2026-10-10 to read a US-wide Protomaps file from Cloudflare R2, switched on by
`VITE_MAP_TILES_URL`. The file was never made or uploaded, so every phone got the
stopgap: Esri's grey canvas, darkened into the navy. That is the flat, hard-to-read map
James was looking at. Esri's tiles are also not licensed for an app that takes money
(`docs/02-costs.md`).

James has no Cloudflare account and did not want another service, another bill or a
manual upload:

> "it seems like our cost is going up and our tech stack is gettting more complicated."

## Decision
- **The map is built here, from Overture Maps open data, and ships with the app.**
  - `scripts/build-map.py` reads Overture's public S3 bucket, the same way
    `build-streets.py` builds the walking network. It writes one PMTiles file,
    `apps/prototype/public/map/echoes.pmtiles`, which Vercel serves like any other file.
  - The layers are roads with names, buildings (with heights), water, parks and
    landmarks. They are written in the Protomaps schema, so the navy style draws them
    unchanged.
- **Only where there are echoes.** The areas are the walking network's, padded a further
  kilometre, at zoom 11 to 15. MapLibre draws zoom 15 tiles larger beyond that. Outside an
  area the map is the plain navy field.
- **The app reads it by default.** No setting is needed. `VITE_MAP_TILES_URL` still wins
  when set, for a bigger file kept elsewhere later.
- **The navy style is brighter.** Roads, buildings and names were a shade or two off the
  field. They are now clearly drawn, with street names at 11 to 13 px.

## Consequences
- **No new account, service or bill.** A phone fetches a few hundred KB of the file
  around where it is looking. That is inside the Vercel plan's bandwidth.
- **Esri is no longer drawn** while WebGL works. It remains only for phones without
  WebGL, which use the old SVG map.
- **A new city needs `build-streets.py` and `build-map.py` run again**, then a commit.
  This is the same step as today for directions.
- **It scales to dozens of cities, not thousands, in git.** Each area adds roughly 0.2 to
  2 MB. When the file grows past what belongs in the repository (about 100 MB), move it to
  Vercel Blob in the same Vercel account and set `VITE_MAP_TILES_URL`. No code changes.
- **No map between areas.** A drive or flight over open country shows the route and the
  echoes on the plain field, with no roads under them. A low-zoom US layer (coastlines,
  interstates, city names) can be added to the same file if that is missed.
