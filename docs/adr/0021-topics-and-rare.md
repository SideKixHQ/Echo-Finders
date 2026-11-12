# ADR-0021: The 16 topics, and Rare picked by hand

**Status:** accepted · **Date:** 2026-11-12 · **Builds on ADR-0009 (ubiquitous language),
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
