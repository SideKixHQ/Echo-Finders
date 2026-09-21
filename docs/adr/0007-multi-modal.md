# ADR-0007 — The engine is built around routes, not flights

**Status:** accepted · **Date:** 2026-09-21 · **Supersedes parts of ADR-0002**

## Context
Inflight entertainment was the original framing, but the underlying product is
location-aware audio storytelling. A flight is one way to move across a landscape. A car,
a train, a bicycle and a pair of shoes are others, and the question the engine answers is
identical in every case: what is worth saying about the place you are passing, and when?

This matters commercially as much as technically. Airline licensing is a long enterprise
sales cycle measured in quarters. Walking and driving tours can ship to consumers in weeks,
need nobody's permission, and are a proven market. The same library and the same engine
serve both, so ground modes can produce revenue and real listening data while airline
conversations incubate — and an airline is a far easier sell once the product demonstrably
works with paying users.

## Decision
The core models a **`Route`** with a `TravelMode`, not a `FlightPlan`. Every mode-specific
number lives in one table, `MODE_PRESETS`, so the difference between a flight and a walking
tour is a set of values to argue about rather than a second codebase.

What varies, and by how much:

| | walking | driving | flight |
|---|---|---|---|
| Speed | 4.5 km/h | 90 km/h | 850 km/h |
| Corridor half-width | 0.3 km | 5 km | 80 km |
| Timing tolerance | 90 s | 180 s | 600 s |
| Talk share (balanced) | 65% | 55% | 40% |
| Package budget | 60 MB | 120 MB | 250 MB |

Two of these deserve explanation.

**Timing tolerance** spans nearly an order of magnitude because it encodes how long a place
stays the place you are at. Ten minutes into a flight you have crossed a fifth of a state
and the echo still feels local. Ninety seconds into a walk you are looking at a different
building, and the same echo now feels wrong.

**Talk share** inverts the intuition that more is better. Silence on a three-hour flight is
restful — the passenger wants to read, sleep and look out of the window. Silence on a
forty-minute walking tour feels like the app has crashed, because the listener is walking
*because of* the audio.

## Visibility becomes mode-dependent
An echo's `visibility` class no longer scores on its own. `at-hand` — a plaque, a doorway,
a specific tree — is the most powerful thing this product does on foot and the least useful
thing it can do from 35,000 feet. It is therefore *suppressed* rather than merely demoted in
the air, because a dense city holds hundreds of such echoes and a flight crossing Manhattan
would otherwise fill with plaques nobody can see.

## This reverses ADR-0002 on the ground
ADR-0002 put device GNSS *below* dead reckoning, because in a cabin it is unreliable and the
aircraft knows better. That reasoning is specific to flight. On the ground GNSS is excellent
and authoritative, and dead reckoning is only a stopgap for a tunnel or an urban canyon. So
position priority is now part of the mode preset, and flight is the exception rather than the
rule.

## What does not change
- **Offline packages still matter** (ADR-0003), and arguably more. Rural driving routes have
  dead zones, and walking tours are frequently used abroad where roaming is expensive or off.
- **Public-domain sourcing** (ADR-0006) is unaffected.
- **The content library is the asset**, and it gets more valuable: one well-sourced echo
  about a place can serve a flight at city scale and a walking tour at street scale,
  provided it is tagged with the radius at which it actually works.

## Consequences
- Trigger radii now span four orders of magnitude, from 20 m to 250 km. The validator's
  floor is set by phone GNSS accuracy rather than by anything editorial.
- Content needs a *scale* discipline it did not before: "Savannah" works from the air,
  "this house on Abercorn Street" only works on foot. Both are good echoes; neither works
  in the other's mode.
- The product name no longer fits. That is a decision for the founders, not an ADR.
