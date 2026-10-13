# ADR-0020 — Seatback mode

**Status:** accepted · **Date:** 2026-10-13 · **Builds on ADR-0001 (web first) and ADR-0019**

## Context
James (2026-10-13): "test the seatback browswer", then "seatback mode change".

Real Panasonic and Thales browsers need their developer kits, which come through an airline
or a partner programme. Until then, the seatback was emulated: a landscape touch screen
(1280×720 and 1920×1080), no location, no WebGL, and no internet beyond the server the app
is loaded from. Three things were wrong:

- **A phone in the middle of the screen.** The app drew its 390px phone frame in the centre
  of a 16:9 screen, two thirds of it empty.
- **No fonts.** Sora and Space Grotesk came from Google. With no internet in the air, every
  screen fell back to the device's own sans.
- **A route over nothing.** Without WebGL the map falls back to SVG, which had no basemap
  once Esri was retired (ADR-0019): a flight was a dotted line on a blank field.

## Decision
- **Seat mode.** On a large landscape touch screen (at least 1000×560, coarse pointer) the
  app fills the whole screen: the map edge to edge, everything laid over it in a 480px
  column down the left, lists and the player centred at 760px. `?seat` in the URL forces it,
  for an airline's integration and for testing on a desk. CSS only, after the phone rules
  (`.phone.seat` in `theme.css`); one hook in `App.tsx` sets the class, on the body too.
- **Fonts come with the app**, from `@fontsource` (SIL Open Font License), bundled by Vite.
  Nothing is fetched from Google, on any device.
- **Coastlines without WebGL.** `public/map/land.json` (Natural Earth 1:110m, public domain,
  65 KB, `scripts/build-land.mjs`) is drawn under the route in the SVG fallback, and only
  fetched on a device that cannot run the map.

## Consequences
- An airline links to `https://…/?seat` from its portal or seatback menu. Nothing else
  changes: the same build, the same library.
- Still not seen on a real seatback browser. Those are older Chromium or WebKit builds,
  some driven by a handset rather than a finger, and they may lack features the app uses
  (`dvh`, for one). Seat mode avoids `:has()` for that reason. The handset needs focus styles and arrow-key
  movement, which are not designed yet.
- At 1920×1080 the type is phone-sized on a screen read from further away. Scaling it up
  is the next step once a real screen has been seen.
