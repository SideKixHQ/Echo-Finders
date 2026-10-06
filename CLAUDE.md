# Echo Finders

*A Whatishere.com product.*

Location-aware audio storytelling. As you cross a place — at 35,000 feet, at 70mph, or on
foot — you hear what happened there: its history, its people, the strange and the
unsolved. One engine and one library serve an airline seatback, a road trip and a walking
tour; what changes between them is a table of numbers (`docs/adr/0007-multi-modal.md`).

The asset is not the app. It is **a verified, geo-tagged echo library plus the engine that
assembles a personalised audio route** from it. Engine and library first, map last
(`docs/00-build-plan.md`).

**It is a web app.** The passenger client is a web PWA, not Flutter or React Native —
seatback systems and onboard BYOD portals only run web content
(`docs/adr/0001-web-first-client.md`). Read first: `README.md`, `DEPLOY.md`,
`docs/00-build-plan.md` and `docs/adr/` — check the ADRs before reversing any decision.

Claude Code sessions do all the code: build, fix, test, push, PR. Cowork does design
canvases, strategy and planning; it reads the repo but does not push, and hands code
changes over as a ready-to-paste prompt for a Code session.

## How James wants to work

Asked to do something, do it end to end: branch, fix, run the gate, push, open the PR.
Ask only when a decision is genuinely his. Show the work, not a description of it:
before/after screenshots for anything visual, and what was not verified. One change per PR.

## Keep in view

`docs/10-blockers.md`: what will get in the way. Solve as we go; when work touches one, say so
in the PR and strike it through when settled.

## Stack

- npm workspace, **Node 22** (`engines.node: 22.x`), TypeScript strict, Vitest.
- `packages/*` — `packages/core` is `@echofinders/core`, the engine: pure TypeScript, no I/O.
- `apps/*` — `apps/prototype` is `@echofinders/prototype`, the client deployed to Vercel.
- `content/` — the echo library and routes, as reviewed, schema-validated files in git.
- `docs/` — build plan, services, decision records. `design/` — the prototype spec.
- `scripts/` — content validation, library build and the audits the gate runs.

## Before every push

Run `npm run gate` and push only when it is green. CI runs only typecheck, tests and
content validation, so the audits are on you. On a fresh checkout, build the engine first
(`npm run build --workspace @echofinders/core`); three audits import `playwright`, which
is not a dependency, so link a global install into `node_modules/` if it is missing.

## Workflow

1. Branch off `main`. Never commit straight to `main` for anything beyond a typo.
2. Run `npm run gate`, push, and open a PR into `main`.
3. Merging to `main` deploys to Vercel. There is no other deploy step.
4. Check https://echo-finders.vercel.app/ on a real phone: camera, compass and sound need
   a real device.

Never end a session with unpushed work; the workspace is wiped.

## Vercel

- Project `echo-finders`, team `side-kix`.
- App: https://echo-finders.vercel.app/
- Dashboard: https://vercel.com/side-kix/echo-finders
- Build is defined in `vercel.json`; see `DEPLOY.md`. Vercel posts no status back to
  GitHub (`github.silent`), and these cloud sessions cannot reach `*.vercel.app`, so a
  deploy cannot be checked from here.

## Design source of truth

- MVP screens: https://claude.ai/artifact/Wn6fDrLjSLkYSg6krU5BJN
- The echo character (option C): https://claude.ai/artifact/Qw9LVUVFXzztpVATedHfiw

Where the code and these artifacts disagree, the artifacts win.

## Secrets

Never commit secrets — no API keys, tokens or `.env` files. Environment variables live in
Vercel project settings.
