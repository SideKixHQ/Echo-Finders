# ADR-0015 — Guidance belongs to whoever is steering

**Status:** accepted · **Date:** 2026-09-22 · **Refines ADR-0007 and ADR-0011**

## The wrong axis

Multi-modal support made proximity guidance look wrong in the air, and the first diagnosis
was that it was a *speed* problem: hot-and-cold haptics help a walker and are useless at
850 knots, so gate them above walking and cycling pace.

That reasoning quietly assumes a driver is a passenger, and they are not. A navigator in a
car can say "turn left here" as readily as someone on foot can turn left. More than that,
both of them can plan a route *around* the echoes they want before setting off — which is a
whole feature, and it is one walking and driving share.

The real distinction is **agency over the route**, not speed:

- **Self-directed** — walking, cycling, driving. The traveller, or somebody sitting next to
  them, decides where to go and can change that decision mid-journey.
- **Carried** — flight, rail. The route is somebody else's, the timetable is not negotiable,
  and the door is locked.

This is the same line ADR-0014 already drew for `destinationDwellS`, where arriving means
opposite things depending on whether you chose to be there. It is now named once, as
`ModePreset.selfDirected`, instead of being rediscovered per feature.

## What it governs

Guidance answers *which way should I go*. Where the listener has no answer to give, the
question is noise: buzzing at an aircraft passenger about a landmark eighty kilometres off
the track describes a choice they do not have.

So in carried modes the session renders no cue — haptic or audible — and the client draws no
guidance bar. It still **computes** guidance in every mode, because proximity is proximity
and the map wants it; withholding the cue is a rendering decision, not a reason to stop
knowing. There is a test for exactly that, because the tempting shortcut is to skip the
calculation and it would quietly break the map.

The flag is also what any future route planning should read. "Detour two hundred metres to
reach this one" is a sentence worth saying to a walker or a driver and worth saying to
nobody else.

## The sound

Headphones are the one channel this product can always count on, because wearing them is the
premise. The haptic beside it reaches only someone holding the phone, and on iOS Safari it
does not exist at all (ADR-0011) — so an audible cue is not a flourish, it is the fallback
that makes hands-free guidance work on the platform where the primary channel is missing.

The cue is literally an echo, and that is not only a pun. An echo is the sound of a space:
far from a wall the returns are slow, spread out and faint; close to it they arrive almost on
top of the original. So distance is rendered as the shape of the reflection — a long way off,
one note and several slow fading returns; nearly there, the returns tighten until they
collapse into the note itself. At arrival there is no reflection at all, because you are
standing at the thing making the sound.

Two properties make this worth the complexity over a simple beep. It carries distance
without a word, so it never competes with narration for meaning — it is a shape, not a voice.
And it degrades honestly: a listener who hears only the first note still knows something is
near.

Pitches are a rising minor arpeggio rather than arbitrary frequencies, so approaching sounds
like melody rather than like a car alarm. Going the wrong way drops below the starting pitch,
which reads as wrong without being unpleasant — a shrug, not a reprimand, per ADR-0011.

`ToneCue` is derived from `HapticCue` rather than from distance, so the two channels cannot
disagree about how near something is. One proximity model, two ways of expressing it.

## Consequences

- `TonesSink` is a separate adapter from `AudioSink`. Narration and guidance need their own
  buses and their own levels, and a listener who mutes the guidance must not lose the story.
- `ModePreset.selfDirected` is the flag to read before building anything that tells a
  traveller where to go. Rail is `false` today; a rail product that gets people off at the
  right station would be the case for revisiting it.
- Route planning that offers detours to reach echoes — the feature this decision was
  prompted by — is not built. This records where it belongs when it is.
