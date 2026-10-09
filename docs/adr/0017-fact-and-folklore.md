# ADR-0017 — Fact and folklore, marked on every screen

**Status:** accepted · **Date:** 2026-10-09 · **Builds on ADR-0016**

## Context
James (2026-10-09): "Ghost stories are not factual, folklore not factual, local myths are not
factual. History, People, Arts, True Crime should all be factual and verified. Let's find a
way to update the rule and mark appropriately so the user knows just by looking."

`certainty` already recorded this (documented, contested, legend, testimony), and nothing a
listener could see showed it. A ghost story and a court record looked identical on the
card, in the player and in My Echoes. The rule also only ran one way: a legend could not
call itself documented, but a History echo could call itself a legend.

## Decision
**Two families, enforced by `validateEcho`** (`packages/core/src/content/truth.ts`):

| Family | Kinds | May be |
|---|---|---|
| Fact | History, True Crime, People, Landmarks, Nature, Food & Drink, Arts | documented, contested, or testimony; verified before approval |
| Folklore | Ghosts (folklore, local myths) | legend, always, with the spoken disclaimer |

Children's echoes may be either and are labelled as what they are.

**One mark, everywhere** (`TruthMark.tsx`: the card, the player, My Echoes):

| Mark | When |
|---|---|
| ✓ True story · verified | documented, approved, facts checked |
| True story · not yet verified | documented, not yet checked (James: "show not yet verified") |
| Disputed · historians differ | contested |
| Legend · not fact | legend, in the ghost colour |
| A memory · their account | testimony |

"Verified" is read from the library **as authored**. The demo build marks everything
approved so that it plays; `VERIFIED_IDS` carries what a person really checked, so the
demo can never show a check mark nobody earned.

## Consequences
- Today every echo in the library says "not yet verified", which is the truth. The check
  mark appears as echoes are approved.
- A History, People or Arts echo filed as a legend now fails the build.
