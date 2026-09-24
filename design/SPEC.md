# The design, measured

*Extracted from `echo-finders-phone.prototype.html` — not transcribed by eye, and not
remembered. Regenerate rather than edit: every value below is lifted verbatim out of that
file's own stylesheet.*

**Why this file exists.** The prototype is 190KB of HTML and the built app drifted from it
three separate times — a control column that was top-anchored instead of bottom-anchored,
a filter row that hid categories the design always shows, an aeroplane that shared nothing
with the design's aeroplane but the word. Each time the cause was the same: somebody,
including me, worked from a screenshot or a memory of one rather than opening the file. A
measurement you have to go and take again is a measurement that eventually gets guessed.

Where the built app departs from this deliberately, the departure belongs in a comment at
the point of departure, with its reason. Everything else should match.

## Tokens

```css
:root {
    --space:#0B0F2B;
    --indigo:#6C63FF;
    --indigo-soft:#9B95FF;
    --indigo-btn:#5147DB;
    --cool:#D8DCE5;
    --aqua:#00FFE7;
    --magenta:#FF007A;
    --charcoal:#161A1D;
    --slate:#1F252E;
    --white:#FFFFFF;
    --muted:#AEB5C2;
    --gold:#D4A856;
    --line:rgba(var(--rgb-hair),.12);
    --line-2:rgba(var(--rgb-hair),.22);
    --rgb-panel:11,15,43;
    --rgb-hair:216,220,229;
    --rgb-accent:0,255,231;
    --rgb-sheet:31,37,46;
    --ease:cubic-bezier(.4,0,.2,1);
}
```

## Categories

The design renders **every one of these, always** — `Object.entries(CATS).filter(([k]) => k !== 'ad')`. It does not narrow the row to what is nearby, on the route, or eligible. A chip that disappears takes the key with it.

```js
const CATS = {
  history:   {label:'History',      color:'#6C63FF', tc:'#9B95FF', lc:'#4C43C8', icon:'<path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6"/>'},
  culture:   {label:'Culture',      color:'#FF9E4F', lc:'#8F4D00', icon:'<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>'},
  ghost:     {label:'Ghosts',       color:'#9EF0A8', lc:'#1D7A3A', icon:'<path d="M6 21V10a6 6 0 0 1 12 0v11l-3-2-3 2-3-2-3 2z"/><path d="M10 10h.01M14 10h.01"/>'},
  crime:     {label:'Crime',        color:'#FF007A', tc:'#FF4D9D', lc:'#C1005C', icon:'<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>'},
  kids:      {label:'Kids',         color:'#00FFE7', lc:'#00736C', icon:'<circle cx="12" cy="12" r="8"/><path d="M9 10h.01M15 10h.01M8.5 14a5 5 0 0 0 7 0"/>'},
  fact:      {label:'Fun fact',     color:'#9B95FF', lc:'#5B52D6', icon:'<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>'},
  stay:      {label:'Stay',         color:'#FF87C3', lc:'#B4256F', icon:'<path d="M2 17V8M2 12h13a5 5 0 0 1 5 5v0M22 17H2"/><circle cx="7" cy="10" r="1.6"/>'},
  attraction:{label:'Attraction',   color:'#D8DCE5', lc:'#3F4A5C', icon:'<path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z"/><circle cx="12" cy="10" r="2.4"/>'},
  ad:        {label:'Sponsored',  color:'#D4A856', lc:'#7A5A15', icon:'<path d="M20.6 13.4 12 22l-9-9V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.2"/>'}
};
```

## The aeroplane

32px, **filled white**, an aqua drop-shadow, rotated to the heading, and sitting on nothing — no disc, no ring.

```html
<div class="plane" style="transform:rotate(<heading>deg)">
  <svg viewBox="0 0 24 24"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V18l-2 1.5V21l3.5-1 3.5 1v-1.5L13 18v-4.5L21 16z"/></svg>
</div>
```

## Phone and screen

```css
.phone { width:390px; height:844px; border-radius:52px; background:#000; padding:11px; box-shadow:0 0 0 2px #23262e,0 40px 90px rgba(0,0,0,.7); position:relative; flex:none }
.screen { position:relative; width:100%; height:100%; border-radius:42px; overflow:hidden; background:var(--space); display:flex; flex-direction:column }
.statusbar { position:absolute; top:0; left:0; right:0; height:54px; z-index:1150; display:flex; align-items:center; justify-content:space-between; padding:16px 28px 0; font-family:"Space Grotesk"; font-size:13px; font-weight:500; pointer-events:none; background:linear-gradient(180deg,rgba(var(--rgb-panel),.9),transparent) }
.homebar { position:absolute; bottom:7px; left:50%; transform:translateX(-50%); width:134px; height:5px; border-radius:99px; background:rgba(255,255,255,.35); z-index:900 }
```

