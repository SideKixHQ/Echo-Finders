# Putting the demo somewhere you can use it

*Echo Finders is a Whatishere.com product.*

The point of this is feedback on the thing rather than on screenshots of it. Once it is
connected, every push deploys and you refresh — no commands, no rebuild, nothing to keep in
sync.

## Connecting it, once

In the Vercel dashboard:

1. **Add New… → Project**, and import `SideKixHQ/Echo-Finders`.
   (GitHub still redirects the repository's old name, so an older link will quietly work
   and quietly keep the wrong name alive. Use this one.)
2. Leave every setting alone and press **Deploy**.

That is the whole thing. `vercel.json` at the repository root already says how to build it —
install at the root because this is an npm workspace, compile the content library from
`content/`, then build the prototype — so there is nothing to configure and nothing to
remember next time.

A minute or so later you have a URL. Open it on a phone.

## Use it on a phone, not a laptop

Two of the more interesting parts only exist on a real device, and Vercel serves over HTTPS,
which is what both of them require:

- **The camera.** Tap *Then & now* on an echo that has a plate. On a laptop you get the
  drawn stand-in; on a phone you get your actual street behind a photograph, and the slider
  between them is the thing the whole screen exists for.
- **The compass.** The bearing arcs need one, and iOS will ask permission the first time —
  that is the *Use the compass* button, and it has to be a tap rather than something the
  page does on its own.

Sound matters too. The proximity cue is a real part of the design and silently missing with
the ringer off.

## What is real and what is standing in

Worth knowing before you judge it, so you spend your attention on the right things.

| | |
|---|---|
| **Real** | The engine. Capture, ranking, the queue, proximity, privacy, the corridor query — the same code an iOS build would run. |
| **Real** | The words. Every script is the real script. |
| **Simulated** | Your position. A `RouteProfile` walks the route for you, so a fifty-minute walk fits in about three minutes. |
| **Standing in** | The voice. Your browser reads the script aloud, which is flat and mistimed — the designed narrators are not rendered yet. |
| **Standing in** | The archive photographs. Drawn, and labelled as such in their own credit line. |
| **Missing** | The basemap. Tile providers are unreachable from the build environment, so the map is vector geometry on its own. |

## Two things in the URL

- `?speed=2` slows the simulation, so the twelve-second capture ring is watchable.
- `?start=0.4` drops you four-tenths of the way along, to skip to a busier stretch.

## What is most useful to hear from you

Not bugs — I can find those. The things only you can answer:

- Does arriving at an echo feel like anything?
- Is ninety seconds too long, standing on a street?
- Would you have pressed play, or walked on?
- Does the collection feel worth keeping, or like a number going up?
