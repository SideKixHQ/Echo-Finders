#!/usr/bin/env node
/**
 * Which approved echoes stand in the water: `node scripts/check-land.mjs`.
 *
 * James (2026-11-10), on the zoomed-out map: "some of these are in the water". Most were the
 * map's fault: Natural Earth's land has no barrier islands, so the whole of Wrightsville
 * Beach was sea. The map now draws the real shore around the echoes (`coast.pmtiles`,
 * `build-map.py --world`), and this checks every approved echo against the same data the map
 * draws, so a pin that still lands in the water is a position to look at, not a map to blame.
 *
 * An echo is in the water when it is off the land in `coast.pmtiles` (OpenStreetMap's
 * coastline, islands included), or inside a water polygon in the street map
 * (`map/echoes`: rivers, lakes, harbours, which the coastline does not cut out of the land).
 * Where the coast file has no tile, the coarse world land (`world.pmtiles`) is used instead,
 * and the result says so.
 *
 * Some echoes are meant to be on the water: a pier, a wreck, a fort on a shoal, a ship. They
 * are listed apart, so they can be told from a slip of the coordinates, and never moved.
 *
 * It only reports. Not part of `content:validate`: the answer depends on map files a new
 * city has to build first (ADR-0019), and a listening spot on a pier is correct. `--json`
 * prints the list for a script.
 */

import { readdir, readFile, open } from "node:fs/promises";
import { join, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import { PMTiles } from "pmtiles";

const ROOT = new URL("..", import.meta.url).pathname;
const MAP = join(ROOT, "apps", "prototype", "public", "map");
const ECHO_DIR = join(ROOT, "content", "echoes");

/** Words in an echo's place or title that mean it is meant to be on the water. */
const AFLOAT =
  /\b(pier|wharf|dock|jetty|boardwalk|wreck|shipwreck|ship|boat|ferry|battleship|uss|fort|island|lighthouse|bridge|marina|river ?walk|harbou?r|bay|sound|channel|inlet|lake|pond|canal|aboard|afloat|offshore|shoal)\b/i;

/** A local file as a PMTiles source. */
class FileSource {
  constructor(path) {
    this.path = path;
    this.file = open(path, "r");
  }
  getKey() {
    return this.path;
  }
  async getBytes(offset, length) {
    const fh = await this.file;
    const buf = Buffer.alloc(length);
    const { bytesRead } = await fh.read(buf, 0, length, offset);
    const data = buf.subarray(0, bytesRead);
    return { data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) };
  }
}

/*
 * The smallest Mapbox Vector Tile reader that answers "which polygons is this point in":
 * layers by name, features with their `kind` and their rings. Written here rather than
 * borrowed from MapLibre's dependencies, so the check does not break when those move.
 */
function readVarint(buf, pos) {
  let result = 0;
  let shift = 0;
  let b;
  do {
    b = buf[pos.i++];
    result += (b & 0x7f) * 2 ** shift;
    shift += 7;
  } while (b & 0x80);
  return result;
}

function fields(buf, start = 0, end = buf.length) {
  const out = [];
  const pos = { i: start };
  while (pos.i < end) {
    const key = readVarint(buf, pos);
    const field = Math.floor(key / 8);
    const type = key & 7;
    if (type === 0) out.push([field, readVarint(buf, pos)]);
    else if (type === 2) {
      const len = readVarint(buf, pos);
      out.push([field, buf.subarray(pos.i, pos.i + len)]);
      pos.i += len;
    } else if (type === 5) {
      out.push([field, buf.subarray(pos.i, pos.i + 4)]);
      pos.i += 4;
    } else if (type === 1) {
      out.push([field, buf.subarray(pos.i, pos.i + 8)]);
      pos.i += 8;
    } else throw new Error(`tile: wire type ${type}`);
  }
  return out;
}

const packed = (buf) => {
  const out = [];
  const pos = { i: 0 };
  while (pos.i < buf.length) out.push(readVarint(buf, pos));
  return out;
};
const zigzag = (n) => (n % 2 ? -(n + 1) / 2 : n / 2);

function stringValue(buf) {
  for (const [f, v] of fields(buf)) if (f === 1) return Buffer.from(v).toString("utf8");
  return null;
}

/** { layerName: { extent, polygons: [{ kind, rings }] } } */
function decodeTile(bytes) {
  const layers = {};
  for (const [f, layerBuf] of fields(bytes)) {
    if (f !== 3) continue;
    let name = "";
    let extent = 4096;
    const keys = [];
    const values = [];
    const feats = [];
    for (const [lf, v] of fields(layerBuf)) {
      if (lf === 1) name = Buffer.from(v).toString("utf8");
      else if (lf === 2) feats.push(v);
      else if (lf === 3) keys.push(Buffer.from(v).toString("utf8"));
      else if (lf === 4) values.push(stringValue(v));
      else if (lf === 5) extent = v;
    }
    const polygons = [];
    for (const featBuf of feats) {
      let type = 0;
      let tags = [];
      let geom = [];
      for (const [ff, v] of fields(featBuf)) {
        if (ff === 2) tags = packed(v);
        else if (ff === 3) type = v;
        else if (ff === 4) geom = packed(v);
      }
      if (type !== 3) continue;
      let kind = null;
      for (let i = 0; i < tags.length; i += 2) if (keys[tags[i]] === "kind") kind = values[tags[i + 1]];
      const rings = [];
      let x = 0;
      let y = 0;
      let ring = null;
      for (let i = 0; i < geom.length; ) {
        const cmd = geom[i] & 7;
        const count = geom[i] >> 3;
        i++;
        if (cmd === 7) {
          if (ring) rings.push(ring);
          ring = null;
          continue;
        }
        for (let c = 0; c < count; c++) {
          x += zigzag(geom[i++]);
          y += zigzag(geom[i++]);
          if (cmd === 1) {
            if (ring) rings.push(ring);
            ring = [[x, y]];
          } else ring.push([x, y]);
        }
      }
      if (ring) rings.push(ring);
      polygons.push({ kind, rings });
    }
    layers[name] = { extent, polygons };
  }
  return layers;
}

