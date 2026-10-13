/**
 * The world's coastlines, for phones and seatbacks that cannot run the map (no WebGL).
 *
 * The SVG fallback in `RouteMap.tsx` used to draw nothing under the route: Esri's tiles are
 * no longer drawn (ADR-0019), and a seatback has no internet to fetch them anyway. This
 * writes Natural Earth's 1:110m land (public domain, via `world-atlas`) as plain rings of
 * [lng, lat], two decimals, Antarctica left out: about 50 KB, served with the app.
 *
 *   node scripts/build-land.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { feature } from "topojson-client";

const require = createRequire(import.meta.url);
const topo = JSON.parse(readFileSync(require.resolve("world-atlas/land-110m.json"), "utf8"));
const land = feature(topo, topo.objects.land);

const rings = [];
for (const f of land.features ?? [land]) {
  const g = f.geometry;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  for (const poly of polys) {
    const outer = poly[0];
    if (outer.every(([, lat]) => lat < -60)) continue; // Antarctica
    rings.push(outer.map(([lng, lat]) => [Math.round(lng * 100) / 100, Math.round(lat * 100) / 100]));
  }
}
const out = "apps/prototype/public/map/land.json";
writeFileSync(out, JSON.stringify(rings));
console.log(`${out}: ${rings.length} rings, ${rings.reduce((n, r) => n + r.length, 0)} points`);
