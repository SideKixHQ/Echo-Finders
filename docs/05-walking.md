# Walking is not a small flight

*Echo Finders is a Whatishere.com product.*

Walking currently gets the flight screen with different numbers in it. This is the research
on why that is wrong, and what to build instead.

## The problem, stated precisely

A route map is a map **of a journey**. It answers "where am I along this, and what is
coming". That is exactly the question a passenger has and exactly the question a walker does
not. A walker has a here, a few hundred metres of there, and a head they can turn.

Worse, the map asks for the one thing the whole product is arranged to avoid. Every other
decision here says "phone in your pocket, look at the street": the haptics, the hands-free
capture, the audio-first stance in ADR-0001. Then the resting screen is a map, which is a
thing you can only use by looking at it. The interface argues with the product.

## What the research says

### Spatialised audio is a navigation interface, and a proven one

**Microsoft Soundscape** (Microsoft Research, 2017 to 2023, now open source) is the closest
thing to a finished version of what we want. Its central mechanic: you set an audio beacon,
and **a continuous rhythmic sound comes from the direction of the beacon**, spatialised in
3D. Travel directly toward it and **a higher-pitched cue sounds**. The phone stays in your
pocket. Alongside the beacon, "callouts" name points of interest automatically as you pass
them.

Two things matter about Soundscape for us. First, it was explicitly built for *ambient
awareness* rather than turn-by-turn navigation, which is our stance too. Second, it was
built for blind and low-vision users, and it turns out to be the better interface for
everyone walking down a street, for the same reason: it leaves your eyes on the world.

**SWAN** (2006) established the underlying finding: a single beacon producing intermittent
spatialised audio at the destination is an unobtrusive and effective guidance signal. Its
sound-design lessons are directly usable: **wideband sounds are easier to localise than pure
tones**, and the capture radius wants to be mid-sized rather than tight.

### Language is the expensive part, not sound

**"Hearing the Way Forward"** (CHI 2023) found it is possible to communicate precise spatial
actions **without verbal turn-by-turn cues at all**, and that this is significantly less
distracting. Processing language takes attention; a tone from a direction does not.

This is the argument against the obvious alternative of "the app tells you: turn left in
fifty metres". We already spend the listener's language budget on the echo itself. Spending
it again on navigation is spending it twice.

### Open-ear hardware is the norm now, not an accessory

Bone-conduction and open-ear earphones are the preferred wearables for audio augmented
reality, precisely because they keep your ears open to traffic and conversation. The design
should assume them rather than treat them as a special case. One known weakness worth
designing around: they localise poorly in elevation, which is why every system in the
literature uses **pitch** for the vertical axis rather than trying to spatialise it.

### The hunt is the pleasure, not the find

Geocaching's psychology is the foraging instinct under controlled uncertainty, and the
finding that matters for us is that the reward is released **throughout the search as you
get closer**, not only at the moment of finding. That argues for continuous proximity
feedback rather than a silent walk and an arrival event. We have this already as the
hot-and-cold haptics; it is currently the app's best idea and its least visible one.

### The Assassin's Creed lesson is about fiction, not UI

Synchronisation works in those games because the mechanic **is** the fiction: your health is
your fidelity to the memory, so losing health is deviating from what actually happened. The
lesson is not "add a sync bar". It is that our sync should be a thing you experience rather
than a state the interface reports. Standing in the place and hearing the past resolve out
of noise is the mechanic being the fiction. A progress ring is the mechanic being a ring.

## The proposal: the street hums

**On foot, the resting screen is not a map. It is a compass made of sound.**

Every echo within reach emits a quiet looping tone, spatialised with a Web Audio `PannerNode`
in HRTF mode, positioned at its true bearing and distance relative to which way you are
facing. Turn, and the hums move around your head. Walk toward one and it swells and its
pulse quickens. Walk away and it thins out.

That is the entire navigation interface, and it works with the phone face-down in a pocket.

### Three things make it ours rather than a copy of Soundscape

**1. The neighbourhood is a chord.** Soundscape beacons one destination at a time. We hum
*everything in range at once*, each category with its own timbre, mapped from the palette
that already exists in `echo-tone.ts`. A corner with a ghost story to your left and a food
story behind you does not sound like a corner with two history plaques. You can hear the
shape of a place before you know a single fact about it, and that is a thing no other
product does, because no other product has a categorised library pinned to coordinates.

