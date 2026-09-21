# Echo Finders

**A [Whatishere.com](https://whatishere.com) product.**

Location-aware audio storytelling. As you cross a place — at 35,000 feet, at 70mph, or on
foot — you hear what happened there: its history, the people who came from it, the strange
and the unsolved, and the things worth coming back for.

The same engine and the same library serve an airline seatback, a road trip and a walking
tour. What changes between them is a table of numbers, not a second codebase
(`docs/adr/0007-multi-modal.md`).

## Repository layout

```
docs/            Build plan, services, and the decision records worth reading first
  adr/           Why the client is web, where position comes from, what "save to Google" really means
packages/
  core/          The engine. Pure TypeScript, no I/O: geometry, ranking, playlists, packages.
content/
  echoes/       The library. Reviewed files, schema-validated, true-crime CODEOWNERS-gated.
  routes/        Route corridors we build packages for.
design/          The phone prototype, as a specification to read.
```

## Getting started

```bash
npm install
npm test
```

## Where to start reading

1. `docs/00-build-plan.md` — what we build, in what order, and what we are deliberately not building.
2. `docs/adr/0007-multi-modal.md` — routes, not flights, and why that is the stronger business.
3. `docs/adr/0002-position-source.md` — the constraint that shapes the rest.
4. `packages/core/src/` — the engine those decisions produce.
