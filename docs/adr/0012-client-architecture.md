# ADR-0012 — Two clients, one engine

**Status:** accepted · **Date:** 2026-09-21 · **Refines ADR-0001 and ADR-0011**

## Decision
- **iOS: a real React Native app.** Expo, native modules for location, haptics and audio.
- **Web: Next.js.** Serves the flight and seatback experience, and the pre-flight preview.
- **Both sit on `@echofinders/core`**, which is where everything that is not pixels lives.
- **Android later**, reusing the iOS app almost entirely.

## Why not one React Native codebase for both

`react-native-web` is the obvious suggestion and it is wrong here, for three reasons that
all come down to the two products being less similar than they look.

**The map is a different component.** The flight client wants MapLibre GL JS — vector
tiles, offline extracts, running inside a seatback browser. The walking client wants a
native map for battery and smoothness while the screen is on for an hour. These are
different renderers with different APIs; a shared abstraction over them would be a
lowest-common-denominator map that serves neither well.

**The seatback is a hostile environment.** Panasonic and Thales systems render in embedded
browsers of uncertain vintage. That build wants plain, boring, robust web — not a
React Native Web bundle carrying a mobile framework's runtime through an old WebView.

**The interaction models barely overlap.** A seated passenger with five hours and a seatback
screen, versus someone walking with a phone in their pocket and the screen off. They share
content and logic. They share almost no components.

## Why not Capacitor

Wrapping the web app would be cheaper and would deliver native haptics and background
location. But the result is a WebView, and walking mode is an hour of continuous location,
audio and animation — precisely where a WebView's cost shows. "A clean iOS app" rules it out.

## What is shared, and it is the valuable part

Everything above the device sits in `@echofinders/core`: geometry, travel modes, scheduling,
scoring, editorial gates, capture, rarity, proximity cues, permission policy, offline Echo
Journeys. It is pure TypeScript with no I/O, 308 tests, and it runs unchanged in Safari, in
a seatback browser and inside React Native.

`WalkSession` is the seam. It takes a location source and optionally something that can
vibrate and something that can play audio, and it emits events: position, nearby, guidance,
opening, captured. An iOS build subscribes and renders. It never decides when to capture,
how to smooth GPS noise, or whether a buzz is warranted — those are engine decisions, tested
without a device, identical across platforms **by construction rather than by discipline**.

That is what keeps a second platform cheap. The four interfaces a platform must implement
are in `src/session/adapters.ts`, and they are deliberately tiny.

## Haptic cues are intentions, not waveforms

`HapticsSink.play` takes a `HapticCue` — kind, intensity, pulse length, interval — rather
than a duration list or a waveform. The three platforms are mutually unintelligible here:
iOS Core Haptics has intensity and sharpness, Android has amplitude, and the web has an
array of milliseconds and nothing else. Translating an intention downward is
straightforward. Translating a waveform is lossy.

## Repository shape

```
packages/core     The engine. Pure TypeScript, no I/O, no framework.
apps/ios          Expo React Native. Implements the four adapters, renders the UI.
apps/web          Next.js. Flight, seatback, pre-flight preview.
```

`apps/*` are not yet created: an Expo project cannot be meaningfully built or verified in
this environment, and scaffolding one blind would produce configuration nobody had run.
The engine boundary they will sit on is finished and tested, which is the part that is
expensive to get wrong.

## What the iOS app has to implement

| Interface | iOS |
|---|---|
| `LocationSource` | CoreLocation, with background updates for hands-free walking |
| `HapticsSink` | Core Haptics; intensity and sharpness from the cue |
| `AudioSink` | AVAudioSession configured for background playback and mixing |
| `PermissionsAdapter` | The prompts, in the order `CAPABILITY_NEEDS` specifies |

Plus a map, the screens from the prototype in `design/`, and nothing else that the engine
does not already do.

## Two things to confirm before the iOS build starts

1. **Background location** is the permission most likely to be questioned in App Store
   review, and the justification has to be crisp: echoes open with the screen off so people
   can walk and listen rather than stare at a phone. The app is designed to work without it
   (ADR-0011), so a refusal degrades rather than breaks — worth stating in the submission.
2. **Capture records are a location history**, which is sensitive personal data whatever
   else it is. They should be local-first, exportable and deletable, and the privacy policy
   should say so plainly before anyone is asked to grant anything.