/** Even-odd within one feature: inside its outer ring and not in one of its holes. */
function inside(rings, px, py) {
  let hit = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
}

/** The distance from a point to the nearest edge of any of these features, in tile units. */
function edgeDistance(polygons, px, py) {
  let best = Infinity;
  for (const { rings } of polygons) {
    for (const ring of rings) {
      for (let i = 1; i < ring.length; i++) {
        const [ax, ay] = ring[i - 1];
        const [bx, by] = ring[i];
        const dx = bx - ax;
        const dy = by - ay;
        const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
        best = Math.min(best, Math.hypot(px - ax - t * dx, py - ay - t * dy));
      }
    }
  }
  return best;
}

/** Metres in one tile unit at this latitude and zoom. */
const metresPerUnit = (lat, z, extent) => (40075016.686 * Math.cos((lat * Math.PI) / 180)) / 2 ** z / extent;

const tileOf = (lat, lng, z) => {
  const n = 2 ** z;
  const x = ((lng + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  return { x: Math.floor(x), y: Math.floor(y), fx: x - Math.floor(x), fy: y - Math.floor(y) };
};

const archives = new Map();
const archive = (path) => {
  if (!archives.has(path)) archives.set(path, new PMTiles(new FileSource(path)));
  return archives.get(path);
};

async function layerAt(path, z, lat, lng, layer) {
  const t = tileOf(lat, lng, z);
  const res = await archive(path).getZxy(z, t.x, t.y);
  if (!res?.data) return null;
  const l = decodeTile(new Uint8Array(res.data))[layer];
  if (!l) return { polygons: [], px: 0, py: 0, m: 0 };
  return { polygons: l.polygons, px: t.fx * l.extent, py: t.fy * l.extent, m: metresPerUnit(lat, z, l.extent) };
}

/** Land, water or unknown at a point, and what decided it. */
async function where(lat, lng, squares) {
  let source = "coast";
  let land = await layerAt(join(MAP, "coast.pmtiles"), 12, lat, lng, "earth");
  if (!land) {
    source = "world (coarse)";
    land = await layerAt(join(MAP, "world.pmtiles"), 7, lat, lng, "earth");
  }
  const onLand = !!land && land.polygons.some((p) => inside(p.rings, land.px, land.py));
  // Rivers, lakes and harbours are cut out of the land only in the street map.
  const sq = tileOf(lat, lng, 8);
  const name = `8-${sq.x}-${sq.y}`;
  let water = null;
  if (squares.has(name)) {
    const w = await layerAt(join(MAP, "echoes", `${name}.pmtiles`), 15, lat, lng, "water");
    const hit = w?.polygons.find((p) => inside(p.rings, w.px, w.py));
    if (hit) water = { kind: hit.kind ?? "water", shoreM: Math.round(edgeDistance([hit], w.px, w.py) * w.m) };
  }
  if (!land) return { status: "unknown", source };
  // How far out: a few metres is a pin on the sea wall, a few hundred is the wrong place.
  if (!onLand) return { status: "water", source, water: "sea", shoreM: Math.round(edgeDistance(land.polygons, land.px, land.py) * land.m) };
  if (water) return { status: "water", source: "street map", water: water.kind, shoreM: water.shoreM };
  return { status: "land", source };
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (/\.ya?ml$/.test(entry.name)) yield path;
  }
}

const index = JSON.parse(await readFile(join(MAP, "echoes", "index.json"), "utf8"));
const squares = new Set(index.squares);
const wet = [];
let checked = 0;
for await (const path of walk(ECHO_DIR)) {
  let e;
  try {
    e = parseYaml(await readFile(path, "utf8"));
  } catch {
    continue;
  }
  if (e?.editorial !== "approved" || !e.at) continue;
  checked++;
  const found = await where(e.at.lat, e.at.lng, squares);
  if (found.status === "land") continue;
  wet.push({
    id: e.id,
    file: relative(ROOT, path),
    at: e.at,
    place: e.place ?? "",
    ...found,
    afloat: AFLOAT.test(`${e.place ?? ""} ${e.title ?? ""}`),
  });
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(wet, null, 1));
} else {
  const show = (list, heading) => {
    if (!list.length) return;
    console.log(`\n${heading} (${list.length})`);
    for (const w of list)
      console.log(`  ${w.id}  ${w.at.lat}, ${w.at.lng}  ${w.water ?? w.status}, ${w.shoreM ?? "?"} m from the shore [${w.source}]\n    ${w.place}`);
  };
  show(wet.filter((w) => w.status === "water" && !w.afloat), "In the water: check the position");
  show(wet.filter((w) => w.status === "water" && w.afloat), "In the water, and the place says it is on the water (pier, wreck, fort, ship): leave");
  show(wet.filter((w) => w.status === "unknown"), "No map data here");
  console.log(`\n${checked} approved echoes checked, ${wet.filter((w) => w.status === "water").length} in the water.`);
}
