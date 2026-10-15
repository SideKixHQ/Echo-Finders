#!/usr/bin/env python3
"""
`apps/prototype/public/map/echoes/`: the map itself, around every echo.

Streets with their names, buildings, water, parks and landmarks, in files the app serves
from Vercel with everything else (`DEPLOY.md`, The map). No map service, no account and no
per-view bill: the file is built here, once, from open data, and a phone fetches only the
few hundred kilobytes of it around where it is looking.

James (2026-10-12): "the map is just not detailed … its hard to see streets and names and
buildings". The live app was still drawing Esri's grey canvas, darkened into the navy,
because the US-wide file planned for Cloudflare R2 was never uploaded, and he did not want
another service to run or pay for. This is the same idea without the extra host: the map
only where there are echoes, since that is the only place the app sends anybody.

Source: Overture Maps (OpenStreetMap-derived, ODbL), read straight from Overture's public
S3 bucket, the same way `build-streets.py` reads the walking network, and grouped into the
same areas (echoes within 1.5 km of each other), padded further so the map runs on past
the edge of a walk.

Layers are written in the Protomaps basemap schema (`roads`, `buildings`, `water`,
`landuse`, `landcover`, `pois`), which is what `basemap-style.ts` draws, so the app cannot
tell this file from a Protomaps one.

ONE FILE PER SQUARE, NOT ONE FILE. It was a single `echoes.pmtiles`, and six cities took it
to 46 MB, on its way past GitHub's 100 MB limit for a file, with every rebuild adding a whole
new copy to the repository's history. Now every tile goes into the file for the zoom-8 square
it falls in (about 150 km across, so a city is one or two files), named `8-<x>-<y>.pmtiles`,
with `index.json` listing them. Tiles are written with no timestamps and in a fixed order,
so a square nothing changed in builds to the same bytes and git records nothing: adding a
city adds that city's file. The app asks for each tile from its square's file
(`echo-map.ts`).

Run: `pip install pyarrow pmtiles` then `python3 scripts/build-map.py`. A few minutes: it
reads only the parquet row groups that overlap an area. A new place needs it run again,
the same as `build-streets.py`. `--reshard` re-cuts an existing single `echoes.pmtiles`
into squares without fetching anything.
"""

import concurrent.futures as cf
import gzip
import importlib.util
import json
import math
import os
import shutil
import struct
import subprocess
import sys
import tempfile

import pyarrow.parquet as pq
from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import Writer

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
MAP_DIR = os.path.join(ROOT, "apps", "prototype", "public", "map")
OUT = os.path.join(MAP_DIR, "echoes")
# The old single file, removed once its tiles are in squares.
LEGACY = os.path.join(MAP_DIR, "echoes.pmtiles")
# The zoom of the squares the map is cut into. Equal to MIN_ZOOM, so every tile has one.
SHARD_ZOOM = 8
WORLD = os.path.join(MAP_DIR, "world.pmtiles")

# The Overture reader and the areas are the walking network's, so the two always agree.
_spec = importlib.util.spec_from_file_location("streets", os.path.join(HERE, "build-streets.py"))
streets = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(streets)

# Beyond the walking network's own 1.2 km: the map should not stop where the routes do.
MAP_PAD_KM = 1.0
MIN_ZOOM, MAX_ZOOM = 8, 15

MAJOR = {"primary", "secondary", "tertiary", "trunk"}
MINOR = {"residential", "unclassified", "living_street", "unknown", "service"}
# Pavements and crossings are their own lines in OpenStreetMap. Drawn, they double every
# street; the router still has them (`build-streets.py`).
HIDDEN_SUBCLASS = {"sidewalk", "crosswalk"}
WILD = {"forest": "forest", "wood": "wood", "scrub": "scrub", "shrub": "scrub", "grass": "grassland", "meadow": "grassland", "wetland": "wetland", "marsh": "wetland"}
# Landmarks: what you can see from the pavement and give directions by. Not every café.
LANDMARK = (
    "museum", "monument", "memorial", "historic", "landmark", "church", "cathedral", "chapel",
    "synagogue", "mosque", "temple", "place_of_worship", "library", "park", "garden", "plaza",
    "square", "theatre", "theater", "cinema", "stadium", "arena", "university", "college",
    "school", "hospital", "city_hall", "town_hall", "courthouse", "government", "post_office",
    "police", "fire_station", "station", "train_station", "subway", "ferry", "bus_station",
    "lighthouse", "bridge", "fort", "castle", "cemetery", "zoo", "aquarium", "gallery",
    "hotel", "market", "pier", "beach", "visitor", "tourist", "attraction",
)


