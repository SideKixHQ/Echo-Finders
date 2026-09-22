/**
 * Stand-in archive photographs, drawn rather than sourced.
 *
 * The same bargain `speech-audio.ts` makes for the voice. No plate has been cleared yet —
 * the Library of Congress and the municipal collections are unreachable from here, and a
 * photograph found on a search engine is not a photograph anybody may publish (ADR-0006) —
 * so the alternative was leaving the entire then-and-now interaction unbuilt until the
 * first licensed image landed.
 *
 * What it usefully proves is the *interaction*, which is the part nobody can judge from a
 * description: whether dragging between a century is satisfying, whether the credit stays
 * legible over a bright frame, whether the alignment guidance reads at arm's length in the
 * street. None of that depends on which building is in the picture.
 *
 * What it deliberately does not do is invent a provenance. Every plate carries the credit
 * from the content file, and the demo library's credit says plainly that it is a stand-in,
 * because a fabricated "Detroit Publishing Company, 1908" sitting in a repository is the
 * kind of thing that later gets believed.
 *
 * Both halves come from one seed, so the silhouettes broadly line up and the century's
 * worth of difference is a few taller things — which is the whole reason then-and-now is
 * worth doing, and the only property of a real pair that this has to reproduce for the
 * blend to mean anything. When the real plates arrive this file is deleted and an
 * `<img src={resolve(photo.imageKey)}>` takes its place.
 */

export type Plate = "then" | "now";

/**
 * A data URI for one drawn plate.
 *
 * Cached, and the cache is not an optimisation. Dragging the blend slider re-renders on
 * every pointer move, and building a fresh thirty-kilobyte data URI each time hands the
 * browser a *different* `src` sixty times a second — so it re-decodes the image on every
 * frame of the one gesture the whole screen exists for. Same key, same string, same image,
 * no decode: the blend is then just an opacity, which is what it should always have been.
 *
 * Bounded because it is keyed by content: a handful of plates per journey, a few dozen in
 * a session, and each entry is a string a browser would otherwise rebuild constantly.
 */
const CACHE = new Map<string, string>();

export function platePng(imageKey: string, plate: Plate): string {
  const key = `${plate}:${imageKey}`;
  const hit = CACHE.get(key);
  if (hit) return hit;

  // encodeURIComponent rather than btoa: the SVG carries non-ASCII characters and btoa
  // throws on anything above U+00FF, which is a crash in a renderer that must never crash.
  const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(plateSvg(imageKey, plate))}`;
  CACHE.set(key, uri);
  return uri;
}

// Sized to a phone held upright, not to a postcard. A 3:4 plate in a 1:1.95 frame is
// `object-fit: cover` throwing away a third of the width and leaving the composition
// stranded at the bottom of the screen — which is how the first version of this looked:
// two-thirds empty sky above a row of small buildings.
const W = 900;
const H = 1720;

function plateSvg(imageKey: string, plate: Plate): string {
  const rand = seeded(hash(imageKey));
  const then = plate === "then";

  // One skyline, drawn twice. The "now" pass keeps every silhouette and raises a few of
  // them, which is what a century actually does to a street.
  const lots = 9;
  const buildings: { x: number; w: number; thenH: number; nowH: number }[] = [];
  let x = -40;
  for (let i = 0; i < lots; i++) {
    const w = 70 + rand() * 90;
    const thenH = 620 + rand() * 480;
    // A third of the lots gain something tall; the rest are untouched, so the eye has
    // fixed points to align on. That is the entire trick: a pair where everything changed
    // is two pictures, and a pair where the kerb holds still is a century.
    const grew = rand() < 0.34;
    buildings.push({ x, w, thenH, nowH: grew ? thenH + 260 + rand() * 360 : thenH });
    x += w + 6 + rand() * 14;
  }

  // High, because the street is the part that holds still and the part somebody is
  // standing in. Sky is what a bad composition gives you a lot of.
  const ground = H * 0.82;
  const sky = then ? ["#cbb894", "#9d8a68"] : ["#7d97b2", "#4d6478"];
  const stone = then ? "#6b5c44" : "#3f4b58";
  const face = then ? "#4a3f2e" : "#2b333c";

  const skyline = buildings
    .map((b) => {
      const h = then ? b.thenH : b.nowH;
      const top = ground - h;
      const glass = !then && b.nowH > b.thenH;
      const windows = windowGrid(b.x, top, b.w, h, then, glass);
      return `<rect x="${r(b.x)}" y="${r(top)}" width="${r(b.w)}" height="${r(h + 4)}" fill="${
        glass ? "#4a5d70" : stone
      }"/>${windows}`;
    })
    .join("");

  // Grain, so the two plates do not read as the same flat illustration in two palettes.
  const grain = `<filter id="g"><feTurbulence type="fractalNoise" baseFrequency="${
    then ? 0.9 : 0.55
  }" numOctaves="3"/><feColorMatrix type="saturate" values="0"/></filter>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/>
  </linearGradient>
  <radialGradient id="vig" cx="0.5" cy="0.45" r="0.78">
    <stop offset="0.55" stop-color="#000" stop-opacity="0"/>
    <stop offset="1" stop-color="#000" stop-opacity="${then ? 0.55 : 0.3}"/>
  </radialGradient>
  ${grain}
</defs>
<rect width="${W}" height="${H}" fill="url(#sky)"/>
${skyline}
<rect x="0" y="${r(ground)}" width="${W}" height="${r(H - ground)}" fill="${face}"/>
<rect x="0" y="${r(ground)}" width="${W}" height="8" fill="#000" opacity="0.3"/>
${street(ground, then)}
${figures(rand, ground, then)}
<rect width="${W}" height="${H}" filter="url(#g)" opacity="${then ? 0.2 : 0.08}"/>
<rect width="${W}" height="${H}" fill="url(#vig)"/>
${then ? `<rect width="${W}" height="${H}" fill="#7a5a2a" opacity="0.22"/>` : ""}
</svg>`;
}

