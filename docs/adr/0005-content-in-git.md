# ADR-0005 — Echoes live in git until non-technical editors exist

**Status:** accepted · **Date:** 2026-09-21

## Context
The spec proposes a headless CMS (Sanity/Strapi) on day one. A CMS is the right answer
eventually and the wrong answer now.

The hardest requirement in the whole content plan is the **true-crime editorial gate**:
two credible sources, allegation-versus-conviction discipline, extra review for living
people, and no path by which an AI draft reaches a passenger unreviewed. That is an
approval workflow with an audit trail and a named human approver.

Git already is that system. Branch protection, required review, CODEOWNERS, signed
commits and an immutable history are a stricter editorial gate than any CMS workflow,
and they cost nothing.

## Decision
- An echo is a YAML/Markdown file under `content/echoes/`, validated by schema in CI.
- `content/echoes/true-crime/**` is CODEOWNERS-gated to the editorial lead. AI may open
  the PR; only a human may merge it.
- The build compiles content files into Postgres. **Postgres is the system of record for
  serving; git is the system of record for truth.**
- We adopt a CMS at the point where non-technical editors are writing daily — most likely
  once the library passes ~1,000 echoes — and the schema is designed now so that move is
  an import, not a rewrite.

## Consequences
- Editorial velocity is capped by git literacy in the early team. Acceptable at this size.
- Every published fact has a diff, an author, a reviewer and a timestamp, which is exactly
  what we need the first time a true-crime echo draws a complaint.
