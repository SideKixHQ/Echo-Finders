# ADR-0016 — A draft may cite any credible source; approval still needs the record

**Status:** accepted · **Date:** 2026-10-09 · **Amends ADR-0006**

## Context
On one day James sent two batches: twenty stories (ten of them ghost stories) and a hundred
for downtown Wilmington, which he is walking today. Under ADR-0006 most of them could not
enter the library. Their sources are the places themselves: the Bellamy Mansion, the
Burgwin-Wright House, Thalian Hall, the railroad museum, the Queen Mary, the Stanley. None
of these is public domain or CC-BY.

ADR-0006 was always a provenance standard, not a legal necessity. Facts are not
copyrightable, so citing a museum's page for a date infringes nothing. What the standard
buys is that an airline can check every source with no licence question. That matters when
an echo is approved for a licensed product. It does not matter while the echo is a draft.

A ghost story is a special case. Its claim is not "this happened" but "this is what is
told here", and the best evidence for what a place tells is the place's own account. No
government archive records a knock in stateroom B340.

James (2026-10-09), on the ghost stories: "Allow it for legends and have a disclaimer.
Ghost stories are not all true anyway. They are ghosts." On Wilmington: allow credible
sources for drafts, and keep the government-or-Creative-Commons bar before an echo is
approved.

## Decision
Enforced by `validateEcho`:

1. **Drafts** may cite any credible source as `rights: fair-use-facts`, provided it has a
   `url` a reviewer can open.
2. **Approval** still needs every source to pass `MVP_POLICY`. Before approval, a
   museum-sourced claim has to be backed by a public record, or cut.
3. **Legends** are the exception at approval too. An echo that is `legend` in both
   category and certainty may keep the place's own linked account of its legend, because
   that account is exactly what the claim is about. Anything a legend states as history,
   such as the hanging in 1852 or the drowning in 1873, still needs a public record.
4. **True crime**: the rule that one source must be a public record is now a warning on a
   draft and an error at approval. Every other true-crime gate is unchanged: age 16 and
   over, a content warning, a named reviewer, three sources when a living person was not
   convicted, and `corroborated` before publication.
5. **The disclaimer is spoken.** Every legend script says out loud that what it describes is
   reported, not proven ("A `certainty` field the listener cannot hear is not a
   disclosure", `docs/writing-echoes.md`). `certaintyNote` says the same in writing.

Our scripts remain our own words. Copying a source's prose is still forbidden.

## Consequences
- Both batches enter the library as drafts.
- The validator's warnings list every true-crime draft still waiting on its public
  record, which makes it a to-do list for review.
- Approval gets harder in one respect: a reviewer now has to replace museum citations, not
  just check them. That work was always owed. This decision moves it from the door to the
  publishing desk.
