# ADR-0014 — A tour is a sequence of stops, and drift is a distance

**Status:** accepted · **Date:** 2026-09-22 · **Refines ADR-0007**

## What went wrong

Twelve echoes were written for the Lower Manhattan walk, all twelve sat inside the
corridor, and the scheduler played eight of them. The four it dropped were not marginal —
they included the African Burial Ground, which is the place the walk exists to reach, and
Washington's farewell at Fraunces Tavern. The eight it kept were separated by silences of
eleven and twenty-two minutes.

Four separate causes, and they are worth recording together because each one looked like a
tuning problem and none of them was.

## A route had no way to stand still

`RouteProfile` modelled every mode as continuous motion: idle, accelerate, travel, slow,
arrive. That is right for a flight and wrong for a tour. Dividing 2.17km by fifty minutes
describes a person shuffling along at 2.6km/h without ever pausing, which is nobody. A real
walking tour is a sequence of stops — you arrive at Bowling Green, you stand in it, you walk
on — and the standing still is not overhead, it is the product.

The cost of getting this wrong is concentrated exactly where the material is best. Bowling
Green carries both the King George statue and the Charging Bull; Federal Hall carries the
first inauguration and the wall Wall Street is named after. Modelled as a traverse, one of
each pair is always too late to play. The denser and more interesting the corner, the more
it loses.

So `Waypoint` gains `dwellS`, and the profile's distance–time curve holds still for it. The
dwell comes **out of** the route's duration rather than being added to it: `durationS`
stays door to door, and the legs between stops are walked at the mode's real speed. Raising
a stop shortens the walk rather than lengthening the tour, which is the arithmetic an author
actually wants.

## Drift was measured in the wrong unit

Every drift tolerance in the mode table was reasoned about as a distance and then written
down as a time. Ninety seconds on foot "is roughly a hundred metres"; ten minutes in the air
"is a fifth of the way across a state". The conversion was left implicit, and implicit is
where it broke: a walker standing at Bowling Green for three minutes has not walked past
anything, but measured in seconds the second echo about that corner is three minutes stale
and gets rejected.

Drift is now the distance between where the listener actually is when an echo's anchor lands
and the place that echo is about, with the tolerance converted from the preset at the mode's
own speed. On a route without stops this is very nearly the old behaviour; with stops it is
the difference between a corner carrying two stories and carrying one.

## The window closed before the destination

An echo is anchored near the moment the listener is closest to it. For the final waypoint
that moment is the end of the route, so it needs room *after* the end — and a window closing
on arrival has none. The last echo on a route was structurally unplayable, in every mode,
for every route.

`destinationDwellS` reopens the tail by however long the traveller is plausibly still there.
It is a mode property because arriving means opposite things: walk to a memorial and you
stop and look at it, which is why you walked there; a flight arrives at a gate and the
listening is over. For carried modes it is zero and nothing changes.

## Variety was priced as though the choice existed

Eleven of the twelve echoes on this walk are history, because the walk is about history.
The same-category penalty asked the scheduler to vary something the corridor could not
supply, and it paid: eight minutes of silence to reach the one kids echo early, and the
Fraunces Tavern echo pushed out of its own dwell and off the walk entirely. A worse outcome
on every axis, in the name of a variety nobody could have noticed.

The penalty is now scaled by the share of the corridor that is *not* that category. At
eleven-of-twelve repetition is effectively free; on a transatlantic corridor with six
categories in rough balance it is close to full strength and the old behaviour stands.

## Greedy scheduling could not see what it was forfeiting

Weighing "this one now" against "that one shortly" never accounts for the fact that
choosing the second loses the first. The scheduler declined to play the Wall Street echo at
zero drift in order to wait eighty-three seconds for Trinity Church, and by the time Trinity
finished, the wall was behind the listener for good.

Candidates now carry the moment their window closes, and an echo near expiry gets a bonus
scaled by how nearly out of time it is. Take the one you are about to lose; the other will
keep. It is sized below the dead-air penalty, so it breaks ties without ever being a reason
to sit in silence.

## What it is worth

Twelve of twelve on the Lower Manhattan walk, in correct geographic order, narrator
alternating with only two same-voice adjacencies in eleven transitions.

One negative result is worth keeping. The dead-air penalty had been both capped and given a
horizon four times the timing tolerance, on the theory that both were needed. Only the cap
was: the horizon is the penalty's *slope*, and flattening it is exactly as harmful as
capping it. At four, a transatlantic flight lost a fifth of its echoes and its median gap
went from forty-eight seconds to three minutes, while the walk it was meant to help was
unaffected. Uncapping alone fixed the walk, and the flight then scheduled more than it ever
had — fifty-eight echoes against a previous fifty.

## Consequences

- `Waypoint.dwellS` is content authors' most direct control over pacing, and route YAML
  should carry it wherever two echoes share a place.
- The nine-minute silence between Fraunces Tavern and Federal Hall is now a **content** gap,
  not a scheduling one. There is nothing written about Broad Street.
- `RouteGeometry.waypointIndex` exists because densification means a waypoint's position in
  `points` is not its position in `Route.waypoints`.
- Drift tolerance is derived from `speedKph`, so that number now affects scheduling and not
  just estimates.
