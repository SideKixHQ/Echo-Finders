# ADR-0018 — The map is for going places

**Status:** accepted · **Date:** 2026-10-11 · **Builds on ADR-0010, ADR-0015**

## Context
James (2026-10-11), after walking with the app:

> "It really doesnt work. its not functional. if i tap on an echo and i want to go to that
> echo i need a way to get directions to that echo. it cant just be out in space for me to
> stumble upon, i need to be able to pick echoes, navigate to them, sync with them and go to
> the next one. or plan a route, map it out and go. This is just a bunch of dots a
> background. … Zooming in and out doesnt really work. … what does it look like when you are
> walking on the street. it should be very close and detailed. Also the sonar noise, you
> need a way to mute really easy."

A survey of the code found that each complaint was a concrete fault, not a matter of taste:

- **Zoom and pan.** The SVG map did its own gestures. The pinch zoomed about the middle of
  the screen, not between the fingers, and nothing glided after a flick. The scale was a
  multiple of "the distance to the third-nearest echo", so it changed by itself on every
  GPS fix while you walked. "Back to where I am" switched to the whole-journey view and
  reset the zoom. The walking view was 600 m across, and the furthest out was 2.4 km.
- **Directions.** "Take me there" pointed a compass (`Walk.tsx`) and drew nothing on the
  map. `docs/07-moving-between-echoes.md` parked real directions behind a Google Routes
  key.
- **After a sync** nothing suggested the next echo.
- **The sonar** could only be muted from the demo harness, which a phone never shows.
- **Location** started only from the onboarding button. Every later visit opened with the
  GPS off and said "Nothing within 2.4km" while you stood among a hundred echoes.

What the listener is doing decides what the map is for. They are on foot, phone in hand or
pocket, often with headphones, in a place they may not know. They want to know what is near,
pick one, get there, hear it, and pick the next. The design board already draws that loop:
the card's "Take me there", Walk mode's arrow and "3 of 5", and the sync. The map is the
missing piece between them.

## Decision

1. **MapLibre owns the camera** (`MapCanvas.tsx`).
   - Its gestures are the map's gestures: pinch about the fingers, glide, double tap,
     wheel. North stays up.
   - The SVG over it keeps the designed pins, route and you, projected through MapLibre's
     camera on every frame. A pin and its street cannot disagree.
   - With no WebGL, the old SVG projection and gestures still run.
2. **Street level on foot.** The walking view is MapLibre zoom 16.5, about 300 m across a
   phone, with buildings, street and path names and landmarks. You can zoom out to a whole
   town and in to a doorway.
3. **Following.**
   - The map follows you until you drag it.
   - Pinching only changes the scale; it does not stop following.
   - "Back to where I am" picks the following back up, at the zoom you chose.
4. **Directions on the phone, not from a service.**
   - A hosted router would charge for every "take me there" and needs a network that a
     flight or a basement does not have (`02-costs.md`).
   - So the walkable streets around the library are built once from Overture Maps
     (OpenStreetMap data, ODbL) by `scripts/build-streets.py` and shipped as small files.
   - The engine routes over them (`packages/core/src/geo/streets.ts`): it snaps both ends to
     the nearest street, finds the shortest walk, and returns the line to draw, the time and
     the turns.
   - Outside a built area the compass and distance remain, and the card hands off to the
     phone's own maps app.
5. **The loop closes.** After a sync the card offers the next nearest unheard echo, with
   its walking time.
6. **A walk can be planned.**
   - Pick several echoes, or let the app pick the best few within a time you set.
   - They are ordered into the shortest walk and drawn as one numbered route.
   - Then you go, stop to stop, with "2 of 5" as Walk mode draws it.
7. **The sonar has a switch on the map:** a pin sending a ping, crossed when muted, and
   remembered.

## Consequences
- **One more thing to load.** MapLibre is about 290 KB gzipped. It is loaded after first
  paint and only on the map.
- **Street files are part of the library build.** A new place needs
  `python3 scripts/build-streets.py` run again. The files are about 20 KB to 1 MB each, and
  only the area you are in is fetched.
- **No per-route cost at any scale.** The router never calls out, so directions work
  offline once the area's file is cached.
- **Walking only, for now.** Driving hands off to Apple or Google Maps, which do it better
  and for free.
