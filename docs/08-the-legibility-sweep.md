# The legibility sweep

Four asks, in one pass: make the rare echoes glow, make the listener's own light glow, make
sure every control has a reason to exist and every icon says what it does, and check
contrast, spacing and overlap the way an accessibility audit would.

The useful part of this was not the fixes. It was that most of them could not be found by
reading anything.

---

## The glows

### Rarity was a two-step ladder pretending to be four

Only `rare` and `singular` had a halo at all, under a reasonable argument written into the
code: *a glow on everything is a glow on nothing, and the whole point of the warm channel is
that it is scarce.* The argument is right. The line was in the wrong place.

Counted against the real library:

| rarity | echoes |
| --- | --- |
| singular | 0 |
| rare | 1 |
| uncommon | 16 |
| common | 9 |

So `uncommon` was a tier the map had never once shown, and the entire warm channel was
carried by a single echo. "Scarce" had quietly become "absent".

Three strengths now, and **radius does more of the separating than opacity does**. A bloom
twice the size of another reads as twice as important at a glance; two blooms the same size
at different alphas just read as two blooms.

| | radius | centre alpha |
| --- | --- | --- |
| singular | 92 | 0.62 |
| rare | 52 | 0.50 |
| uncommon | 26 | 0.40 |
| common | none | — |

Uncommon at 26 against a 13px pin is a **rim on the pin**, not a bloom around it. That is
what lets sixteen of them share a screen without becoming a wash, which is what the original
argument was actually about.

Motion is spent last, because it is the one signal the eye cannot ignore: only rare and
singular breathe, and the rare one is half a beat behind the singular so two on a screen do
not pulse in lockstep and read as a rendering artefact.

### You were dimmer than a story two streets away

The listener's own mark was an 11px dot with one 12px shadow and a 26px glow whose gradient
ramped straight from 0.5 to nothing — which is a smudge rather than a light. A straight ramp
is a bit transparent at every radius; a real source holds most of its strength through the
first third and then falls off fast.

- the glow goes 26 → 40, over four stops instead of two
- the dot gets two shadows: a tight bright one that gives it an edge on a busy basemap, and a
  wide soft one that is the light actually leaving it
- two rings leaving it half a beat apart rather than one, so it reads as a source that keeps
  sending — which is what the mark means, and what the pins' own ripples already do

### And it was eating taps

`.here` had no `pointer-events: none`, so the marker swallowed every tap inside its glow:
the echo you are standing next to, the one you are most likely to want, was the one pin that
could not be tapped. True at the old 26px and worse at 40. Found by hit-testing the composed
page, not by reading the file.

---

## Everything having a place

**The download fab was an exact duplicate.** It called `openPackage`. The journey chip
across the top of the map calls `openPackage` too, is always on screen, says what it is in
words, and carries a "CHANGE" affordance. Two controls, one destination, and the one people
could actually read was not the one taking a 44px bite out of the map. The fab is gone; the
column went from seven objects to six.

Its one piece of state had nowhere to live afterwards — the app has always tracked whether
the journey is on the device and only that fab's tick showed it. It moved to the journey
chip, which is the line that is always on screen and already about the journey: it now reads
**Kept** with a tick instead of **Change**.

**One button was drawing the same icon for three different jobs.** The framing control is
"Back to where I am" when the map has been dragged, "Follow me" when the whole journey is
framed, and "Whole journey" otherwise — and it drew a crosshair for all three. A crosshair
means *put me in the middle*, so two thirds of the time the picture argued with the words,
and the one people reach for after dragging the map looked identical to the one that zooms
out to the county.

| state | glyph |
| --- | --- |
| panned | a crosshair — put me back in the middle |
| overview | a person in a circle — follow me again |
| otherwise | four corners — frame the lot |

---

## The audit that found the rest

`scripts/audit-layout.mjs`, added to the gate. It answers two questions the existing checks
structurally cannot, because both need the **composed page** rather than a list of elements:

**Is anything covering anything.** A control can be on screen, the right size, correctly
labelled, keyboard reachable — and have something drawn over its middle. Every check passes
and the thing does not work. This is the defect that has cost this project the most rounds:
a pin that could not be tapped because the SVG captured the pointer, a cluster behind a
filter chip, a fanned pin behind the zoom buttons, the only way out of walk mode under a
card. Every one was found by rendering, none by reading.

**Can the text be read against what is actually behind it.** The existing contrast script
reads the stylesheet and checks the pairs somebody thought to declare. It cannot see that a
label sits over the basemap rather than the panel it was designed for, or that three stacked
translucent surfaces compose to something paler than any of them. This walks the ancestor
chain, composites every semi-transparent background on the way, and measures what a person
is looking at — at 375×667 and 390×844, in both themes, across eighteen screens.

