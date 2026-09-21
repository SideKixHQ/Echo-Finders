# iOS permissions, purpose strings, and App Store review

**Verify every key name and requirement against Apple's current documentation before
submission.** The shapes below are stable and long-established, but Apple moves, and a
rejection over a renamed key is an avoidable week.

---

## The permission that decides the review: background location

Background location is the most scrutinised permission Apple grants, and the rejection is
almost always the same one: *the app has not demonstrated that the feature genuinely
requires it.* Two things get past that, and both are true here.

**A user-visible feature that cannot work any other way.** Echoes open when you arrive
somewhere, with the phone in your pocket and the screen off, so that you are looking at the
street rather than at a phone. Foreground-only location means holding the phone up for the
length of a walk, which defeats the feature entirely.

**Graceful degradation.** The app is designed to work without it (ADR-0011), and
`featureAvailability` proves that rather than asserting it. Saying so in the review notes
is unusually persuasive, because most apps asking for Always cannot say it.

### Request it the way iOS expects

Never request Always first. The sequence:

1. **On first use**, request *When In Use*. This is the essential permission and the app is
   fully usable with it alone.
2. **The first time someone starts a hands-free walk**, explain in our own words what
   pocketing the phone will do, then request the upgrade to Always.
3. **If refused**, carry on. Show the fallback — "keep Echo Finders on screen while you
   walk and echoes will still open" — and never ask again in-session.

`capabilitiesToRequest("first-hands-free", granted)` encodes step 2, and the whole ladder is
in `CAPABILITY_NEEDS`.

> **Check before building:** iOS shows its own periodic reminder that an app has been using
> location in the background, and the exact behaviour of the provisional-Always grant has
> changed across versions. Confirm the current flow in Apple's Core Location documentation
> rather than relying on this note.

---

## Info.plist

Purpose strings are read aloud by the system prompt, and vague ones are a documented
rejection reason. Each of these says what the app does with the data and what the person
gets — never "to improve your experience".

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Echo Finders uses your location to find the stories attached to the place you are
standing, and to open them when you arrive.</string>

<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>So stories can open with your phone in your pocket and the screen off, while you
walk and listen. Echo Finders works without this — you would keep the app on screen
instead.</string>

<key>NSCameraUsageDescription</key>
<string>Echo Finders uses the camera so you can hold up your phone and see which stories
are around you in the street.</string>

<key>NSMotionUsageDescription</key>
<string>Echo Finders uses the compass to show which way to look for a nearby story.</string>
```

```xml
<key>UIBackgroundModes</key>
<array>
  <string>location</string>
  <string>audio</string>
</array>
```

`audio` is for narration continuing while the screen is locked, which is the entire point of
an audio product. `location` is for opening echoes on arrival.

> **Check before building:** `NSLocationAlwaysUsageDescription` is the legacy key for very
> old iOS versions. Confirm whether your deployment target still needs it.

---

## App Privacy ("nutrition label")

Declared in App Store Connect, and it must match reality — a mismatch is both a rejection
and, later, a credibility problem.

| Data type | Collected? | Notes |
|---|---|---|
| Precise location | **Not collected** | Used on device; never transmitted to us. |
| Coarse location | **Not collected** | |
| Identifiers | **Not collected** | No account, no advertising identifier. |
| Usage data | Only if enabled | Opt-in, anonymous, not linked to identity. |
| Contacts, photos, health, financial, browsing | **Not collected** | Never requested. |

The honest and unusual answer here is **"Data Not Collected"** for location, because it is
true: location is processed on the device and the collection lives there. That claim is
worth protecting — the moment any server-side sync is added, this table and the privacy
policy both have to change *before* the feature ships.

---

## Review notes — draft

> Echo Finders plays short audio stories about the place you are standing in.
>
> **Why background location:** in walking mode, stories open automatically when the user
> arrives at a location, with the phone in a pocket and the screen off. The product's
> purpose is to keep people looking at the place around them rather than at a screen;
> requiring the app to stay in the foreground would defeat it.
>
> **The app works without it.** If background location is declined, the app degrades rather
> than breaks: stories still open while the app is on screen, and the user is told so in
> plain language. Background location is requested only when the user first starts a
> hands-free walk, never at launch, and can be switched off at any time in Settings →
> Privacy.
>
> **Location is not collected.** It is processed on the device. The user's collection is
> stored locally and can be exported or deleted from Settings. Recording the precise
> position where a user stood is a separate setting which is **off by default**.
>
> **To test:** enable Hands-free walking in Settings → Privacy, then use the location
> simulation route provided. Stories open as the simulated position reaches each point.

---

## In-app controls

Apple expects a permission to be revocable, and people expect it not to be buried. The
settings screen carries these, in this order:

1. **Hands-free walking** — the background location switch, in the user's language rather
   than the system's. Off by default. Turning it off takes effect immediately and loses
   nothing already found.
2. **Remember where I stood** — precise position recording. Off by default. Turning it off
   deletes existing positions in the same action.
3. **Keep my collection** — stop recording found echoes entirely.
4. **Export my data** — plain JSON.
5. **Delete my positions** / **Delete everything** — immediate and permanent.

Each carries a one-line explanation of what is lost by turning it off, because a switch
whose consequence is unclear is not really a choice. The engine enforces this shape:
`PrivacySettings` defaults to the cautious values and `capabilitiesImpliedBy` makes it
impossible to justify a prompt for something switched off.

---

## Two things to do before submitting

1. **Have a lawyer read `docs/privacy-policy.md`.** It is written to be honest and
   comprehensible, not to be legally complete for every jurisdiction you ship in.
2. **Re-verify this file against Apple's current documentation.** Written 21 September 2026.
