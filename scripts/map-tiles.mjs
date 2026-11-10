/**
 * Cut the map's features into vector tiles: `node scripts/map-tiles.mjs <work dir> <out dir>`.
 *
 * Called by `build-map.py`, which fetches the features from Overture and packs these tiles
 * into one PMTiles file. Only the tiles over an echo area are written: the map is for the
 * places the app sends people, and a tile over nowhere would be bytes nobody fetches.
 *
 * geojson-vt simplifies and clips each layer per zoom (the same library MapLibre uses for
 * GeoJSON), and vt-pbf writes Mapbox Vector Tiles, version 2.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import geojsonvt from "geojson-vt";
import vtpbf from "vt-pbf";
import { feature, mesh } from "topojson-client";

const write = (out, z, x, y, tile) => {
  fs.mkdirSync(path.join(out, String(z), String(x)), { recursive: true });
  fs.writeFileSync(path.join(out, String(z), String(x), `${y}.mvt`), vtpbf.fromGeojsonVt(tile, { version: 2 }));
};

const tileX = (lng, z) => Math.floor(((lng + 180) / 360) * 2 ** z);
const tileY = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

/*
 * `--world <out dir> <work dir>`: the outline of everywhere, so the map is never an empty field.
 *
 * Land, coastlines, country borders and US state lines from Natural Earth (public domain, via
 * the `world-atlas` and `us-atlas` packages), and from the work dir `build-map.py` fills,
 * Natural Earth's main roads and towns, with Overture's towns around the echoes. Zoom 0 to 7:
 * MapLibre draws zoom 7 larger at every zoom past it, so between echo areas, and on the
 * "where the echoes are" view of the whole country, there is still land, sea, a road and a
 * town name to read. It was Esri's grey canvas that drew all of that before.
 *
 * Roads and towns go into a tile only from the zoom Natural Earth gives them (`min_zoom`),
 * less one: zoom 2 does not need every village in the world.
 */
if (process.argv[2] === "--world") {
  const out = process.argv[3];
  const work = process.argv[4];
  const require = createRequire(import.meta.url);
  const land = require("world-atlas/land-10m.json");
  const countries = require("world-atlas/countries-10m.json");
  const states = require("us-atlas/states-10m.json");
  const borders = (topo, key, kind) => ({
    type: "Feature",
    properties: { kind },
    geometry: mesh(topo, topo.objects[key], (a, b) => a !== b),
  });
  /*
   * Rings that cross the 180th meridian jump from +180 to -180 between two points, which a
   * tiler reads as a line straight back across the whole world: Chukotka drew a solid band
   * of land across Canada. Unwrapped, each ring runs on past 180 and geojson-vt folds the
   * overhang back onto the other side, as it is built to.
   */
  const unwrap = (ring) => {
    let shift = 0;
    return ring.map(([lng, lat], i) => {
      if (i > 0) {
        const prev = ring[i - 1][0];
        if (lng - prev > 180) shift -= 360;
        else if (prev - lng > 180) shift += 360;
      }
      return [lng + shift, lat];
    });
  };
  const earth = feature(land, land.objects.land);
  for (const f of earth.features) {
    const g = f.geometry;
    if (g.type === "Polygon") g.coordinates = g.coordinates.map(unwrap);
    if (g.type === "MultiPolygon") g.coordinates = g.coordinates.map((p) => p.map(unwrap));
  }
  // The shore as a line of its own, so it can be drawn: the edge of land that borders nothing.
  const shore = mesh(land, land.objects.land, (a, b) => a === b);
  shore.coordinates = shore.coordinates.map(unwrap);
  const opts = { maxZoom: 7, indexMaxZoom: 7, buffer: 64, tolerance: 2 };
  const world = {
    earth: geojsonvt(earth, opts),
    coastline: geojsonvt({ type: "Feature", properties: { kind: "coastline" }, geometry: shore }, opts),
    boundaries: geojsonvt(
      { type: "FeatureCollection", features: [borders(countries, "countries", "country"), borders(states, "states", "region")] },
      opts,
    ),
  };
  // Roads and towns, one index per zoom, each holding what that zoom shows.
  const byZoom = {};
  for (const layer of ["roads", "places"]) {
    const data = readJson(path.join(work, `world-${layer}.geojson`));
    byZoom[layer] = [];
    for (let z = 0; z <= 7; z++) {
      const features = data.features.filter((f) => (f.properties.min_zoom ?? 0) < z + 1 || z === 7);
      byZoom[layer][z] = geojsonvt({ type: "FeatureCollection", features }, { ...opts, maxZoom: z, indexMaxZoom: z });
    }
  }
  let n = 0;
  for (let z = 0; z <= 7; z++) {
    for (let x = 0; x < 2 ** z; x++) {
      for (let y = 0; y < 2 ** z; y++) {
        const tile = {};
        for (const [layer, index] of Object.entries(world)) {
          const t = index.getTile(z, x, y);
          if (t && t.features.length) tile[layer] = t;
        }
        for (const [layer, indexes] of Object.entries(byZoom)) {
          const t = indexes[z].getTile(z, x, y);
          if (t && t.features.length) tile[layer] = t;
        }
        if (!Object.keys(tile).length) continue;
        write(out, z, x, y, tile);
        n++;
      }
    }
  }
  console.error(`world tiles: ${n}`);
  process.exit(0);
}