### Making the audit trustworthy first

The first run produced sixty findings and most were the audit's own fault. An audit that
cries wolf teaches you to skim it, so this took four passes before a single app fix:

- **The map is still mounted under a full-screen overlay**, pins and fabs and all, so
  onboarding alone reported forty controls "covered" on purpose. It now finds the topmost
  thing covering most of the frame and judges only what is inside it.
- **Scrolled out is not covered.** A settings row below the end of a scrolling panel is at a
  screen coordinate belonging to something else, so `elementFromPoint` names the tab bar as
  the coverer. Fourteen findings.
- **Clipped is not covered either.** The map clips itself to the band between its bar and the
  tab bar and answers for anything outside it with an edge marker. The audit now reads the
  clip rectangle out of the document.
- **A gradient is not a colour.** The first contrast pass reported every primary button in
  the app at 1.24:1 — it started the background walk at the element's *parent*, skipping the
  button's own aqua gradient, and measured dark ink against the page behind it. It starts at
  the element now, and returns nothing rather than a guess when it meets a gradient.

Then one more, and this one is the reason to write assertions instead of `.catch()`:

**The light-theme pass had never run in the light theme.** It looked for a button called
"Light"; the control is a `role="switch"` called "Dark map". The miss was swallowed by a
`.catch(() => {})` and three screens' worth of readings were labelled light while being
nothing of the kind. It now asserts `data-theme` actually changed.

### What it found once it could be trusted

Twenty-three contrast failures, every one of them in the light theme, every one invisible to
a script that reads declared pairs.

**Three literals that never learned about the light scheme.** `rgba(174, 181, 194, 0.7)` is
the dark theme's muted grey with the alpha baked in, written out by hand in three rules. In
the light theme `--muted` is redefined to a dark slate and the literals were not — so the
collection meta, every setting's cost line and the feature fallbacks rendered at **1.73:1 on
white**. That is not low contrast, it is unreadable, and it is six paragraphs of genuinely
important small print about permissions and deletion. Now one `--muted-soft` token, per
theme.

**The warm ink of the whole app.** `--ember-core` is the rarity word on a card, the counts on
My Echoes, the "getting warmer" line on the bar, the singular pin's label — about twenty
places. At `#e8502a` it was 3.74:1 on white and 2.98:1 on a card, so every one of them failed
in the light theme. Same hue, less brightness: `#a83a10`.

**The key to the map was the one place the colours could not be read.** The nine category
colours were chosen against white and all nine clear 4.5:1 there. A lit chip is not white: it
carries an 8 percent dark wash over the panel, composing to about `#cdd4e0`, and against
*that* seven of the nine fell between 3.6 and 4.4. Each is now taken down until it clears
4.6:1 on the composed chip **and** on plain white, so one token works as a chip label, a pin
stroke and a card kicker.

**Two colours that had no safe text value at all.** Magenta (`#ff007a`, 4.06:1 on the dark
panel — the three delete rows and the singular tag) and aqua-as-ink in the light theme. Both
now have an `-ink` variant beside the flat token, the same way `--ember-core` already sat
beside `--ember`: the flat one stays for fills and borders where the ratio rule does not
apply and the brand hue should not be diluted.

And one that no audit found, because a rule that does not parse cannot be measured:

**`.fab.on:focus-visible, .chip.on:focus-visible, …` had no block.** The selector list ran
straight into a comment and then an `@media`, which invalidates the whole run. The build had
been printing `Unexpected "@media"` about it for weeks. The effect was an aqua focus ring on
an aqua background for every lit chip, fab and action — a WCAG 2.4.7 pass on paper and
invisible in fact. Found by reading a build warning.

---

## The play button is the character

Asked, looking at the player: *shouldn't this be our fun character face?*

Yes, and it was already true everywhere else. The creature's eyes **are** a pause glyph that
swings into a play triangle when you sync an echo — that is the whole idea of it, and the bar
over the map had been using it as its play button since the last pass. The full-screen player
was still drawing a plain aqua disc with a generic pause icon on it, which is the one screen
where the story actually happens, and it meant the app had two play buttons that looked
nothing alike again.

`armed` is the play triangle and `playing` is the pair of uprights, so the transport states
map onto the faces exactly rather than by coincidence, and the morph between them is the one
`Echo.tsx` already animates. The disc went with it — the creature brings its own body, rim
light and glow, so a lozenge behind it reads as a sticker under a sphere.

