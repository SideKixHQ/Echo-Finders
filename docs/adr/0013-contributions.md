# ADR-0013 — People can leave echoes, and why that does not break the moat

**Status:** accepted · **Date:** 2026-09-21 · **Revises ADR-0005**

## I argued against this, and I was half wrong

ADR-0005 closed the library at launch: editorial control is the defensible asset, community
submission dilutes it, and true-crime UGC is a legal catastrophe. Those objections still
hold. What they do not justify is the conclusion, because they all assume **an echo is one
kind of thing**.

It is not, and the distinction that matters is not about quality. It is about what sort of
statement is being made.

> "The Emigrant Landing Depot opened on 1 August 1855."

A claim about the world. It can be wrong. It needs sources, checking and approval, and if we
publish it wrong we have misinformed someone.

> "My grandmother told me she met my grandfather on this corner, in the rain, in 1961."

A claim about the speaker. It is not checkable and does not need to be. Demanding a citation
for it is a category error — it is **testimony**, and what testimony needs is attribution,
so a listener knows whose account they are hearing, and framing, so nobody mistakes it for
the record.

Treat those as one thing and every instinct is right: you must either fact-check memories,
which is impossible, or publish unverified history, which is irresponsible. Treat them as
two and both problems dissolve.

## Why this is worth doing

**No editorial team knows the good ones.** The best echo on any street is the one only
somebody who lived there could tell, and there is no research budget that finds it.

**The Perspective value asks for it explicitly** — "elevate overlooked voices". The most
overlooked voices about a place are the people who live there.

**A library that grows at the speed of an editorial team gets outrun.** Density is the moat,
and contributions are the only way to reach street-level density in more than a few cities.

**It is the retention mechanic that is not a streak.** Someone who leaves an echo comes back
to see whether anyone heard it. That reward points at the world, not at the app.

## Three provenances

| | Who | Sources | Carried on a flight |
|---|---|---|---|
| `editorial` | Us | Required, checked, approved | Yes |
| `partner` | Museums, archives, tourism boards | Institution vouches | Yes |
| `personal` | Someone who was there | None — it is testimony | **No** |

**That last column is the whole commercial answer.** An airline will not put unvetted
passenger content in front of a cabin, and the contract will say so. It does not have to:
the editorial library is exactly as licensable as it was before, because contributed content
never mixes with it. `MODE_PRESETS` carries `defaultProvenances`, so a flight package
contains editorial and partner content only, by construction rather than by policy.

Meanwhile the walking product gets the density that makes it worth using.

## Reach is earned, not granted

The moderation problem with user content is that review does not scale, and the usual
answers — a queue, or a model, or hoping — all fail differently.

So a contribution's reach is capped by how far its contributor has earned:

| Trust | Reach |
|---|---|
| New | **50 m** |
| Established | 200 m |
| Trusted | 600 m |
| Institution | 5 km |

A first contribution is audible only to someone standing almost on top of it. That single
number does most of the work: **spam has no payoff when nobody hears it**, an honest mistake
reaches almost nobody, and reach becomes something earned by contributions people actually
listened to and did not report. The authored radius is a ceiling, never a promise.

## The hard rules

- **Never true crime.** Real people, real harm, and an exposure a contribution cannot carry.
  Enforced, not discouraged.
- **Always attributed.** An internal contributor id, and something read aloud before the
  audio — "Marcus, who grew up on this street". Anonymous testimony is just an anonymous
  claim.
- **Always `certainty: "testimony"`**, which sits deliberately outside the documented /
  contested / legend scale. That scale measures the historical record; testimony is not on
  it and cannot be graded against it.
- **No contact details.** A web address, email, phone number or handle in a place-anchored
  audio message is either advertising or an attempt to move someone into a private channel.
  The check is crude and errs towards refusal: a false positive costs a rephrase, a false
  negative makes the app a delivery mechanism.
- **Reports hide immediately**, before review. Being briefly wrong about a good contribution
  costs far less than being briefly right about a bad one.

## Protected places

A place-anchored message is a thing left *at* somewhere, which makes the wrong location a
way to reach a specific person or to intrude on grief. `ProtectedArea` is defined for
residences, memorials, burial grounds, schools and disaster sites, where only editorial and
partner content may be placed.

**The data behind it is not built yet** and this is the largest remaining gap. Residential
addresses in particular need a source, and until there is one the rule is a type rather than
a protection. It should not ship without one.

## What is still true from ADR-0005

- The editorial library stays closed. Nothing contributed is ever promoted into it without
  being researched from scratch.
- Git and CODEOWNERS still gate editorial content, true crime especially.
- A model may draft and open a pull request; only a person may merge one.

## What to decide before building the submission flow

1. **Own voice or our narrator?** A grandmother's actual voice is far more affecting, and
   far harder to moderate. The model allows both (`ownVoice`); the product has to choose
   what is offered first.
2. **How trust is earned.** Listens without reports is the obvious signal and is gameable.
   Worth designing deliberately rather than discovering.
3. **Where protected-place data comes from.** See above. This gates launch, not iteration.