def wkb(blob):
    """Overture geometry (WKB, 2D) as a GeoJSON geometry, or None."""
    o = 0

    def read(fmt):
        nonlocal o
        v = struct.unpack_from(order + fmt, blob, o)
        o += struct.calcsize(fmt)
        return v

    def geom():
        nonlocal order
        order = "<" if blob[o] == 1 else ">"
        read_byte()
        (t,) = read("I")
        t %= 1000
        if t == 1:
            return {"type": "Point", "coordinates": list(read("dd"))}
        if t == 2:
            (n,) = read("I")
            return {"type": "LineString", "coordinates": [list(read("dd")) for _ in range(n)]}
        if t == 3:
            (rings,) = read("I")
            out = []
            for _ in range(rings):
                (n,) = read("I")
                out.append([list(read("dd")) for _ in range(n)])
            return {"type": "Polygon", "coordinates": out}
        if t in (4, 5, 6):
            (n,) = read("I")
            parts = [geom() for _ in range(n)]
            return {"type": {4: "MultiPoint", 5: "MultiLineString", 6: "MultiPolygon"}[t], "coordinates": [p["coordinates"] for p in parts]}
        return None

    def read_byte():
        nonlocal o
        o += 1

    order = "<"
    try:
        return geom()
    except struct.error:
        return None


def flagged(rules, flag):
    """A road flag that holds along the whole segment, not just part of it."""
    return any(flag in (r.get("values") or []) and not r.get("between") for r in rules or [])


def tunnel_spans(rules):
    """The stretches of a segment, as fractions of its length, that run underground."""
    return sorted(
        tuple(r["between"]) for r in rules or [] if "is_tunnel" in (r.get("values") or []) and r.get("between")
    )


def split_tunnels(row, props, geometry):
    """
    One feature per stretch, the underground ones marked `is_tunnel`.

    Overture flags a tunnel along part of a segment, not the whole of it: the
    Brooklyn-Battery Tunnel is one segment from 6% to 97% of its length. Drawn whole, it ran
    as a solid motorway across the harbour.
    """
    spans = tunnel_spans(row.get("road_flags"))
    if not spans or geometry["type"] != "LineString":
        return [(props, geometry)]
    coords = geometry["coordinates"]
    out, at = [], 0.0
    for a, b in spans:
        if a > at:
            out.append((props, streets.substring(coords, at, a)))
        out.append(({**props, "is_tunnel": True}, streets.substring(coords, a, b)))
        at = b
    if at < 1:
        out.append((props, streets.substring(coords, at, 1.0)))
    return [(p, {"type": "LineString", "coordinates": [list(c) for c in line]}) for p, line in out if len(line) > 1]


def name_of(row):
    return ((row.get("names") or {}).get("primary")) or None


def road(row):
    if row["subtype"] == "rail":
        return {"kind": "rail"}
    if row["subtype"] != "road" or row.get("subclass") in HIDDEN_SUBCLASS:
        return None
    c = row["class"] or "unknown"
    kind = "highway" if c == "motorway" else "major_road" if c in MAJOR else "minor_road" if c in MINOR else "path"
    props = {"kind": kind, "kind_detail": c}
    if name_of(row):
        props["name"] = name_of(row)
    if flagged(row.get("road_flags"), "is_tunnel"):
        props["is_tunnel"] = True
    if flagged(row.get("road_flags"), "is_bridge"):
        props["is_bridge"] = True
    return props


def building(row):
    if row.get("is_underground"):
        return None
    props = {"kind": "building"}
    if row.get("height"):
        props["height"] = round(row["height"], 1)
    return props


def water(row):
    return {"kind": row.get("subtype") or row.get("class") or "water"}


def land_use(row):
    return {"kind": row.get("class") or row.get("subtype") or "other"}


def land(row):
    k = WILD.get(row.get("class") or "") or WILD.get(row.get("subtype") or "")
    return {"kind": k} if k else None


def poi(row):
    name = name_of(row)
    category = row.get("basic_category") or ""
    if not name or (row.get("confidence") or 0) < 0.7:
        return None
    if not any(word in category for word in LANDMARK):
        return None
    return {"kind": category, "name": name}