/** Lit windows read as a photograph; an empty rectangle reads as a wireframe. */
function windowGrid(x: number, top: number, w: number, h: number, then: boolean, glass: boolean) {
  const cols = Math.max(1, Math.floor(w / 26));
  const rows = Math.max(1, Math.floor(h / 34));
  const out: string[] = [];
  for (let c = 0; c < cols; c++) {
    for (let rw = 0; rw < rows; rw++) {
      const wx = x + 10 + c * ((w - 14) / cols);
      const wy = top + 16 + rw * ((h - 20) / rows);
      if (wy > top + h - 22) continue;
      out.push(
        `<rect x="${r(wx)}" y="${r(wy)}" width="${r(Math.max(4, (w - 14) / cols - 8))}" height="14" fill="${
          glass ? "#8fb0c8" : then ? "#3e3628" : "#2c343d"
        }" opacity="${glass ? 0.5 : 0.55}"/>`,
      );
    }
  }
  return out.join("");
}

/**
 * The road itself.
 *
 * Lane markings are the giveaway that costs nothing: painted lines are a motor-age
 * invention, so their absence dates the plate as surely as the skyline does, and their
 * presence in the same place tells you the road did not move. Which is the point — the
 * thing that holds still is what makes the pair legible.
 */
function street(ground: number, then: boolean) {
  const kerb = `<rect x="0" y="${r(ground + 44)}" width="${W}" height="4" fill="#000" opacity="0.18"/>`;
  if (then) return kerb;
  const dashes = Array.from({ length: 7 }, (_, i) =>
    `<rect x="${r(60 + i * 128)}" y="${r(ground + 150)}" width="66" height="9" rx="4" fill="#cfd6de" opacity="0.5"/>`,
  ).join("");
  return `${kerb}${dashes}`;
}

/** Two or three people at the kerb, for scale. A street with nobody in it reads as a model. */
function figures(rand: () => number, ground: number, then: boolean) {
  const n = 2 + Math.floor(rand() * 3);
  const ink = then ? "#3a3225" : "#222a33";
  let out = "";
  for (let i = 0; i < n; i++) {
    const fx = 90 + rand() * (W - 180);
    const fh = 78 + rand() * 34;
    out += `<g fill="${ink}" opacity="0.72"><rect x="${r(fx)}" y="${r(ground - fh)}" width="${r(
      fh * 0.3,
    )}" height="${r(fh)}" rx="${r(fh * 0.14)}"/><circle cx="${r(fx + fh * 0.15)}" cy="${r(
      ground - fh - fh * 0.14,
    )}" r="${r(fh * 0.15)}"/></g>`;
  }
  return out;
}

const r = (n: number) => Math.round(n * 10) / 10;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, and the same sequence every time for a given key. */
function seeded(seed: number): () => number {
  let a = seed || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