One trap on the way: the old rule forced `fill: currentColor; stroke: none` on that button's
svg, which was correct for a bare path and would have painted out everything in the creature
that legitimately inherits.

---

## Measured after

| | before | after |
| --- | --- | --- |
| contrast failures, composed, both themes | 23 | 0 |
| controls covered at their own centre | 3 | 0 |
| controls sharing pixels | 3 | 0 |
| objects in the control column | 7 | 6 |

Three findings remain, listed as advisory rather than failed: a cluster dot under a zoom
button, and two map marks overlapping each other. A pin is **at a place** and cannot be
nudged off the control column without lying about where the echo is. All three are already
answered — the column's gaps pass taps through now, the map pans, and the bar's two arrows
reach every echo without aiming at anything. They stay in the output so the decision stays
visible rather than quietly rotting into an excuse.

---

## Still open

Rarity is skewed by the content rather than by the code: 16 of 26 echoes land on `uncommon`
because `remoteness` is mostly unset and a trigger radius under 150m is ordinary in a city.
The tier is doing very little discriminating. That is a question for the library, not the
map, and it is worth asking before the library gets much bigger.

`Synced` draws its own dark background and does not follow the light theme, so its title
comes out near-black on near-black there. Seen while rendering this pass.

---

# The journey chip

A photograph of it on a phone: `Battery … ● African … 17m ›`. Two place names cut to one
word each with a bullet between them.

**The bullet is not a separator.** It is the playhead, sitting on a progress bar with no
width, and the arithmetic says exactly why:

| | px |
| --- | --- |
| `.mapbar` at 375 | 351 |
| less the category filter | 131 |
| the chip gets | **212** |
| less padding and four gaps | 144 for content |
| two names capped at 34% each | 72 and 72, where "Battery Park" needs about 82 |
| **left for the bar** | **−39** |

So the bar collapses, its dot survives, and the one picture the component exists to draw —
*here is the line, here is you on it* — is gone. It had six pixels before the category
filter joined that row and went negative after, which is worth owning: the squeeze was
self-inflicted, by the pass immediately before this one.

## The deeper cause

`short()` returns the airport code when a place has one. **This was drawn for a flight.**
`SFO ●———— JFK · 5h19` fits 212px beautifully; `Battery Park ● African Burial Ground` never
could. A component built for three-letter codes was reused for street names and nobody
re-did the sums.

## What other apps do

Once you are *moving*, mainstream navigation drops the origin. Google Maps shows distance
remaining, time remaining and ETA; Apple Maps shows arrival time and remaining distance.
Neither mentions where you started, because the origin stops being information the moment
you set off. Flight trackers keep both ends, because a passenger cannot look out of the
window and know where they are — there, the line *is* the orientation.

That is the same split this app already draws everywhere else, so the component takes it:

| | shows |
| --- | --- |
| carried (flight, rail) | origin, bar, destination, time — unchanged |
| self-directed (foot, car, bike) | the destination and the time left |

## Progress is the chip, not a bar inside it

A background cannot be squeezed to minus thirty-nine pixels by its neighbours. The pill
fills from the left and its right edge is the playhead — the same hairline the white dot
used to be, with none of the width. No transition on it: the walk updates this four times a
second, so a 600ms ease is one that can never finish and all it would do is make the fill
lag the number beside it.

## And the filter gives the room back

"All echoes" cost **131 pixels to say that nothing is filtered**, which is its state almost
always. Three dots and a chevron say the same in 52.

| | chip | destination |
| --- | --- | --- |
| before | 212 | "African …" |
| after | 284 | "African Burial Ground", uncut |
| with a filter on | 244 | "African Burial Gro…" |

A switched-on filter takes its words back, and that asymmetry is the point: a map quietly
missing two thirds of its pins with no visible cause is the worst thing this screen could
do, while a map showing everything needs no announcement. The accessible name says it in
full in both states, because a screen reader has no pixels to save.

## One thing the measuring got wrong first

Every photograph of the new chip came out soft — the pill, the text, all of it — while the
roaming chip beside it in the same frame stayed razor sharp. Two theories went in before
anything was measured: a composited layer from `overflow: hidden` plus a transitioning
child, rasterising off the pixel grid at a fractional flex width. Plausible, tidy, and
wrong.

Querying `elementsFromPoint` at the bar's own centre named the culprit in one line: the
package screen was **still mounted on top with `backdrop-filter: blur(3px)`**. The probe had
picked a route and never closed it, so every reading was taken through a frosted panel the
app puts there on purpose. The harness now closes it and throws if it is still up, because
a measurement taken through a scrim is worse than no measurement.
