# The App Store: what is done and what is left

Written 2026-11-12, when the native iPhone app (`apps/ios`, ADR-0012) reached its store
build. The WebView test shell is deleted; every eas profile builds the native app.

Bundle `com.echofinders.app`, App Store Connect app 6822091365, team 75682A9A73
(`apps/ios/eas.json`). Expo SDK 58.

## The eight steps

| Step | What | State |
|---|---|---|
| 1 | Native app and the MapLibre map, built from our own tiles (ADR-0019) | Done (#217) |
| 2 | Download packs: echoes, audio and the map with no signal | Done (#218) |
| 3 | Playback: one narrator, mixes with other audio, lock screen controls | Done |
| 4 | Hands free walk: echoes start as you reach them, phone in pocket | Done |
| 5 | In-app purchase: City Pass, Week Pass, All-Access; restore; website passes; Skeleton key | Done |
| 6 | Driving safety lock, and Settings complete against the web | Done (this step) |
| 7 | Store config (encryption, privacy manifest, purpose strings) | Config done; listing, screenshots and App Privacy remain |
| 8 | Review notes, sandbox purchase testing, submission | Not started |

### Step 6, as built

- **Driving lock** (`apps/ios/src/drive/`). About 25 km/h held for 15 seconds locks the
  screen behind a full screen notice; echoes keep playing. "I'm a passenger" unlocks until
  the trip ends (three minutes at walking pace, or with no fix). Blocker 14 is half settled:
  the web app has no lock.
- **Settings.** Location, Offline echoes, Membership, Skeleton key, then Your data:
  Privacy policy, Terms of service, Support (hello@echofinders.com), and the version and
  build number. No switches for usage statistics or error reports, because the iPhone app
  sends neither (no analytics, no Sentry). Add them, in the web's words, if that changes,
  and change the App Privacy answers below first.
- **True crime note** on a true crime echo's card, as on the web: "From public records.
  How we tell true crime", linking to the Terms.

### Step 7, the config half, as built (`apps/ios/app.json`)

- `ITSAppUsesNonExemptEncryption: false`. The app uses HTTPS through `fetch` and StoreKit,
  nothing else: no crypto library, no custom encryption. App Store Connect then asks no
  export compliance questions per build.
- Purpose strings: location When In Use, Always (and the legacy Always key), nothing else.
  No camera (it left with the shell), no motion and no temporary full accuracy (both
  switched off in expo-location's plugin; the app uses neither).
- `UIBackgroundModes`: `location` and `audio` only (`plugins/withoutBackgroundFetch.js`).
- The privacy manifest, below.

Check all of it with `npx expo config --type introspect` in `apps/ios`.

**2026-11-13.** The app now shows the approved web app (ADR-0012, amended 2026-11-13). Two
keys came with it: the camera string the shell carried (#211), for the web's Then and now
camera, and `WKAppBoundDomains` with the app's own site, for its offline copy. The privacy
manifest and the App Privacy answers below are unchanged, but the web app inside sends
anonymous usage counts unless Settings turns them off, and error reports when it is turned
on: they need James's answer before submission.

## What remains, for James

1. **Store listing text.** Name, subtitle (30 characters), promotional text, description,
   keywords, support URL, marketing URL. No dashes, "echoes" throughout.
2. **Screenshots.** 6.9 inch iPhone (1320 x 2868) at least; 6.5 inch if asked. Map, an
   echo's card playing, a hands free walk, Offline echoes, the paywall. Real device
   screenshots from a preview build.
3. **App Privacy answers** in App Store Connect, from the section below.
4. **Age rating questionnaire.** True crime is in the library (opt in, with an age on
   each echo): answer the violence and mature themes questions honestly; expect 12+ or
   higher. A decision for James.
5. **In-app purchase products** created and "Ready to Submit" in App Store Connect, with
   review screenshots, matching `apps/ios/src/purchases/products.ts`:
   `com.echofinders.app.allaccess.yearly` (auto-renewable, group "Echo Finders"),
   `com.echofinders.app.weekpass` (non-renewing), `com.echofinders.app.city.<id>` per
   City Pass city (non-consumable). They go to review with the first build.
6. **Sandbox purchase testing** on a real phone with a sandbox Apple Account: buy each
   kind, restore on a second phone, let All-Access renew in the sandbox's fast clock,
   cancel it, and check Settings says the right thing each time.
7. **Review notes** with the reviewer key (draft below).
8. **Submission:** a production build (`eas build --profile production`), TestFlight
   check on a phone, then `eas submit` and Submit for Review.

Also worth doing before submission: a lawyer's read of `docs/privacy-policy.md`
(`docs/ios-permissions.md`), and on a phone, a drive as a passenger to see the lock
appear, and a walk to see it does not.

## The privacy manifest

`ios.privacyManifests` in `apps/ios/app.json`, written into `PrivacyInfo.xcprivacy` at
build time.

| Key | Value |
|---|---|
| `NSPrivacyTracking` | `false` |
| `NSPrivacyTrackingDomains` | none |
| `NSPrivacyCollectedDataTypes` | none |
| `NSPrivacyAccessedAPICategoryUserDefaults` | `CA92.1` |
| `NSPrivacyAccessedAPICategoryFileTimestamp` | `C617.1`, `0A2A.1`, `3B52.1` |
| `NSPrivacyAccessedAPICategoryDiskSpace` | `E174.1`, `85F4.1` |
| `NSPrivacyAccessedAPICategorySystemBootTime` | `35F9.1` |

Where each comes from: the `PrivacyInfo.xcprivacy` files shipped by React Native
(file timestamps C617.1, user defaults CA92.1, system boot time 35F9.1), expo-constants
and expo-task-manager (user defaults CA92.1), expo-file-system (file timestamps C617.1,
0A2A.1, 3B52.1; disk space E174.1, 85F4.1), expo-application (file timestamps C617.1) and
MapLibre Native (file timestamps C617.1, system boot time 35F9.1, user defaults CA92.1).
OpenIAP, under expo-iap, uses `UserDefaults` and ships no manifest, so CA92.1 covers it.
Expo's guide asks for the libraries' reasons in the app's own manifest, because Apple does
not always read the manifests of static CocoaPods. Disk space is the app's own use too: the
Offline echoes screen reads and shows free space before a pack saves (`src/packs/store.ts`).

If Apple's email after an upload names a missing reason, add it here and to the table.

## App Privacy answers, to paste into App Store Connect

**Privacy Policy URL:** https://echofinders.com/privacy

**Data collection.** "Do you or your third-party partners collect data from this app?"
**No, we do not collect data from this app.**

That is the label "Data Not Collected". Why it is true, type by type, using Apple's
definition (collect means sent off the phone and kept longer than it takes to answer the
request):

| Data type | Answer | Why |
|---|---|---|
| Precise and coarse location | Not collected | Used on the phone only: the map, arrival at echoes, the driving lock. Never sent. |
| Purchase history | Not collected | App Store purchases are Apple's, read on the phone through StoreKit and never sent to us. A website pass is looked up by its Stripe customer number at launch (`/api/entitlement`); the server answers and keeps nothing. |
| Email address | Not collected | Typed only in "Bought on our website?", checked against Stripe in real time by `/api/restore`, never stored, no email sent. |
| User ID | Not collected | No accounts. The Stripe customer number stays on the phone and is only used to ask what it owns. |
| Usage data, diagnostics | Not collected | The iPhone app has no analytics and no error reporting. |
| Contacts, photos, health, financial info, browsing, identifiers for advertising | Not collected | Never asked for. |

**Tracking:** No. No advertising, no data brokers, no IDFA, no App Tracking Transparency
prompt.

**The decision this leaves James.** "Data Not Collected" rests on our servers keeping
nothing from the two purchase lookups. Vercel's own request logs hold the customer number
in `/api/entitlement`'s address for their short retention, and Stripe logs the
`/api/restore` lookups on its side. If James would rather be cautious, the alternative
answer is: **Purchase History, User ID and Email Address collected, linked to the user,
not used for tracking, purpose App Functionality**, and the same three entries added to
`NSPrivacyCollectedDataTypes`. The manifest and the App Store Connect answers must say the
same thing either way. Whatever is chosen, it must change before analytics, error reports
or any account arrive in the iPhone app.

## Review notes, draft

> Echo Finders plays short audio stories, called echoes, about the place you are standing
> in. Open the Map, allow location while using the app, and tap any echo to hear it.
>
> **To open every echo** for review: Settings, Skeleton key, "Got a key from us?", enter
> `<REVIEWER_CODE from Vercel>`, then "Turn the key". It works on the phone it is typed on.
>
> **In-app purchase.** Ten echoes are free; after that City Pass, Week Pass and All-Access
> are sold through in-app purchase. "Bought on our website?" in Settings only restores a
> pass already bought on echofinders.com; the app never links to a purchase outside the
> App Store.
>
> **Why background location.** In a hands free walk, which the user starts, echoes start
> as the user reaches them with the phone in a pocket and the screen off. Always is asked
> for only when the user first starts a hands free walk, after our own explanation, never
> at launch. Declined, the walk works with the app on screen.
>
> **Location is not collected.** It is processed on the phone and never sent.
>
> **Driving.** Above about 25 km/h the screen locks while echoes keep playing; a
> passenger can unlock it for the trip.
>
> **Background audio** is the narration continuing with the screen locked.

The reviewer's code is `REVIEWER_CODE` (Vercel, Production, sensitive; `DEPLOY.md`). Never
write it into this repository. Retire it once the app is approved.
