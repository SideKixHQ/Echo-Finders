# ADR-0006 — The MVP library is public domain and CC-BY only

**Status:** accepted · **Date:** 2026-09-21

## Context
The library should be "free and clear" for the MVP: no per-source negotiations, nothing
that complicates an airline's procurement review.

It is worth being precise about what this protects against, because the intuition is
usually wrong. **Facts are not copyrightable.** Reading that a lighthouse was built in 1847
and writing our own sentence about it infringes nothing, whatever the source. Copyright
protects *expression* — phrasing, structure, selection — which is why the content pipeline
already forbids copying source prose and requires original scripts.

So this is not primarily a legal constraint. It is a **provenance standard**: every claim
traces to a source anyone can open and check, with no licence conversation attached. That
is a commercial advantage in a procurement review rather than a legal necessity.

## Decision
`MVP_POLICY` permits **public domain** and **CC-BY** sources only, enforced by
`validateEcho` in CI.

Two deliberate exclusions:

- **CC-BY-SA**, despite being "free". Share-alike obligations can propagate into derivative
  works, and a viral licence term inside a product licensed to an airline is exactly the
  surprise we do not want appearing in their legal review.
- **`licensed`**, because a per-source negotiation is what the MVP is avoiding.

CC-BY is permitted but carries an obligation: attribution has to appear somewhere the
passenger can reach — the transcript or a credits panel — so the validator requires a
creditable URL.

True crime carries one extra rule on top: at least one source must be the **primary record**
(court filing, coroner's report, government archive) rather than someone else's account of
it. Secondary sources repeat each other's errors, and a chain of retellings is how a echo
ends up asserting a conviction that never happened.

## Why this is not as limiting as it sounds
Public-domain government works are far richer than the label suggests, and between them
they cover the overwhelming majority of what the library needs: the National Park Service,
the Library of Congress, the Smithsonian, USGS, NOAA, NASA, the census, and state and
federal court records.

## Consequences
- The MVP library can be assembled without a single rights conversation.
- `FULL_POLICY` already exists in code for the point at which there is a rights desk;
  widening the policy is a one-line change, not a migration.
- Some subjects will be unavailable at MVP — recent events in particular, where the only
  accounts are copyrighted reporting. Accepted: the library is strongest on history,
  geography and public record anyway, which is what a corridor of land looks like from
  35,000 feet.