LAYERS = [
    # (tile layer, Overture theme, type, columns, row -> properties)
    ("roads", "transportation", "segment", ["id", "bbox", "geometry", "subtype", "class", "subclass", "names", "road_flags"], road),
    ("buildings", "buildings", "building", ["id", "bbox", "geometry", "height", "is_underground"], building),
    ("water", "base", "water", ["id", "bbox", "geometry", "subtype", "class"], water),
    ("landuse", "base", "land_use", ["id", "bbox", "geometry", "subtype", "class"], land_use),
    ("landcover", "base", "land", ["id", "bbox", "geometry", "subtype", "class"], land),
    ("pois", "places", "place", ["id", "bbox", "geometry", "names", "basic_category", "confidence"], poi),
]


def listing(theme, kind):
    streets.TYPE = f"release/{streets.RELEASE}/theme={theme}/type={kind}/"
    return streets.listing()


def row_groups(key, size, boxes):
    """Row groups of one file whose bbox statistics overlap any of `boxes`."""
    f = pq.ParquetFile(streets.Ranged(streets.BASE + key, int(size)))
    md = f.metadata
    ix = {md.schema.column(i).path: i for i in range(md.num_columns)}
    hits = []
    for r in range(md.num_row_groups):
        g = md.row_group(r)
        try:
            x0 = g.column(ix["bbox.xmin"]).statistics.min
            x1 = g.column(ix["bbox.xmax"]).statistics.max
            y0 = g.column(ix["bbox.ymin"]).statistics.min
            y1 = g.column(ix["bbox.ymax"]).statistics.max
        except Exception:
            continue
        if any(x1 >= b[0] and x0 <= b[2] and y1 >= b[1] and y0 <= b[3] for b in boxes):
            hits.append(r)
    return key, size, hits


def fetch(theme, kind, columns, convert, boxes):
    files = listing(theme, kind)
    with cf.ThreadPoolExecutor(16) as ex:
        found = [h for h in ex.map(lambda f: row_groups(f[0], f[1], boxes), files) if h[2]]

    def read(hit):
        key, size, groups = hit
        f = pq.ParquetFile(streets.Ranged(streets.BASE + key, int(size)))
        out = []
        for g in groups:
            for row in f.read_row_group(g, columns=columns).to_pylist():
                b = row["bbox"]
                if not any(b["xmax"] >= x[0] and b["xmin"] <= x[2] and b["ymax"] >= x[1] and b["ymin"] <= x[3] for x in boxes):
                    continue
                props = convert(row)
                if props is None:
                    continue
                geometry = wkb(row["geometry"])
                if not geometry:
                    continue
                parts = split_tunnels(row, props, geometry) if "road_flags" in row else [(props, geometry)]
                for i, (p, g) in enumerate(parts):
                    out.append((f"{row['id']}:{i}", {"type": "Feature", "geometry": g, "properties": p}))
        return out

    features = {}
    with cf.ThreadPoolExecutor(8) as ex:
        for part in ex.map(read, found):
            features.update(part)
    return list(features.values())


def main():
    pad_lat = MAP_PAD_KM / 111.32
    boxes = []
    for _name, (w, s, e, n) in streets.areas_from_library():
        pad_lng = MAP_PAD_KM / (111.32 * math.cos((s + n) / 2 * math.pi / 180))
        boxes.append([w - pad_lng, s - pad_lat, e + pad_lng, n + pad_lat])
    work = tempfile.mkdtemp(prefix="echo-map-")
    try:
        for layer, theme, kind, columns, convert in LAYERS:
            features = fetch(theme, kind, columns, convert, boxes)
            with open(os.path.join(work, f"{layer}.geojson"), "w") as fh:
                json.dump({"type": "FeatureCollection", "features": features}, fh, separators=(",", ":"))
            print(f"{layer}: {len(features)} features", file=sys.stderr)
        with open(os.path.join(work, "boxes.json"), "w") as fh:
            json.dump({"boxes": boxes, "minZoom": MIN_ZOOM, "maxZoom": MAX_ZOOM, "layers": [l[0] for l in LAYERS]}, fh)
        tiles = os.path.join(work, "tiles")
        subprocess.run(["node", os.path.join(HERE, "map-tiles.mjs"), work, tiles], check=True)
        w, s = min(b[0] for b in boxes), min(b[1] for b in boxes)
        e, n = max(b[2] for b in boxes), max(b[3] for b in boxes)
        shard(read_dir(tiles), [layer[0] for layer in LAYERS], f"Overture Maps {streets.RELEASE}")
        world(work)
    finally:
        shutil.rmtree(work, ignore_errors=True)


