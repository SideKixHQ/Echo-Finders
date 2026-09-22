# Prototype

A simulated journey — on foot, by car or in the air — driven by the real engine.

```bash
npm run library:build                      # compile content/ into src/library.generated.ts
npm run dev -w @echofinders/prototype
```

Query parameters: `?speed=2` slows the journey so the dwell ring can be watched filling,
`?start=0.4` drops in partway along.

## Travel mode

Air, car and walking, chosen in the panel beside the phone. This is the point of the
prototype as much as the pin states are: **switching mode changes no code path at all.** It
swaps one row of `MODE_PRESETS` for another, and everything downstream follows — corridor
width (80km in the air, 300m on foot), how far an echo may play from its place (ten minutes
against ninety seconds), talk-to-silence ratio, position source, and the offline package
budget.

Each mode has content of its own, filed by place in `content/` rather than by journey: the
Lower Manhattan walk, the Blue Ridge Parkway, and New York to Miami down the seaboard. The
map is given the echoes in the route's corridor rather than the whole library, which is the
same question `findEchoesAlongRoute` answers for the scheduler.

## Finding is not hearing

An echo opens when you arrive — that is capture-by-arrival (ADR-0010), and it is the game.
It then **waits**. Pressing play is a separate act, because starting narration unasked talks
over a conversation, a podcast, or somebody standing in a memorial. `PrivacySettings.handsFree`
is the one way to ask for the opposite, and it is off by default.

So a capture is really a bookmark: it goes into the collection, and the collection is where
it gets cashed in — tap any entry, any time, wherever you are.

**Plan** is where auto-play becomes tolerable. Choosing what to hear is a separate moment
from travelling — you do it sitting down, before the gate closes — so it gets a screen of its
own: everything the route passes, in order, with durations and a running total of listening
time. Pick a few, switch on "play these as I reach them", put the phone away.

Auto-play without that step is an imposition. Twelve echoes on this walk is forty minutes of
narration; handing somebody all of it because they once tapped a switch is how a product
becomes something people turn off. Choosing first turns the same switch into an agreement
about a known quantity.

Two settings, because they are two questions. `PrivacySettings.handsFree` buys background
location so echoes open with the screen off; `autoPlay` decides whether they then talk. A
listener can very reasonably want a phone collecting in a pocket while still choosing what
they hear. `autoPlayOnly` carries the choice, and an empty choice is honoured literally —
that is how somebody turns auto-play off without turning it off.

**Coming up** is the other half. Nothing is forced, but on a route the engine already knows
what is ahead and when, so it offers the next couple with their lead times and a play button.
That matters most in the air: walking or driving you can go to an echo, but at 35,000 feet
the route is fixed and choosing what to hear before it goes past *is* the interaction.
`upcomingOnRoute` excludes anything already found, so the thing currently playing never turns
up as a suggestion.

## It talks

Nothing has been through ElevenLabs yet, so narration is the browser's own speech synthesis
reading the actual script aloud. Flat, and its timing is not the real timing — but the words
are the real words, which is the only way to judge writing that will be *heard* rather than
read. A sentence that needs a second pass, a number that is painful aloud, a clause that
lands wrong without a comma nobody can hear: none of that shows up on a page. When the real
renders land, `speech-audio.ts` is replaced by twenty lines around an `<audio>` element and
nothing above it changes.

Two echoes capturing at once is the normal case here, not the edge one — the stops on the
Lower Manhattan route exist precisely so a listener can collect both the King George statue
and the Charging Bull at Bowling Green. One plays, the other waits, and neither talks over
the other. Walk far enough while something waits and it gives up: **capturing and hearing
are different things**, and nothing is lost, because a capture is permanent and sits in the
collection to be played from there.

**The walk holds while an echo is talking**, which the real product does not need. Out on a
street you walk and listen at the same time, in real time. Here the map runs at fourteen
times life so fifty minutes fits in three, and narration cannot be compressed with it — you
would capture twelve echoes in the time it takes to narrate one, and the queue would spend
the whole walk giving up on things. Holding the map keeps both halves honest.

