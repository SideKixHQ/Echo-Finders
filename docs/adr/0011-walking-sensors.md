# ADR-0011 — Haptics, the camera view, permissions — and the platform problem underneath

**Status:** accepted · **Date:** 2026-09-21 · **Challenges ADR-0001 for one mode**

## Hot and cold, by feel

A vibration that quickens as you approach turns navigation into the children's game, and
does something more useful besides: **it works through a pocket**. Nobody has to look. That
is capture-by-arrival (ADR-0010) extended to the walk itself, and it is also how a person
who cannot see the screen navigates to an echo at all.

Three findings shaped the design, all about perception rather than hardware:

**Rhythm carries further than strength.** Through denim, at walking pace, the difference
between a 60% and an 80% buzz is close to imperceptible; the difference between a pulse
every two seconds and one every half second is unmistakable. Distance is therefore encoded
as *pulse rate* — a metal detector, not a dimmer switch — with intensity secondary.

**The game is about change, not distance.** "Warmer" and "colder" are comparisons. A person
walking needs to know whether the last ten steps helped, not their absolute position.

**Smoothing is not optional.** A phone standing still on a windowsill reports several
metres of drift. Fed raw, the cue would flip between warmer and colder several times a
minute and stop meaning anything, so `ProximityGuide` smooths distance and ignores changes
below a noise floor.

Going the wrong way is a shrug, not a reprimand: slower, softer, longer pulses. And nothing
buzzes at all until the listener is genuinely near something, for their attention and their
battery alike.

## The camera view is a bearing overlay, not AR

"AR" covers two very different things, and the expensive one is worthless here.

True augmented reality — surface detection, world anchors, occlusion — needs ARKit or
ARCore, does not exist in mobile Safari, and would place a marker with centimetre
precision. We do not have centimetre precision to place. We know where an echo is to within
a GPS fix, and which way the phone points to within a compass reading, which in a street
lined with steel-framed buildings can be tens of degrees out.

So: the camera feed, with markers placed by **bearing** — the technique peak-finder and
star-gazing apps use. Works everywhere, degrades gracefully.

One rule follows from the uncertainty, and it matters more than the rest: **draw a region,
not a pin**. A marker saying "somewhere in this arc" stays honest when the compass is
twenty degrees out. A pin hovering confidently over the wrong building is worse than no
marker at all — and it is precisely what a naive implementation produces in a city centre,
which is where echoes are densest. `headingIsUsable` exists so the view can admit defeat
and fall back to the map rather than point somewhere wrong.

## Position accuracy scales with the echo, not the travel mode

The first implementation granted a fixed 60m of GPS slack. That is wrong in both
directions: 60m doubles the radius of a 50m doorway, and is noise against a 3km roadside
echo.

The instinct to fix it per travel mode is also wrong, because **both inputs already carry
the mode's scale**. A walking echo has a fifty-metre radius and a driving one has three
kilometres; meanwhile the device reports an accuracy that already reflects whether it is
under open sky or between tower blocks. A mode table on top of that would duplicate what we
are already told — and would go stale the moment someone walks a route authored for a car.

So slack is `min(reported accuracy, radius × 0.5)`. Two ceilings, both needed: a precise fix
grants almost no slack because there is no reason to be generous when the device is sure,
and a vague fix cannot inflate a doorway into a neighbourhood. In practice the reported
accuracy binds and the fraction only catches pathological cases.

A fix vaguer than **twice** the radius is refused outright. Two rather than three, because
the failure modes cost differently: refusing to open an echo someone is standing next to
costs them a few more steps, while opening one they are nowhere near makes the app a liar
and they will not trust the next capture.

`typicalFixAccuracyM` is published per mode as **authoring guidance only**. On foot it is
30m — a street between tall buildings is the worst place a phone can be asked where it is —
so the validator now warns about any echo authored tighter than that. Such an echo is not
capturable; it is a coin toss.

## Permissions

Two commitments, both testable rather than aspirational.

**The app must be fully usable with foreground location alone.** Refusal rates for
everything else are high, App Store review is sceptical of background location, and an
experience that collapses without it is one most people never get to have.
`featureAvailability` returns `full`, `degraded` or `unavailable` per feature with a
concrete fallback, so the UI can say "keep the app on screen and this still works" instead
of "walking mode unavailable".

**Never ask cold.** A prompt fired at first launch, before anyone knows what the app does,
is the commonest way to lose a capability permanently — on iOS a refusal cannot be
re-prompted, only fixed in Settings, which nobody does. Every capability records the moment
it becomes worth asking, always *after* the person has tried the thing that needs it.
Notifications come last of all, after a first capture, when there is something to notify
about.

Nothing is requested that cannot be justified: no microphone, no contacts, no photo
library, no advertising identifier. An app that asks for nothing it cannot explain is an
app whose prompts get granted.

## The platform problem this exposes

ADR-0001 chose a web client, on the grounds that a passenger cannot install an app after
boarding. That reasoning is sound **for flight** and does not hold for walking:

| Walking mode needs | On the web |
|---|---|
| Haptics | `navigator.vibrate` on Android; **nothing at all on iOS Safari** |
| Background location with the screen off | Unreliable at best |
| Background audio through a screen lock | Fragile |
| Continuous GPS without ruining the battery | Poor |

The first row is the hard one. There is no vibration API in mobile Safari, so on an iPhone
the hot-and-cold mechanic — the thing that makes walking mode work without looking — simply
cannot be delivered by a web app. The rest of the table is degradation; that row is absence.

**Decision: keep the web client for flight and seatback, and accept that walking mode wants
a native shell on iOS.** The engine is unaffected either way — it is pure TypeScript with
no I/O, emits abstract haptic cues rather than calling any vibration API, and runs unchanged
inside React Native. That is precisely why it was built that way.

This is not a decision to act on yet. It is a decision to stop assuming one client can serve
both, and to price the native shell into the walking-mode plan rather than discovering it
during the build.