## Header: flight pill and chips

```css
.hdr { position:absolute; top:54px; left:0; right:0; z-index:700; padding:6px 14px 0 }
.flightpill { display:flex; align-items:center; gap:10px; background:rgba(var(--rgb-panel),.92); border:1px solid var(--line); border-radius:99px; padding:9px 14px; box-shadow:0 6px 20px rgba(0,0,0,.4) }
.flightpill b { font-family:"Space Grotesk"; font-size:13px; letter-spacing:.05em }
.flightpill .bar { flex:1; height:2px; background:rgba(var(--rgb-hair),.16); border-radius:2px; position:relative }
.flightpill .bar i { position:absolute; inset:0 auto 0 0; background:var(--aqua); border-radius:2px; box-shadow:0 0 8px var(--aqua) }
.flightpill .bar u { position:absolute; top:50%; width:7px; height:7px; margin:-3.5px 0 0 -3.5px; border-radius:50%; background:#fff }
.flightpill small { font-family:"Space Grotesk"; font-size:11px; color:var(--aqua) }
.chips { display:flex; gap:3px; margin-top:9px; padding:4px; border-radius:13px; background:rgba(var(--rgb-panel),.94); border:1px solid var(--line); overflow-x:auto; scrollbar-width:none }
.chip { flex:none; display:flex; align-items:center; gap:6px; padding:6px 10px; border-radius:9px; font-size:10.5px; color:var(--muted); white-space:nowrap }
.chip.all { font-family:"Space Grotesk"; font-size:9px; letter-spacing:.13em; text-transform:uppercase; color:var(--cool); border-right:1px solid var(--line); border-radius:9px 0 0 9px; margin-right:3px; padding-right:11px }
.chip.all.on { color:var(--aqua); background:none }
.chip .dot { width:7px; height:7px; border-radius:50%; background:currentColor; opacity:.4 }
.chip.on { background:rgba(var(--rgb-hair),.08) }
.chip.on .dot { opacity:1 }
```

## Map marks

```css
.pin { width:30px; height:30px; border-radius:50%; display:grid; place-items:center; position:relative; background:rgba(var(--rgb-panel),.94); border:1.5px solid currentColor; transition:.14s var(--ease) }
.pin svg { width:14px; height:14px; stroke:currentColor; fill:none; stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round }
.pin.active { box-shadow:0 0 0 4px rgba(var(--rgb-hair),.18),0 0 18px currentColor; transform:scale(1.15) }
.pin.saved::after { content:""; position:absolute; right:-2px; bottom:-2px; width:10px; height:10px; border-radius:50%; background:var(--aqua); border:2px solid var(--space) }
.plane svg { width:32px; height:32px; fill:var(--white); filter:drop-shadow(0 0 9px rgba(var(--rgb-accent),.9)) }
```

## Control column

```css
.fabs { position:absolute; right:14px; bottom:198px; z-index:640; display:flex; flex-direction:column; gap:8px; will-change:transform; transition:transform .34s cubic-bezier(.32,.72,0,1),opacity .2s linear }
.fabs[data-h="full"] { opacity:0; pointer-events:none }
.fab { width:42px; height:42px; flex:none; transition:height .26s cubic-bezier(.32,.72,0,1),margin .26s cubic-bezier(.32,.72,0,1),opacity .18s linear; border-radius:14px; background:rgba(var(--rgb-panel),.94); border:1px solid var(--line); display:grid; place-items:center; color:var(--cool); box-shadow:0 6px 18px rgba(0,0,0,.45) }
.fab svg { width:18px; height:18px; stroke:currentColor; fill:none; stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round }
.fab.on { background:var(--aqua); color:#042220; border-color:var(--aqua) }
```

## Sheet

```css
.sheet { position:absolute; left:0; right:0; bottom:74px; z-index:800; background:var(--slate); border-radius:24px 24px 0 0; border-top:1px solid var(--line-2); box-shadow:0 -14px 40px rgba(0,0,0,.55); display:flex; flex-direction:column; transition:height .34s cubic-bezier(.32,.72,0,1); overflow-y:auto; overscroll-behavior:contain; scrollbar-width:none; overflow-anchor:none }
.grab { padding:11px 0 11px; display:grid; place-items:center; flex:none; cursor:grab; touch-action:none; position:sticky; top:0; z-index:6; background:var(--slate) }
.grab i { width:38px; height:4px; border-radius:99px; background:rgba(var(--rgb-hair),.3) }
.now { flex:none; min-height:0; padding:2px 16px 12px }
.now .row { display:flex; align-items:center; gap:12px }
```

## Mini player (sticky, on scroll)

