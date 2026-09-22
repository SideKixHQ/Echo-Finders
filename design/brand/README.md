# Brand assets

| File | What it is | Where it works |
|---|---|---|
| `mark.webp` | The contour mark: topographic lines, a glowing point, a figure in a doorway | Splash, marketing, anywhere it can be large |
| `mark-with-wordmark.webp` | The same with ECHO FINDERS set beneath | Stacked lockup |
| `lockup-horizontal.webp` | EF monogram + wordmark, side by side | Site headers, decks, email |
| `monogram-ripples.webp` | EF with echo ripples, on Deep Space Blue | **App icon** |
| `monogram-parens.webp` | EF in parentheses, on Deep Space Blue | Alternate icon |

Source files are AI-generated raster. **Before launch these need redrawing as vectors** —
an app icon is rendered at a dozen sizes and a raster original will look soft at every one
of them.

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
