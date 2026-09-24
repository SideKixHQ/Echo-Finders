#!/usr/bin/env python3
"""
Contrast, measured rather than judged.

Reads the theme's own custom properties for both schemes, composites anything with an
alpha over the surface it actually sits on, and reports WCAG 2.1 contrast ratios. Run it
after touching a colour: 4.5:1 is the bar for body text (AA 1.4.3), 3:1 for large text and
for the non-text parts of a control (AA 1.4.11).

It found exactly one failure the first time it ran — ember on the sheet in light mode, at
4.42:1 — which is the sort of number nobody catches by looking, and the reason this is a
script and not a review step.

    python3 scripts/check-contrast.py

Touch targets, accessible names and focus visibility are not colour and are not checked
here; those are measured in the browser, because they depend on layout.
"""


import re, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
css = (ROOT / "apps/prototype/src/theme.css").read_text()

def vars_in(block):
    out = {}
    for k, v in re.findall(r'(--[\w-]+)\s*:\s*([^;]+);', block):
        out[k.strip()] = v.strip()
    return out

root = re.search(r':root\s*\{(.*?)\n\}', css, re.S).group(1)
light = re.search(r':root\[data-theme="light"\]\s*\{(.*?)\n\}', css, re.S)
DARK = vars_in(root)
LIGHT = dict(DARK); LIGHT.update(vars_in(light.group(1))) if light else None

def hexrgb(h):
    h = h.strip().lstrip("#")
    if len(h) == 3: h = "".join(c*2 for c in h)
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def resolve(val, table, depth=0):
    if depth > 6: return None
    val = val.strip()
    m = re.fullmatch(r'var\((--[\w-]+)\)', val)
    if m: return resolve(table.get(m.group(1), ""), table, depth+1)
    if val.startswith("#"): return hexrgb(val)
    m = re.fullmatch(r'rgba?\(\s*var\((--[\w-]+)\)\s*(?:,\s*([\d.]+))?\s*\)', val)
    if m:
        base = table.get(m.group(1), "")
        try: rgb = tuple(int(x) for x in base.split(","))
        except Exception: return None
        return (rgb, float(m.group(2) or 1))
    m = re.fullmatch(r'rgba?\(([\d\s,.]+)\)', val)
    if m:
        parts = [float(x) for x in m.group(1).split(",")]
        if len(parts) == 3: return tuple(int(p) for p in parts)
        return (tuple(int(p) for p in parts[:3]), parts[3])
    return None

def flatten(fg, bg):
    """Composite fg (maybe (rgb, alpha)) over bg."""
    if isinstance(fg, tuple) and len(fg) == 2 and isinstance(fg[0], tuple):
        rgb, a = fg
        return tuple(round(rgb[i]*a + bg[i]*(1-a)) for i in range(3))
    return fg

def lum(rgb):
    def f(c):
        c /= 255
        return c/12.92 if c <= 0.03928 else ((c+0.055)/1.055) ** 2.4
    r, g, b = (f(x) for x in rgb)
    return 0.2126*r + 0.7152*g + 0.0722*b

def ratio(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)

# Foregrounds that carry text, and the surface each sits on.
CHECKS = [
    ("body text",        "--white",  "--space"),
    ("muted text",       "--muted",  "--space"),
    ("cool text",        "--cool",   "--space"),
    ("muted on sheet",   "--muted",  "--slate"),
    ("cool on sheet",    "--cool",   "--slate"),
    ("white on sheet",   "--white",  "--slate"),
    ("aqua on space",    "--aqua",   "--space"),
    ("aqua on sheet",    "--aqua",   "--slate"),
    ("ember on sheet",   "--ember",  "--slate"),
    ("indigo-soft/sheet","--indigo-soft", "--slate"),
]
CATS = [k for k in DARK if k.startswith("--cat-")]

def report(name, table):
    print(f"\n===== {name} =====")
    fails = []
    for label, fg, bg in CHECKS:
        f, b = resolve(f"var({fg})", table), resolve(f"var({bg})", table)
        if not f or not b: print(f"  {label:<20} ?  unresolved"); continue
        b = flatten(b, (0,0,0)); f = flatten(f, b)
        r = ratio(f, b)
        ok = "OK " if r >= 4.5 else ("lg " if r >= 3 else "FAIL")
        if r < 4.5: fails.append((label, round(r,2)))
        print(f"  {label:<20} {r:5.2f}  {ok}")
    surf = flatten(resolve("var(--slate)", table), (0,0,0))
    print(f"  -- category text on sheet ({'dark' if name=='DARK' else 'light'}) --")
    for c in sorted(CATS):
        f = resolve(f"var({c})", table)
        if not f: continue
        r = ratio(flatten(f, surf), surf)
        ok = "OK " if r >= 4.5 else ("lg " if r >= 3 else "FAIL")
        if r < 4.5: fails.append((c, round(r,2)))
        print(f"  {c:<22} {r:5.2f}  {ok}")
    return fails

f1 = report("DARK", DARK)
f2 = report("LIGHT", LIGHT)
print("\n### below 4.5:1 ###")
for n, r in f1: print(f"  dark   {n:<24} {r}")
for n, r in f2: print(f"  light  {n:<24} {r}")