def world(work):
    """`world.pmtiles`: coastlines and borders everywhere (`map-tiles.mjs --world`)."""
    tiles = os.path.join(work, "world")
    subprocess.run(["node", os.path.join(HERE, "map-tiles.mjs"), "--world", tiles], check=True)
    pack(read_dir(tiles), WORLD, 0, 7, (-180, -85, 180, 85), ["earth", "boundaries"], "Natural Earth (public domain)")


def read_dir(tiles):
    """{(z, x, y): raw tile bytes} from a z/x/y.pbf folder."""
    out = {}
    for z in os.listdir(tiles):
        for x in os.listdir(os.path.join(tiles, z)):
            for f in os.listdir(os.path.join(tiles, z, x)):
                with open(os.path.join(tiles, z, x, f), "rb") as fh:
                    out[(int(z), int(x), int(f.split(".")[0]))] = fh.read()
    return out


def tile_bounds(z, x, y):
    """(west, south, east, north) of a web-mercator tile."""
    def lat(yy):
        return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * yy / 2**z))))
    return (x / 2**z * 360 - 180, lat(y + 1), (x + 1) / 2**z * 360 - 180, lat(y))


def shard(tiles, layers, source):
    """Every tile into the file for the SHARD_ZOOM square it falls in, plus `index.json`."""
    squares = {}
    for (z, x, y), data in tiles.items():
        d = z - SHARD_ZOOM
        squares.setdefault((x >> d, y >> d), {})[(z, x, y)] = data
    os.makedirs(OUT, exist_ok=True)
    names = []
    for (sx, sy), part in sorted(squares.items()):
        name = f"{SHARD_ZOOM}-{sx}-{sy}"
        pack(part, os.path.join(OUT, f"{name}.pmtiles"), MIN_ZOOM, MAX_ZOOM, tile_bounds(SHARD_ZOOM, sx, sy), layers, source)
        names.append(name)
    # A square with no echoes left in it goes, so a deleted city does not linger.
    for f in os.listdir(OUT):
        if f.endswith(".pmtiles") and f[: -len(".pmtiles")] not in names:
            os.remove(os.path.join(OUT, f))
    with open(os.path.join(OUT, "index.json"), "w") as fh:
        json.dump({"v": 1, "zoom": SHARD_ZOOM, "minZoom": MIN_ZOOM, "maxZoom": MAX_ZOOM, "layers": layers, "squares": names}, fh, indent=1)
        fh.write("\n")
    if os.path.exists(LEGACY):
        os.remove(LEGACY)
    print(f"{OUT}: {len(names)} squares, {len(tiles)} tiles", file=sys.stderr)


def reshard():
    """Re-cut the old single `echoes.pmtiles` into squares, fetching nothing."""
    from pmtiles.reader import MmapSource, Reader, all_tiles

    with open(LEGACY, "rb") as fh:
        reader = Reader(MmapSource(fh))
        meta = reader.metadata()
        tiles = {zxy: gzip.decompress(data) for zxy, data in all_tiles(reader.get_bytes)}
    shard(tiles, [layer["id"] for layer in meta.get("vector_layers", [])], meta.get("source", ""))


def pack(tiles, out, min_zoom, max_zoom, bounds, layers, source):
    entries = sorted((zxy_to_tileid(z, x, y), data) for (z, x, y), data in tiles.items())
    os.makedirs(os.path.dirname(out), exist_ok=True)
    w, s, e, n = bounds
    with open(out, "wb") as fo:
        writer = Writer(fo)
        for tile_id, data in entries:
            # mtime=0 so an unchanged map builds to the same bytes, and git sees no change.
            writer.write_tile(tile_id, gzip.compress(data, mtime=0))
        writer.finalize(
            {
                "tile_type": TileType.MVT,
                "tile_compression": Compression.GZIP,
                "min_zoom": min_zoom,
                "max_zoom": max_zoom,
                "min_lon_e7": int(w * 1e7),
                "min_lat_e7": int(s * 1e7),
                "max_lon_e7": int(e * 1e7),
                "max_lat_e7": int(n * 1e7),
                "center_zoom": max_zoom - 1,
                "center_lon_e7": int((w + e) / 2 * 1e7),
                "center_lat_e7": int((s + n) / 2 * 1e7),
            },
            {
                "name": "Echo Finders map",
                "attribution": "© OpenStreetMap contributors, Overture Maps Foundation",
                "source": source,
                "vector_layers": [{"id": layer, "fields": {}} for layer in layers],
            },
        )
    print(f"{out}: {len(entries)} tiles, {os.path.getsize(out) // 1024} KB", file=sys.stderr)


if __name__ == "__main__":
    reshard() if "--reshard" in sys.argv else main()
