# ADR-0021: Arrival is two stage, because the operating system owns the first one

**Status:** accepted · **Date:** 2026-11-05

## Context

Walking mode promises that an echo opens when you arrive, with the phone in a pocket and
the screen off. ADR-0011 built that on the engine watching a position.

On iOS it cannot. A backgrounded app is suspended and none of our code runs, so any loop
we write stops when the screen goes dark. This is the same wall ADR-0001 met from the
other side with the wake lock, and the wake lock only ever covered a phone the listener is
holding.

What does keep running is Core Location. Hand it circles and it watches them against cell,
wifi and GPS on its own schedule, waking the app when one is crossed, even from
terminated. The engine's background job is therefore not "where am I" but "which circles
should the system be watching".

Two facts shape the answer, both Apple's rather than ours:

- **At most twenty regions per app.** Apple's own guidance is to register what is nearby
  and swap as the listener moves. Downtown Wilmington alone is 105 echoes, so this is a
  ranking problem.
- **Region monitoring is not precise to 40 m.** It leans on cell and wifi positioning and
  is dependable at around a hundred metres and up. Every walking echo in the library
  carries `triggerRadiusKm: 0.04`, chosen so an echo is about a doorway rather than a
  block. Handed to Core Location unchanged, a 40 m circle fires late, or in a dense street
  with poor wifi, not at all.

## Decision

Arrival happens in two stages, and the radius is different in each.

1. **Coarse, owned by the platform.** `regionsToMonitor` ranks what is nearby and returns
   at most twenty circles, each widened to at least `COARSE_RADIUS_FLOOR_M` (150 m). It is
   called on every wake, because a wake means the listener moved and the previous answer
   is stale. Regions the platform already holds keep their place: re-registering one makes
   it fire its exit and entry again, which reaches the listener as an echo replaying for
   no reason.

2. **Fine, owned by the engine.** Crossing a coarse region is permission to go and look,
   not an arrival. The app turns on a precise fix and `arrivalAt` compares it against the
   echo's own `triggerRadiusKm`. It is three valued, because a fix is a circle and not a
   point: `arrived`, `elsewhere`, or `unsure` when the circle straddles the boundary.

## Consequences

- **No content changes.** Every echo's `triggerRadiusKm` still decides whether it plays.
  Only the circle handed to the platform differs, which is a delivery detail rather than
  an editorial one. The 40 m radii in `content/echoes` stay as they are.
- **`unsure` is a real state the client must handle**, by keeping a precise fix open and
  asking again. Treating it as an arrival plays the echo to somebody across the junction,
  which is the failure that teaches people to stop trusting it.
- **`elsewhere` matters as much as `arrived`.** A coarse region covers a block and most
  crossings of it are not arrivals. Without a way to say no, every wake would hold GPS
  open until the battery noticed.
- **This is engine work that runs ahead of a client that can use it.** Nothing in the web
  app can register a platform region, so until there is a native shell this is tested
  rather than exercised. It is written now because it changes what the native client has
  to be, and that decision is live.
- **Android's geofencing allows more than twenty.** `max` is an option rather than a
  constant for that reason; `IOS_REGION_LIMIT` is the default, not the rule.
- **The 150 m floor is unmeasured.** It is a starting number from Apple's documented
  behaviour, not from a walk log. Revisit it against a real iPhone before launch, along
  with the twenty, which has been Apple's cap for a long time but is still Apple's to
  change. Verified against Apple's region monitoring guide on 2026-11-05.
