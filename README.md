# SkyStories

Location-aware audio storytelling for inflight entertainment. As the aircraft crosses a
place, the passenger hears what happened there — history, the people who came from it, the
strange and the unsolved, and things worth coming back for.

## Repository layout

```
docs/            Build plan, services, and the decision records worth reading first
  adr/           Why the client is web, where position comes from, what "save to Google" really means
packages/
  core/          The engine. Pure TypeScript, no I/O: geometry, ranking, playlists, packages.
content/
  stories/       The library. Reviewed files, schema-validated, true-crime CODEOWNERS-gated.
  routes/        Flight corridors we build packages for.
```

## Getting started

```bash
npm install
npm test
```

## Where to start reading

1. `docs/00-build-plan.md` — what we build, in what order, and what we are deliberately not building.
2. `docs/adr/0002-position-source.md` — the constraint that shapes everything else.
3. `packages/core/src/` — the engine those decisions produce.