A browser with no speech voices installed — a headless one, usually — falls back to a timer
of the echo's stated duration rather than ending instantly. A player that finishes the moment
it starts drains the queue in a single frame, and every transition the queue exists to get
right would go untested.

## What is real and what is faked

**Real:** `WalkSession` from `@echofinders/core`, and everything it drives — corridor
search, eligibility gates, dwell timing, capture, proximity guidance, haptic cues, rarity.
The same code an iOS build runs.

**Faked:** the GPS chip. `SimulatedJourney` implements the engine's `LocationSource` and
takes its position from `RouteProfile` — the same distance–time curve the scheduler plans
against — with jitter sized to the accuracy the mode claims, so the smoothing in
`ProximityGuide` is doing real work rather than being handed a perfect signal no street ever
produces.

Driving it from the profile rather than a constant speed matters: the traveller idles before
setting off, slows on arrival, and actually stands still at the stops a route declares. A
simulation with a speed of its own would disagree with the playlist about what the listener
hears — a walker who strolls through Bowling Green at a steady pace cannot capture both
echoes there.

**Absent:** a basemap. Tile providers are unreachable from the build environment, and the
pin states are what this exists to show. A real map slots in underneath without changing any
of the pin or ring code.

**Overridden:** the library's editorial status. Every echo in `content/` is correctly sitting
at `draft` / `unchecked` because nobody has fact-checked it yet, and the engine refuses to
serve unapproved content — so the generated module carries a clearly-labelled demo copy with
those two fields flipped. The content files themselves are untouched.

## What it demonstrates

**Four pin states.** Sealed is an outline; opening fills a ring; captured is solid aqua;
heard is muted. The ring is driven by the engine's `opening` event rather than a local
animation timer, so it completes at exactly the moment the echo opens. A ring that disagreed
with the capture would be worse than no ring.

**Sealed echoes show their teaser, not their title.** The map is a map of promises: you can
see something is there and roughly what kind of thing, and finding out means going.

**The haptic, made visible.** The bar above the sheet pulses in time with the cue the engine
emitted — same rhythm, same meaning. On a phone this is a vibration felt through a pocket;
on an iPhone web build it is the only feedback there is (ADR-0011).

**Coarse distances.** "About 100m", never a live metre count. A number ticking down invites
staring at the screen, which is what the whole design is arranged to avoid.

**Rarity in words.** "You have to be close", not a tier badge. `rarityReasons()` explains why
something was hard to reach; a badge explains nothing.

## The collection

Not the same thing as "Saved" in the flight prototype, and merging them would muddle both:
saved is *places you want to go*, this is *places you actually stood*. One is a wish list,
the other a record — and the record is the reason someone keeps the app.

Grouped by rarity, with the reason in words. The footer states which of the two things is
being stored, because the distinction is the whole point of the privacy model and it is
invisible unless the UI says it.

## Privacy

Its own screen rather than a settings row, since two of its switches delete data the moment
they are used. Every control says what is *lost* by turning it off, and the "what works
right now" panel is generated by `featureAvailability` from the engine rather than written
twice — so the fallbacks shown are the real ones.

Switching "Remember where I stood" off names the number of positions it will delete, and
the collection footer changes with it.

## What is not here yet

The camera viewfinder, provenance badges for contributed echoes, and sheet detents.
`docs/ui-review.md` has the full list and the order I would build them in.

One thing multi-modal support has newly exposed: **proximity guidance is a walking feature
being shown in every mode.** Hot-and-cold haptics exist so somebody on foot can steer
towards an echo without looking at the screen. A passenger cannot steer an aircraft and a
driver cannot leave the Parkway, so in air and car the bar is telling them about a choice
they do not have. The engine is right to emit guidance — proximity is proximity — but the
client should probably stop rendering it above walking and cycling pace. Left as it is for
now because it is a product decision, not a bug.
