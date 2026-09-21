# UI review — the prototype against what the engine now does

The phone prototype in `design/` was built for one product: a passenger in a seat, on a
flight, watching a map. The engine has since grown five travel modes, a capture mechanic, a
camera view, haptic guidance, a privacy model and contributed echoes. This is what that
means for the screens.

It is deliberately specific about what **changes**, what is **missing**, and what should be
**left alone**, because the prototype gets a great deal right and a rewrite would lose it.

---

## What the prototype already gets right — do not lose these

- **The map is the app.** Full-bleed, everything else floats over it. Correct for every mode.
- **The three-detent sheet** (peek / half / full). The right control for "glance, browse,
  settle in", and it works as well walking as flying.
- **"Send list to Google Maps."** The only version of that feature that can actually be
  built (ADR-0004). Whoever wrote that button understood the constraint.
- **"Simple audio — plain words, shorter"** given equal billing with the narrator picker,
  rather than buried in accessibility settings. That is a better instinct than most
  products have.
- **The palette and type.** Deep Space Blue with Neon Aqua for live state reads well at a
  glance, which is what a walking UI needs above all.

---

## 1. Walking mode is an entirely different screen

The prototype's header is a flight pill: `SFO ———•——— JFK`, with an ETA. On foot that is
meaningless. Nobody walking wants a progress bar to a destination they may not be walking to.

**Replace the header, per mode:**

| Mode | Header shows |
|---|---|
| Flight, rail | Origin → destination, progress, ETA. As built. |
| Driving | Next echo ahead, distance. No progress bar — the route may change. |
| Walking, cycling | **Nothing by default.** The map and the sheet are enough. |

Walking's header space is better spent on the one thing that matters: *how close am I to the
nearest sealed echo.* Which brings us to the largest gap.

---

## 2. Nothing in the prototype shows capture

This is the biggest omission, because capture is now the core loop on foot. Needed:

**Pin states.** Every pin is one of four things, and they must be distinguishable at a
glance, in sunlight, while walking:

- **Sealed** — known about, not yet opened. Outline only, no fill.
- **Opening** — inside the radius, dwell timer running. **A progress ring around the pin**,
  filling over ~12 seconds. This is the single most important new piece of UI: it is what
  makes walking the last few metres feel like something.
- **Captured** — yours, unplayed. Filled, Neon Aqua.
- **Heard** — filled, muted.

`WalkSession` emits `opening` with a `progress` fraction on every fix. Drive the ring
directly from it; do not animate on a local timer, or the ring and the capture will disagree.

**A capture moment.** Chime, haptic, the pin blooming, the title arriving in the mini
player. It should be legible with the phone in a pocket — sound and vibration first, visuals
as confirmation for whoever is looking.

**A collection screen.** The prototype's "Saved" tab is for places to visit later. That is a
different thing from echoes you have captured, and merging them would muddle both. Add a
fifth state to the nav or split Saved into *Collected* and *Saved for later*.

Show rarity as **words, not badges**: `rarityReasons()` returns "You have to find the exact
spot", "Only open at certain hours", "A long way from anywhere". A tier icon means nothing;
those sentences mean something.

---

## 3. Hot and cold needs a visual twin

Haptics do the work with the phone pocketed, but someone looking at the screen needs the
same information, and someone on an iPhone web build has *only* the visual (ADR-0011).

Suggestion: a slim bar along the bottom edge above the nav, pulsing in time with the haptic
cue, widening and brightening as `Guidance.cue` quickens. Same rhythm, same meaning, no extra
concepts to learn. Colour it by trend — Neon Aqua warming, Light Slate cooling.

The distance readout should be **coarse** — "about 200m", "just ahead" — never a live metre
count. A number ticking down invites staring at it, which is precisely what the whole design
is arranged to avoid.

---

## 4. The camera view is a bearing overlay, not AR

Add it to the nav or as a FAB in walking mode. The critical UI rule, from ADR-0011:

**Draw an arc, not a pin.** `ViewfinderMarker.spread` gives the width to honour, derived
from how unsure the compass is. A confident marker over the wrong building is worse than no
marker — and in a street lined with steel-framed buildings, that is the normal case.

When `headingIsUsable()` is false, say so and offer the map. "Your compass is confused here"
costs far less trust than pointing somewhere wrong.

Off-frame markers become edge arrows — "turn left, 40m" — which is most of the value.

---

## 5. Privacy needs its own screen, not a settings row

Five controls, in this order, each with one line on what is lost by switching it off
(ADR-0011, `docs/privacy-policy.md`):

1. **Hands-free walking** — background location. Off by default.
2. **Remember where I stood** — precise positions. Off by default. *Deletes existing
   positions when switched off*, in the same action, and says so before doing it.
3. **Keep my collection**
4. **Export my data**
5. **Delete my positions** / **Delete everything**

The distinction to make visible, because it is the whole design: *your collection* is which
echoes you found; *where you stood* is a separate thing you can decline and still have a
collection. If the screen does not make that legible, the careful engineering underneath is
invisible.

---

## 6. Contributed echoes need to look different — and this is not optional

The prototype has a "Submit a story" button and no way to tell contributed content apart
once it is playing. With contributions now in the model, that gap is a liability.

**Every pin and every player state carries provenance:**

| Provenance | Shown as |
|---|---|
| `editorial` | No badge. The default. |
| `partner` | The institution's name — "Museum of the City of New York". |
| `personal` | The contributor's attribution, **read aloud before the audio starts**: "Marcus, who grew up on this street." |

A personal echo must never be mistaken for the record. The engine enforces
`certainty: "testimony"`; the UI has to make it audible and visible, because a confident
narrator makes everything sound equally authoritative.

**The leave-an-echo flow** should say what it is at the top: *a memory, not a fact*. Nobody
is being asked to write history. And it should say plainly how far it will carry — "people
standing right here will hear it" — since reach is earned (ADR-0013) and discovering that
later feels like a punishment rather than a design.

Add a **report control** on every contributed echo. Reporting hides it immediately.

---

## 7. Smaller corrections

- **Ads are not a category.** The prototype lists `ad` alongside History and Kids in the
  filter chips. Sponsorship is a property (ADR-0008); it needs a distinct treatment — a gold
  rule, the disclosure read aloud — not a chip people can confuse for a topic.
- **Categories need an owner.** The prototype's eight (`history, culture, ghost, crime,
  kids, fact, stay, attraction`) versus the engine's longer list. Someone has to decide the
  mapping; it determines what a filter chip actually filters.
- **`deep` format.** Stories up to fifteen minutes now exist. The player's progress bar and
  the "Below you" list were designed around 3–6 minute items; check they still read well.
- **Simple audio** should be reachable *while playing*, not only from the now-playing
  panel — the moment someone wants the shorter version is usually a minute in.

---

## Suggested order

1. Pin states and the capture ring — the core loop, and nothing else on foot works without it.
2. The walking header and proximity bar.
3. The collection screen.
4. The privacy screen — needed before any TestFlight build that asks for location.
5. Provenance badges and the contribution flow.
6. The camera view — the most impressive and the least essential.
