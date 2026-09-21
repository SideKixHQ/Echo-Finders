# Design reference

`skystories-phone.prototype.html` is the phone prototype, extracted from the Claude Design
bundle. It predates the rename and still carries the old product name throughout, including
in its mock copy — left as-is deliberately, because it is an archived artefact rather than
living source. **It does not run standalone** — the bundle referenced Leaflet and its fonts by
asset id, and those are not included here. It is checked in as a specification to read, not
a page to serve.

A seatback variant exists in the same Claude Design project and shares the content graph,
the map, the saved list and the ad inventory.

## What the prototype establishes

**Design tokens** — the palette resolved into CSS custom properties, `Poppins` for body and
`Space Grotesk` for numerals, codes and labels. Taken as given; the built app should read
these from one place rather than re-deriving them.

**Screen structure** — a full-bleed map under a draggable sheet with three detents (peek,
half, full), a flight pill across the top showing progress between origin and destination,
filter chips, a floating control column, and a five-tab bottom nav: Map, Listening, Saved,
Stories, Settings.

**Player** — play/pause, ±15s, previous/next *line*, playback rate, next story, a narrator
picker, and a "Simple audio" toggle.

## What it asks of the content model, and what we did about it

| Prototype behaviour | What the engine needed |
|---|---|
| Previous/next line, read-along highlighting | `Transcript` with per-line timings. The prototype estimates them from word count; production takes them from the TTS render. |
| "Simple audio — plain words, shorter" | `SimpleVariant`: its own title, script, duration and audio. A second asset, not the same audio sped up. |
| Stories of 3–15 minutes | A `deep` format, plus anchoring (ADR-0008) — a ten-minute story cannot be centred on a point it passes in seconds. |
| Ads inline among the pins | `Sponsorship` as a property, deliberately **not** a category (ADR-0008). |
| Ratings and review counts | `Attraction.rating`, resolved from Places at build time. |
| "Send list to Google Maps" | Already how ADR-0004 says this has to work. The prototype gets it right. |

## Open questions for the next UI pass

- The prototype's categories (`history, culture, ghost, crime, kids, fact, stay,
  attraction`) are a UI-facing shortlist; the engine carries a longer taxonomy. Someone
  needs to own the mapping, because it decides what a filter chip actually filters.
- "Submit a story" appears in the Stories tab. Community submission is explicitly out of
  scope for launch (ADR-0005): editorial control is the moat. Either the button waits, or
  it feeds a queue that no one can publish from.
- The narrator picker implies rendering the library in several voices. That multiplies TTS
  cost and package size by the number of voices offered.