```css
.miniwrap { position:sticky; top:26px; height:0; z-index:6; flex:none }
.mini { display:flex; align-items:center; gap:10px; height:56px; padding:0 14px; background:var(--slate); border-bottom:1px solid var(--line); opacity:0; transform:translateY(-10px); pointer-events:none; transition:opacity .18s linear,transform .24s var(--ease) }
.mini .play { width:36px; height:36px }
.mini .play svg { width:14px; height:14px }
.minitxt { flex:1; min-width:0 }
.minitxt b { display:block; font-size:12.5px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
.minitxt span { display:block; font-family:"Space Grotesk"; font-size:10px; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
.mini .savebtn { width:34px; height:34px }
```

## Now playing

```css
.play { width:46px; height:46px; flex:none; border-radius:50%; display:grid; place-items:center; background:linear-gradient(140deg,var(--indigo),#4a41d6); box-shadow:0 0 20px rgba(108,99,255,.45) }
.play svg { width:19px; height:19px; fill:#fff }
.nowtxt { flex:1; min-width:0 }
.nowtxt h5 { margin:0; font-size:13.5px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
.nowtxt p { margin:2px 0 0; font-size:10.5px; color:var(--muted); font-family:"Space Grotesk"; white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
.tag { display:inline-flex; align-items:center; gap:5px; font-size:9px; letter-spacing:.14em; text-transform:uppercase; font-family:"Space Grotesk"; font-weight:500; margin-bottom:3px }
.tag .dot { width:6px; height:6px; border-radius:50%; background:currentColor }
.savebtn { width:38px; height:38px; flex:none; border-radius:12px; border:1px solid var(--line-2); display:grid; place-items:center; color:var(--cool) }
.savebtn.on { border-color:var(--aqua); color:var(--aqua); background:rgba(var(--rgb-accent),.12) }
.savebtn svg { width:16px; height:16px; stroke:currentColor; fill:none; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round }
```

## Tabs and list

```css
.tabs { display:flex; gap:2px; padding:0 16px; border-bottom:1px solid var(--line); flex:none; background:var(--slate) }
.tabs button { flex:1; padding:10px 0; font-size:11px; color:var(--muted); border-bottom:2px solid transparent }
.tabs button.on { color:var(--white); border-color:var(--aqua) }
.tabs .count { margin-left:5px; padding:1px 6px; border-radius:99px; background:rgba(var(--rgb-accent),.16); color:var(--aqua); font-size:9.5px; font-family:"Space Grotesk" }
.list { flex:none; padding:12px 14px 16px; display:flex; flex-direction:column; gap:9px }
.sectlabel { flex:0 0 auto; font-size:9px; letter-spacing:.2em; text-transform:uppercase; color:var(--muted); margin:4px 2px 0 }
```

## Card

```css
.card { flex:0 0 auto; background:rgba(var(--rgb-panel),.55); border:1px solid var(--line); border-radius:14px; padding:12px 13px; transition:.14s var(--ease); position:relative }
.card .top { display:flex; align-items:center; gap:8px; margin-bottom:6px }
.dur { margin-left:auto; font-size:10px; color:var(--muted); font-family:"Space Grotesk" }
.card h4 { margin:0 0 4px; font-size:13.5px; font-weight:500; line-height:1.35; letter-spacing:-.01em }
.card p { margin:0; font-size:11px; line-height:1.5; color:var(--muted) }
.place { margin-top:8px; display:flex; align-items:center; gap:5px; font-size:10px; color:var(--muted); font-family:"Space Grotesk" }
.acts { display:flex; gap:6px; margin-top:10px }
.act { display:flex; align-items:center; gap:5px; padding:7px 11px; border-radius:99px; font-size:11px; border:1px solid var(--line-2); color:var(--cool) }
.act.pri { background:var(--indigo-btn); border-color:var(--indigo-btn); color:#fff }
.act.on { background:rgba(var(--rgb-accent),.14); border-color:var(--aqua); color:var(--aqua) }
.act svg { width:13px; height:13px; stroke:currentColor; fill:none; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round }
```

## Tab bar

```css
.nav { position:absolute; bottom:0; left:0; right:0; z-index:850; height:74px; display:flex; background:rgba(var(--rgb-panel),.96); border-top:1px solid var(--line); padding-bottom:14px }
.nav button { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; font-size:9.5px; color:var(--muted); letter-spacing:.03em }
.nav button svg { width:20px; height:20px; stroke:currentColor; fill:none; stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round }
.nav button.on { color:var(--aqua) }
```

## How the control column handles a rising sheet

It does not wrap and it does not scroll. Two buttons collapse to nothing at the middle detent, and the whole column fades at full:

```css
.fabs[data-h="mid"] #dlBtn,.fabs[data-h="mid"] #spdBtn{opacity:0;height:0;margin-top:-8px;
  border-width:0;pointer-events:none;overflow:hidden}
.fabs[data-h="full"] { opacity:0; pointer-events:none }
```