/*
 * `--coast <work dir> <out dir>`: the real shoreline around the echoes, zoom 8 to 12.
 *
 * Natural Earth's land is drawn at about a kilometre, which is right for a continent and
 * wrong for a beach: it has no barrier islands, so every echo on Wrightsville Beach stood in
 * the sea (James, 2026-11-10: "some of these are in the water"). This is Overture's land
 * (OpenStreetMap's coastline, islands included) around every echo area, drawn over Natural
 * Earth's from zoom 8, where the difference starts to show.
 *
 * Overture cuts the land into one-degree squares, so the outline of a square is not a coast:
 * an edge that runs straight along a whole degree is left out of `coastline`.
 */
if (process.argv[2] === "--coast") {
  const [work, out] = process.argv.slice(3);
  const { boxes, minZoom, maxZoom } = readJson(path.join(work, "coast-boxes.json"));
  const land = readJson(path.join(work, "coast.geojson"));
  const onGrid = (v) => Math.abs(v - Math.round(v)) < 0.002;
  const cut = (a, b) => (a[0] === b[0] && onGrid(a[0])) || (a[1] === b[1] && onGrid(a[1]));
  const lines = [];
  for (const f of land.features) {
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const ring of polys.flat()) {
      let run = [ring[0]];
      for (let i = 1; i < ring.length; i++) {
        if (cut(ring[i - 1], ring[i])) {
          if (run.length > 1) lines.push(run);
          run = [ring[i]];
        } else run.push(ring[i]);
      }
      if (run.length > 1) lines.push(run);
    }
  }
  const opts = { maxZoom, indexMaxZoom: maxZoom, extent: 4096, buffer: 64, tolerance: 3 };
  const index = {
    earth: geojsonvt(land, opts),
    coastline: geojsonvt(
      { type: "Feature", properties: { kind: "coastline" }, geometry: { type: "MultiLineString", coordinates: lines } },
      opts,
    ),
  };
  let n = 0;
  for (let z = minZoom; z <= maxZoom; z++) {
    const seen = new Set();
    for (const [w, s, e, nn] of boxes) {
      for (let x = tileX(w, z); x <= tileX(e, z); x++) {
        for (let y = tileY(nn, z); y <= tileY(s, z); y++) {
          const key = `${x}/${y}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const tile = {};
          for (const [layer, ix] of Object.entries(index)) {
            const t = ix.getTile(z, x, y);
            if (t && t.features.length) tile[layer] = t;
          }
          if (!Object.keys(tile).length) continue;
          write(out, z, x, y, tile);
          n++;
        }
      }
    }
  }
  console.error(`coast tiles: ${n}`);
  process.exit(0);
}

const [work, out] = process.argv.slice(2);
const { boxes, minZoom, maxZoom, layers } = JSON.parse(fs.readFileSync(path.join(work, "boxes.json"), "utf8"));

/*
 * What each layer starts at. Zoomed out over a city the map shows its main roads, water and
 * parks; buildings and landmarks arrive when you are close enough to see them, which keeps
 * the zoomed-out tiles small (the style hides them below these zooms anyway).
 */
const FROM = { roads: minZoom, water: minZoom, landcover: 9, landuse: 10, buildings: 13, pois: 14 };
const MAIN = new Set(["highway", "major_road", "rail"]);
const MAIN_UNTIL = 12;

const index = {};
const opts = { maxZoom, indexMaxZoom: maxZoom, extent: 4096, buffer: 64, tolerance: 3 };
for (const layer of layers) {
  const data = JSON.parse(fs.readFileSync(path.join(work, `${layer}.geojson`), "utf8"));
  index[layer] = geojsonvt(data, opts);
  if (layer === "roads") {
    data.features = data.features.filter((f) => MAIN.has(f.properties.kind));
    index.mainRoads = geojsonvt(data, opts);
  }
}

let written = 0;
for (let z = minZoom; z <= maxZoom; z++) {
  const seen = new Set();
  for (const [w, s, e, n] of boxes) {
    for (let x = tileX(w, z); x <= tileX(e, z); x++) {
      for (let y = tileY(n, z); y <= tileY(s, z); y++) {
        const key = `${x}/${y}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const tile = {};
        for (const layer of layers) {
          if (z < (FROM[layer] ?? minZoom)) continue;
          const t = (layer === "roads" && z < MAIN_UNTIL ? index.mainRoads : index[layer]).getTile(z, x, y);
          if (t && t.features.length) tile[layer] = t;
        }
        if (!Object.keys(tile).length) continue;
        write(out, z, x, y, tile);
        written++;
      }
    }
  }
}
console.error(`tiles: ${written}`);
