# ADR-0010 — Capturing echoes on foot

**Status:** accepted · **Date:** 2026-09-21

## The idea
People walking around should be able to capture an echo and hear its story — the Pokémon
Go instinct, which is a good one: *go to a place to get the thing* is exactly what this
product already is.

But the comparison needs unpicking, because copying the mechanic literally would break the
product.

## Capture is arrival. There is no mini-game.

In Pokémon Go the creature **is** the prize, and the catch is the entire experience — the
throw, the arc, the wobble. In Echo Finders the prize is a story about where you are
standing. A capture mini-game would sit *between* a person and the thing they came for, and
every second of it is a second spent looking at a phone instead of at the place the story
is about.

So the capture is walking into the place. The skill is navigation and the willingness to
actually go there, which is the only skill this product should ever reward.

What that buys is the thing no map game has: **the whole loop works with the screen off.**
Phone in a pocket, headphones in, walking. You arrive, a chime plays, the story starts.
Nothing to tap, nothing to watch, nothing to aim.

This is the resolution of the tension flagged in ADR-0009. A find-and-collect layer
normally pulls attention *towards* a screen, which is the opposite of what the Presence
value asks for. Capture-by-arrival is the only version that pulls attention away from it.

## Three states, not two

`sealed` → `captured` → `heard`.

Separating "I was there" from "I listened" matters more than it first appears. Someone can
walk a neighbourhood and open eight echoes in half an hour — and eight echoes is an hour of
listening. Collapsing the two would force a choice between standing still to finish a story
and moving on and losing it.

Capture on arrival. Listen whenever: on the train home, that evening, next year.

## Arriving versus passing through

An echo opens after a short dwell inside its radius — about twelve seconds by default —
or immediately on an explicit tap, because a tap is a statement of intent.

The dwell is not a difficulty knob. It is a filter against passing through: someone on a
bus crossing a city would otherwise sweep up every echo along the route without having
been anywhere, which devalues every capture including the earned ones.

## Rarity is earned, never assigned

Pokémon rarity is a design dial. Here it would be a lie, and a costly one: a collection of
places you stood is only worth keeping if the difficulty was real.

So rarity is derived entirely from facts about the world:

| Input | Why it is hard |
|---|---|
| Small trigger radius | You have to find one precise doorway, not a neighbourhood |
| Restricted hours | Only open after dark, or in one season |
| Remoteness | A long way from anywhere many people go |

`rarityReasons` returns these in plain language, so the collection screen can say *why*
something was hard rather than showing a tier badge nobody can interpret.

Remoteness is computed at content build time from distance to the nearest populated place.
It is never set by hand, for the same reason.

## What we are deliberately not building

**Streaks, daily goals, decay, and anything with a timer.** These convert "go somewhere
interesting" into "open the app today", which is precisely the Presence violation the rest
of this document is arranged to avoid. A person who walks somewhere remarkable once a month
is using this product perfectly, and nothing should tell them otherwise.

**Leaderboards.** Besides the tone, they are the entire reason location spoofing is worth
anyone's effort. With nothing to win, faking a capture only cheats the person doing it —
which is a far better defence than any anti-cheat system, and it is free.

**Notifications that fire because someone walked past.** An unprompted interruption about
somewhere half a mile away teaches people to ignore the next one. `echoUnderfoot` is strict
about trigger radii for the same reason.

**Volume as a goal.** Pokémon Go's loop rewards catching thirty of the same thing. Our unit
is a three-to-fifteen-minute story. Nobody consumes thirty of those. The right rate is five
to twenty per outing, and the collection should be sized and paced accordingly.

## What replaces streaks

**Curated sets** — "Every lighthouse on the Oregon coast", "The Underground Railroad in
Ohio", "Brutalist London". A set gives someone a reason to *travel*, not a reason to check
their phone, and it is the natural surface for a tourism board or a museum to sponsor.

That is the same pull streaks provide, pointed at the world instead of at the app.

## Honesty about position

Two checks keep the collection truthful, which is what makes it worth having:

- **The fix has to be good enough for the target.** A 300m accuracy circle is not evidence
  of standing in a 50m doorway. Slack is granted for imprecision, but bounded — a device
  claiming 500m accuracy does not thereby open everything within 500m.
- **Movement has to be possible.** Five kilometres in two seconds is not a walk. The
  ceiling scales with travel mode, generously, because this is meant to catch teleportation
  rather than athleticism.

## What the engine now provides

`CaptureTracker` takes a stream of position fixes and returns what opened. It reports
in-progress arrivals with a completion fraction, so the UI can draw the ring that makes
approaching a place feel like something. It restores from persisted records, so a
collection survives reinstalling the app, and it records **where the listener actually
stood** — not merely which echo opened.

Over time that is the more valuable half. A personal record of the places a life has passed
through is a far better reason to keep an app than a number that goes up.
