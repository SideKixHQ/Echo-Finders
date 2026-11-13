# ADR-0021: The 16 topics, and Rare picked by hand

**Status:** accepted, amended 2026-11-13 (topics everywhere) · **Date:** 2026-11-12 · **Builds on ADR-0009 (ubiquitous language),
ADR-0010 (capture) and ADR-0017 (fact and folklore)**

## Context
The library had grown to 981 echoes filed under fifteen categories, six of which no longer
said what an echo was about: `people`, `built`, `land`, `inspo`, `music` and `firsts`. A
Revolutionary War fort sat in history beside a recipe; a film set sat in inspo beside a
patent office. The filter panel was a scrolling list of fourteen chips, most of them empty
wherever you happened to be.

Rarity was computed from four inputs (a tight radius, opening hours, going inside, distance
off the main walk). Nobody could tell from a card why one echo was rare and the next was not,
and the computed tier drifted every time the library grew.

James approved both changes on 2026-11-12 from the canvas board "The 16 topics"
(https://claude.ai/artifact/4A4cFvht1Ub4742gHMLRqx) and two lists: every echo with its new
topic, and 117 echoes marked rare or extra rare with a reason.

## Decision
- **Fifteen topics, one per echo.** History, Military, True crime, Scandals, Ghosts &
  legends, Unsolved, Disasters, Hidden, Arts, Pop culture, Sports, Food & drink, Business,
  Wonders, Kids (`ECHO_CATEGORIES` in `packages/core/src/types.ts`). An echo is filed under
  the one it is mainly about and moved, never tagged twice. The files live in
  `content/echoes/<topic>/`.
- **The topic still drives the rules.** The truth label: legend is folklore; unsolved and
  kids stay in neither family and are labelled by each echo's own certainty; every other
  topic is fact (`truth.ts`). Voice casting: legend and true crime take the male narrator,
  kids the kids voice, an unsolved legend the legend voice, everything else the default
  (`content/voices.yml`). True crime keeps every safeguard: opt in everywhere, a
  `trueCrimeReview` on every echo.
- **Rare is the sixteenth chip, and it is picked by hand.** An echo may carry
  `rare: rare | extra-rare` and must then carry `rareReason`, one of "Inside, with opening
  hours", "Only at certain times", "Hard to reach" or "Easy to miss". `rarityOf` reads only
  that. The card says why ("Rare: easy to miss"), the map says "Rare" or "Extra rare", and
  My Echoes counts both as rare finds. The Rare chip filters on rarity and combines with
  the topics: History and Rare shows the rare history echoes.
- **The inspo link is optional on any echo.** The 47 former inspo echoes now in pop culture,
  and the arts ones, keep theirs; where it is present a script may only say "this exact
  spot" when the evidence is exact.
- **Chips show only what is near.** The panel offers a topic, and Rare, when at least three
  of its echoes are in the area being looked at; All always shows, and a chip that is on
  never disappears while it is on. The panel names the area ("Around here, Philadelphia")
  and says why the list changes. Zoomed out, the area is what the area card counts; zoomed
  in, it is the city around where the map is looking (the echoes the whole-trip button
  frames), a searched place, or the route. The panel is a two column grid that fits a
  390x844 screen.

## Amended 2026-11-13: topics everywhere
James decided that the map's panel offers every topic and Rare wherever you are. This
replaces "Chips show only what is near" above for the map:
- **Every topic and Rare, always,** in the same two column grid, order, icons and colours.
  The rule of three echoes in view is gone, and with it both lines that explained it: the
  "Around here, <place>" header and the note "Only topics with echoes around here show.
  Move the map and the list changes." The panel is the chips and nothing else.
- **Picking zooms out to them.** Picking a topic, Rare, or several takes the map out just
  far enough to fit every echo of the picked topics, in every city, with the numbered dots
  (`PinCluster`) saying where they are, using the map's animated camera. It works from
  anywhere, including a place with none of that topic and "Nothing within".
- **All, or the last one off, goes back.** The map flies back to the view the listener had
  just before the first pick.

Asked of James, not yet decided, built as below until he answers:
- The fit uses the country view's box (`country-view.ts`), the continental US, so the
  three Ghosts & legends echoes in England and Scotland are not in the first view.
- The zoom out is while exploring. On a planned journey (a route, a drive, a flight) the
  panel offers every topic and filters the journey's own echoes, as before.
- Where the panel is taller than the screen (an iPhone SE, or Safari with its bars) it
  stops above the tab bar and scrolls; on the approved 390x844 frame it fits whole.

## Held back
- `dc-the-tape-on-the-door` (Watergate) stays in true crime with its review, as James was
  told, rather than moving to Scandals.
- Six echoes the list moves from history to true crime stay in history until each has a
  `trueCrimeReview` and a male narrator render: `charleston-where-the-tide-came-in`,
  `dc-the-house-on-h-street`, `dc-the-ladies-waiting-room`, `dc-the-plaque-on-the-fence`,
  `new-orleans-the-fire-in-the-kitchen`, `wrightsville-a-challenge-on-the-boardwalk`. True
  crime without its safeguards is the one thing this change must not do.

## Consequences
- Scandals has 8 echoes and reaches three in no single city, so its chip shows almost
  nowhere until the library grows there. Sports and Business are thin too. That is the rule
  working: a chip for a topic you cannot find here is a promise the map cannot keep.
- `remotenessOf` is still computed and shipped with the library, but no longer decides the
  tier. "uncommon" stays in the `Rarity` type so callers compile; nothing is assigned it.
- A new topic now needs the engine list, a label, a colour in both schemes (4.6:1 on white
  and on the lit chip), a hum note, an icon and the iPhone app's two tables.
