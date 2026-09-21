# ADR-0002 — Position comes from three sources, and GPS is the least trustworthy

**Status:** accepted · **Date:** 2026-09-21

## Context
The spec assumes "real-time GPS tracking". At 35,000 feet this assumption is the single
most likely thing to sink the demo.

- Airplane mode does not disable GPS reception on most devices (GNSS is receive-only),
  but **airline policy, cabin attenuation, window seat dependency and OS-level radio
  handling make it unreliable and inconsistent**. A passenger in a middle seat may get
  nothing for the entire flight.
- Browser geolocation on an aircraft wifi network frequently resolves to the ground
  station or the operator's NOC — hundreds of miles from the aircraft.
- Meanwhile **the aircraft knows exactly where it is** and the IFE system usually exposes
  it on the cabin network for the moving-map feature.

## Decision
`PositionSource` is an interface with three implementations, tried in priority order and
hot-swappable mid-flight:

| Priority | Source | Where it comes from |
|---|---|---|
| 1 | `AircraftFeed` | The IFE/cabin server's flight-data endpoint. Authoritative. |
| 2 | `DeviceGnss` | `navigator.geolocation`, **accepted only if it passes a sanity check** against the flight plan (within corridor, plausible ground speed). |
| 3 | `DeadReckoned` | Great-circle interpolation from the flight plan, departure time and a cruise speed model. Needs no signal of any kind. |

`DeadReckoned` is the default and the floor. **The product must be fully enjoyable with
no position signal whatsoever.** Everything else is an accuracy upgrade.

## Consequences
- We are never blocked on an airline integration to build, demo or ship.
- Echo triggering tolerates position error, so trigger radii are generous (25–50 miles)
  and echoes are chosen for a corridor, not a pinpoint.
- The flight-plan-only path is also exactly what the pre-flight preview needs, for free.
