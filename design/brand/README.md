# Brand assets

| File | What it is | Where it works |
|---|---|---|
| `mark.webp` | The contour mark: topographic lines, a glowing point, a figure in a doorway | Splash, marketing, anywhere it can be large |
| `mark-with-wordmark.webp` | The same with ECHO FINDERS set beneath | Stacked lockup |
| `lockup-horizontal.webp` | EF monogram + wordmark, side by side | Site headers, decks, email |
| `monogram-ripples.webp` | EF with echo ripples, on Deep Space Blue | **App icon** |
| `monogram-parens.webp` | EF in parentheses, on Deep Space Blue | Alternate icon |

All five are raster — `.webp` has no vector mode — and were AI-generated. What that costs
is narrower than it first sounds, and worth writing down accurately, because "redraw
everything as vectors" is expensive advice to follow for no reason.

**The app icon does not need to be vector.** iOS takes a single 1024×1024 PNG, opaque, no
alpha, and generates every other size itself. `monogram-ripples.webp` is 1254×1254 with no
alpha, which is already the right shape — it needs converting and downscaling, not
redrawing.

| | Alpha | Size | Fine as raster? |
|---|---|---|---|
| `monogram-ripples` | no | 1254² | **Yes** — this is what an app icon wants |
| `monogram-parens` | no | 1254² | Yes, same |
| `mark` | yes | 1254² | Yes on screen |
| `mark-with-wordmark` | yes | 1536×1024 | Yes on screen |
| `lockup-horizontal` | yes | 2000×667 | Screen yes; print or large format, no |

**Where vector actually earns its cost:**

- **Small sizes.** A favicon or a 24px nav mark is not a scaling problem, it is a *design*
  problem: five contour lines, a doorway, a figure and a radial glow cannot survive 24px
  however they are stored. That needs the simplified three-rings-and-a-point version drawn,
  and once someone is drawing it, drawing it as SVG is free.
- **Recolouring.** Single-colour, light-background and monochrome versions are routine asks
  — a partner's deck, an embroidered cap, a fax-quality PDF — and you cannot recolour a
  baked-in glow.
- **Print and large format.** 2000px wide is a comfortable screen asset and a thin banner.

**Auto-tracing will not work**, so nobody should waste an afternoon on it. The mark is built
from soft glows, radial gradients and blur, which are raster-native; a trace produces
thousands of nested paths and still loses the glow. A real vector version means redrawing,
with the glow rebuilt as SVG gradients and filters.

Worth noting what is *already* vector: the part of the brand that appears inside the product
— the contour rings on every pin, the ripples as an echo opens, the route gradient — is
hand-written SVG and scales perfectly. The raster files are used for splash and marketing
only, which is exactly where raster costs least.

## What the mark is saying

Worth writing down, because it is doing more than decoration and whoever builds the splash
screen should know what to preserve.

The contour lines are a topographic map: this is about **places**. The glowing point is an
**echo** — a single thing worth knowing, sitting somewhere specific. The figure in the
doorway is **arrival**: someone who went there, which is the whole mechanic (ADR-0010).

## The problem with the contour mark at small sizes

It is the best of the five and the one that will fail first. Five to eight nested contour
lines, a doorway, a figure, and a radial glow — at 40px, which is a map pin or a tab bar
icon, all of that becomes a blue smudge.

**Use the monogram below about 120px.** The contour mark earns its complexity on a splash
screen or a website header; it cannot survive an icon grid.

If a simplified contour mark is wanted for small use, the version to draw is **three
contour rings and the point, nothing else** — that keeps the idea and survives 40px.

## The orange

The logos introduce a warm focal point that is not in the product palette, and it is doing
real work: it is the only warm thing in a cold scheme, so the eye goes straight to it, which
is exactly right for "an echo".

**But it is not yet a UI colour, and there is a decision to make.** The app currently uses
Neon Aqua `#00FFE7` for the live, captured, active state, because that is the system's
active colour throughout. The logo says an echo is orange. Two defensible resolutions:

1. **Aqua stays the interface, orange stays the brand.** The logo is orange; the UI is aqua.
   Common and perfectly coherent — the mark is not a legend for the interface.
2. **Orange becomes the echo.** A captured echo glows warm, and the interface stays aqua for
   everything else. More striking, and it makes the icon and the product say one thing.

**Resolved: the second.** The rule the interface now follows is one line long —

> **Aqua is the interface. Ember is the echo.**

Anything the listener *operates* stays cool: the play button, the tab bar, the mode picker,
their own position on the map. Anything that *is* an echo glows warm: a captured pin, the
count of what they have found, the proximity bar as they close on one, an entry in the
collection. A control that glowed would be competing with the content for the only warm
colour on the screen, which is the one thing this palette cannot afford.

The tokens are `--ember: #FF9E12` with `--ember-core: #FFD77A` for the hot centre and
`--ember-deep: #C96A00` for an echo already heard — the ember gone cold.

The mark's other idea carried over too, and it matters more than the colour: **the contour
lines**. Every pin is three nested contours rather than a circle, drawn from one irregular
path rotated at each scale. The irregularity is the entire point — a perfect circle reads as
a target reticle, which is the wrong idea for a product about standing somewhere. The route
line carries the mark's aqua-through-violet gradient for the same reason. And while an echo
is opening, those contours ripple outward, which is the only place in the interface where
the logo is literally animated.

The gold already in the system (`--gold: #D4A856`, used for sponsored placements) stays
clearly distinct: duller and browner than the ember, and never glowing. A listener who
mistook an advert for a discovery would have been deceived by the interface itself.

## Still needed before launch

- Vector redraws (SVG) of the mark, the monogram and the wordmark.
- A **monochrome** version. App Store, print, embroidery and any partner's single-colour
  requirement all need one, and a gradient cannot supply it.
- The simplified small-size mark described above.
- Icon exports at the iOS sizes, from the vector rather than by downscaling these.
- A dark-background and a light-background variant of the horizontal lockup.