Density is a real risk, so the rule is: **four at most, nearest first, and never two of the
same category at once.** Anything beyond that is noise, not a chord.

**2. Sealed echoes sound sealed.** This is where the sync fiction becomes audible. An echo
you have not synced is heard through a low-pass filter and a little noise: present, placed,
but muffled, like something behind a wall. As you close on it the filter opens. When you are
inside the radius and still, it **resolves**. The noise falls away, the filter opens fully,
and the tone lands clean. That resolution *is* the sync. No ring, no progress bar, no
notification. You hear a memory come into focus because you stood where it happened.

**3. Silence is a feature.** Nothing hums while an echo is playing. The hunt and the story
never compete, which is the mistake every location-audio app makes.

### What is on screen when you do look

A rose, not a map. You at the centre facing up, echoes as coloured arcs at their true
bearing, distance as radius, thickness as rarity. Sealed ones drawn as outlines, synced ones
filled. It is the same information the ears are getting, so a glance confirms rather than
replaces.

The street map stays, one tap away, for the moments when you genuinely want to orient. It is
just no longer the thing you are handed by default on foot.

### What happens without headphones

The rose is the fallback and the haptics carry the proximity, which is what they already do.
On a device with no vibration API at all, which is every iPhone on the web per ADR-0011, the rose
plus the existing proximity pill is the whole interface, which is still better than a map at
this scale.

## Why this is buildable soon

Almost all of it already exists and is not being used together.

| Piece | State |
| --- | --- |
| Bearing and distance to every nearby echo | `findEchoesNearby` returns `bearingDeg` and `distanceKm` |
| Compass heading, with the iOS permission dance | `use-sensors.ts`, including `webkitCompassHeading` |
| Facing-versus-bearing maths | `alignmentTo` in `proximity/archive.ts` |
| An `AudioContext` with oscillators | `echo-tone.ts` |
| Category identity to hang timbre on | `categories.tsx`, nine of them |
| Sync state per echo | `CaptureTracker`, `sealed / opening / captured / heard` |

What is genuinely new is one audio graph (a panner, a filter and a gain per humming echo,
driven by the position stream) and one view. The engine needs nothing: `WalkSession` already
answers "what is around me and how far" four times a second, which is the hard part and was
built long ago.

**Honest risks.** HRTF panning in `PannerNode` is real but modest over open-ear hardware;
the effect may read more as left-right than as a true 3D point, which is survivable because
left-right plus distance is all the information we need. Compass heading on the web is noisy
and needs heavy smoothing or the whole field wobbles. And battery: an audio graph plus GPS
plus a compass is the most expensive thing this app will ever do, so it wants a hard "hum
only while moving" rule.

## What I recommend

Build a rough version of the hum and the rose behind the walking mode, on real GPS, and walk
around with it. It is a day to something you can take outside, and it is the kind of idea
that either lands in the first thirty seconds or does not, so it should be judged on a
pavement rather than in a document.

## Sources

- [Microsoft Soundscape, Microsoft Research](https://www.microsoft.com/en-us/research/product/soundscape/) and its [open-source release](https://github.com/microsoft/soundscape)
- [Hearing the Way Forward: Exploring Ambient Navigational Awareness with Reduced Cognitive Load through Spatial Audio-AR, CHI 2023](https://dl.acm.org/doi/fullHtml/10.1145/3544549.3585800)
- [Bone-Conduction Audio Interface to Guide People with Visual Impairments](https://link.springer.com/chapter/10.1007/978-981-15-1301-5_43)
- [Wayfinding with audio: designing 3D auditory displays](https://thetylergibson.com/wayfinding-with-audio-designing-3d-auditory-displays/)
- [PannerNode.panningModel, MDN](https://developer.mozilla.org/en-US/docs/Web/API/PannerNode/panningModel)
- [The psychology of geocaching](http://blakemore.me.uk/2026/03/11/the-psychology-of-geocaching-or-why-hunting-tupperware-feels-so-good/)
- [Synchronization, Assassin's Creed Wiki](https://assassinscreed.fandom.com/wiki/Synchronization)
