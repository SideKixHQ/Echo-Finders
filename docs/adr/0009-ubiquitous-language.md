# ADR-0009 — The code speaks the product's language

**Status:** accepted · **Date:** 2026-09-21

## Context
The brand defines its own vocabulary: an **Echo** is a story, an **EchoPoint** is the place
it is connected to, and an **Echo Journey** is the downloadable bundle of echoes along a
route. The engine had its own parallel vocabulary — `Story`, `at`, `RoutePackage` — which
meant every conversation between whoever writes the copy and whoever writes the code needed
a translation step. Translation steps are where meaning goes missing.

## Decision
| Product term | Type |
|---|---|
| Echo | `Echo` |
| EchoPoint | `EchoPoint` — coordinates, trigger radius and place name together |
| Echo Journey | `EchoJourney` — the offline bundle |
| Route | `Route` — origin, destination, waypoints, travel mode |

`EchoPoint` is a real type rather than three loose fields because "where" is not a point in
practice: a blue plaque means something within fifty metres, a city within sixty kilometres,
and the pin, the save-for-later entry and the corridor query all want the same object.

`Stories Below` stays a product name for the flight experience, not a code concept. The
engine treats flight as one travel mode among five (ADR-0007).

---

# Two values that needed code, not just prose

Most of the core values are design and editorial guidance. Two make claims that are only
true if something enforces them.

## "Truth" — distinguishing fact from legend

> *We use credible sources, distinguish fact from legend, and clearly identify uncertainty
> when the historical record is incomplete or contested.*

Left to prose, this fails quietly. A ghost story and a census record sound identical in a
narrator's confident voice, and a confident voice is exactly what stops a listener checking.

So every echo carries a **`certainty`**: `documented`, `contested`, or `legend`. It is
stated by an editor, never inferred, and the validator enforces:

- anything not `documented` must carry a `certaintyNote` saying *what* is uncertain and who
  disputes it — "sources differ" without saying how is not a disclosure;
- a `contested` echo needs at least two sources, because you cannot show a disagreement
  from one side of it;
- an echo filed under `local-legends` cannot claim to be `documented`;
- `true-crime` cannot be `legend`, because it concerns real people and real harm.

## "Perspective" — a place rarely has only one story

> *We seek multiple perspectives, elevate overlooked voices, and help people understand how
> the past continues to shape the present.*

This one was in direct conflict with the engine. The scheduler suppressed echoes sharing a
subject, to avoid hearing about the same river twice — which would also have suppressed the
tribe's account of a place after the town's had played. The value and the deduplication rule
wanted opposite things.

Resolved by splitting the relationship in two:

- **`relatedIds`** — the same subject told the same way. Suppressed, as before.
- **`perspectiveIds`** — the same subject from a different vantage point. The scheduler
  *rewards* these, with a bonus deliberately sized to outweigh the same-category penalty,
  since a counterpoint is usually filed under the same category as the account it answers.
  Without that, the variety rules would have quietly vetoed exactly the pairing we want.

An id appearing in both lists is a contradiction and fails validation.

---

# Free-roam discovery

The engine assumed a line through the world: you are going from here to there, and the
question is what to say along the way. Standing still is a different question, and the
corridor machinery cannot answer it — there is no path to project onto and no arrival time
to schedule against.

`findEchoesNearby` and `echoUnderfoot` answer it. This is the mode for wandering a city,
arriving somewhere with a free afternoon, or looking up from a bench and wondering what
happened here — and it is the foundation any discovery or collection feature would need.

Two judgement calls worth knowing about:

- **Nearby ranking blends distance with quality** rather than sorting on distance alone.
  Pure proximity leads with whatever is underfoot, which in a city centre means the dullest
  thing within twenty metres outranks something remarkable two streets away. Someone
  deciding where to walk wants the opposite.
- **`echoUnderfoot` is strict**, firing only inside an echo's actual trigger radius. An
  unprompted interruption about somewhere half a mile away teaches people to ignore the
  next one.

## A tension worth naming before anyone builds a collection mechanic

A find-and-collect layer pulls attention *to the phone*. The Presence value says the
opposite:

> *Technology should deepen a person's connection to their surroundings, not distract them
> from it.*

Both can be true, but only if the reward is for **arriving somewhere**, not for opening the
app. A streak that punishes a day off, a map that rewards sweeping a grid, or a notification
that fires because someone walked past — each of those trades the product's stated purpose
for engagement. Worth deciding deliberately rather than discovering later.
