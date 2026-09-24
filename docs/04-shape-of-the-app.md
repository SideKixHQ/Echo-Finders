# What the app is for, and why it does not currently feel like it

*Echo Finders is a Whatishere.com product.*

A review of the built app against its own purpose. `ui-review.md` is the older companion to
this and looks at the design prototype against the engine; this looks at what we actually
shipped, and concludes that the biggest problem is not a screen. It is the shape.

## The purpose, in one line

**Go to a place, and hear what happened there.**

Everything downstream is a consequence of that sentence, and two of the consequences are
load-bearing enough that the engine enforces them rather than trusting anybody to remember.

**Presence.** The attention belongs on the place, not the phone. That is why capture is
arrival and not a mini-game (ADR-0010): a catching animation would sit between a person and
the thing they came for, and every second of it is a second spent looking at a screen
instead of at the building the story is about. It is why the whole loop has to work with the
phone pocketed and the screen off, why the distance readout is deliberately coarse, and why
the proximity cue is sound and vibration first.

**A record that was earned.** The collection is not a score. It is where you actually stood,
which is only worth keeping if the difficulty was real, so rarity is derived from facts
about the world rather than assigned as a design dial (ADR-0010). The same instinct puts
`certainty` on every echo as a validated field (ADR-0009): a ghost story and a census record
sound identical in a narrator's confident voice.

Three states, not two: **sealed → captured → heard**. Arriving opens an echo; listening is a
separate decision, made later, possibly on the train home. Collapsing them would force
somebody to choose between standing still to finish a story and walking on and losing it.

## The diagnosis: the app is route-shaped, the product is place-shaped

Here is the thing that made this review worth writing.

```
WalkSession(library, listener, deps, { mode })     ← no Route, and never has been
findEchoesNearby(at, library, listener, …)         ← "no route at all"
```

The engine has **never** required a route. `findEchoesNearby` has a docstring that describes
the walking case exactly: *"wandering a city, arriving somewhere with an afternoon free, or
simply looking up from a bench and wondering what happened here."* The session already calls
it. The capability has been sitting there the whole time.

And yet every way into the app is: choose a prepared route, download it, start it. There is
no door marked *I am just here*.

That is the flight product colonising the walking one. On a flight a route is real and
given to you — it is printed on a boarding pass, you cannot change it, and packaging it
ahead of time is the difference between working and not (ADR-0003). On foot the same
structure is a fiction. Nobody walking through a city has a route. They have a place, an
hour, and some curiosity.

ADR-0007 says the engine is built around routes rather than flights, and the engine took
that lesson properly. The interface did not: it generalised *flight* into *route* and
stopped, when the honest generalisation was *journey or no journey at all*.

This is the answer to "if you are walking and you want to hunt for echoes, how do you really
do that?" **You cannot.** Not because it is hard, but because the front door is missing.

## Two front doors, not one

| | Around me | Take a journey |
|---|---|---|
| Who it is for | Anybody, anywhere, right now | Somebody going from A to B |
| Route | None | Chosen, packaged, downloaded |
| Modes | Walking, cycling | All five; **required** for flight and rail |
| The question it answers | What happened here? | What will I pass? |
| Map | Centred on you, whatever is around | The line, and what is along it |

This maps cleanly onto the split ADR-0015 already named. **Self-directed** travellers can
change their mind mid-journey, so they get free roam as the default and a journey as an
option. **Carried** travellers cannot, so a journey is the only thing that makes sense and
the package must exist before departure.

Free roam is close to free: the engine query exists, the session takes no route, capture,
proximity, haptics and the collection are all route-agnostic already. What is missing is a
screen that does not ask which walk you are on.

## Answering the three questions

### "How do I change from air, car, walk?"

You cannot find it because I removed it, and the reasoning was half right. Mode is a
property of a *journey*, not a global setting — you do not put the app into aeroplane mode,
you pick a flight and the flight is a flight. So I moved mode selection onto the package
screen, where journeys are chosen.

That is correct for flights and useless for walking, because on foot there is no journey to
pick, so the control vanished entirely. The fix is not to put a mode switch back on the map.
It is the two front doors above: choose **Around me** and you are walking by definition;
choose **Take a journey** and the journey carries its own mode.

### "The Listen page and Found page are still confusing"

Because there are three lists for two ideas.

| Today | Holds | Honest name |
|---|---|---|
| Listening | Echoes ticked to auto-play as you reach them | A setting on a journey |
| Found | Echoes you arrived at | Your record |
| Saved (in the sheet) | Echoes bookmarked to hear later | Your intentions |

Listening is the odd one. It is not a place, it is a *decision about a journey* — and it
only pays off if you are going to pocket the phone, which means it belongs on the screen
where you are already deciding what to carry. As a top-level tab it competes with the map
for the same job and loses, because on the map you can simply press play.

Found and Saved are two halves of one idea: **echoes that are yours**, some of which you
have heard and some of which you have not. They should be one screen with sections, which is
already how the design handles a list of mixed things.

Proposed navigation:

    Map          the app
    Yours        not heard · heard · saved for later
    Settings     privacy, audience, the package

Three tabs. Listening disappears as a destination and survives as a switch on the package
screen where it makes sense.

### "How do I stop or pause?"

The large round button, which becomes two bars while something is playing. It exists in two
places depending on sheet height. The fact that the question was asked is the finding: it is
the only transport control that is always visible, and it is easy to read as decoration. It
also only pauses. There is no *stop* — no way to say "I am done with this one" — and on a
product whose premise is that you listen while walking away from a place, that is a real gap
rather than a nicety.

## What I would do, in order

1. **Around me.** The missing front door, and the primary walking experience. The engine
   does the work already.
2. **Merge Found and Saved into Yours**, and retire Listening as a tab.
3. **Stop, as well as pause**, and make the transport legible at every sheet height.
4. Then the entitlement chain, because there is no point charging for a product whose main
   use case has no entrance.

## What is already right, and should not be touched

The map being the app, full bleed, everything floating over it. The three-detent sheet.
Capture by arrival. The separation of found from heard. Coarse distances. Sound before
visuals. The category key as a permanent, always-visible row. The engine's refusal to let
the interface invent state it does not own.

The problem is not the parts. It is that they are all arranged around a journey, and most of
the time there will not be one.
