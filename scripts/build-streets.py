#!/usr/bin/env python3
"""
`apps/prototype/public/streets/*.json`: walkable streets around every echo, for directions.

The map has to get you to an echo, along streets, without a routing service. A hosted
router is a per-request bill on every "take me there" (`docs/02-costs.md`, "Per-listener
runtime calls"), and a phone on a flight or in a basement has no network to ask anyway.
So the walking network around the library is built once, here, and shipped as files the
phone routes over itself (`apps/prototype/src/streets.ts`).

Source: Overture Maps transportation segments (OpenStreetMap-derived, ODbL), read straight
from Overture's public S3 bucket. Overture is used rather than the map tiles because its
segments carry `connectors`: which streets actually meet. Map tiles only say where lines
are drawn, and two lines crossing on a map may be a bridge over a road.

What counts as walkable: every road and path, except where Overture says foot traffic is
denied on the whole segment (motorways, most bridges' main decks). Private service roads
are kept: they are car parks and alleys, which people walk.

Areas: echoes within 1.5 km of each other are one area, padded by 1.2 km, so a listener
anywhere near an echo can be routed to it. An echo added later in a new place needs this
run again; until then that echo still gets a compass bearing and distance, just no street
route (`streets.ts`).

Run: `pip install pyarrow` then `python3 scripts/build-streets.py`. About a minute per
area; reads only the parquet row groups that overlap each area.
"""

import concurrent.futures as cf
import io
import json
import math
import os
import re
import sys
import urllib.parse
import urllib.request

import pyarrow.parquet as pq

RELEASE = os.environ.get("OVERTURE_RELEASE", "2026-09-23.0")
BASE = "https://s3.us-west-2.amazonaws.com/overturemaps-us-west-2/"
TYPE = f"release/{RELEASE}/theme=transportation/type=segment/"
ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "apps", "prototype", "public", "streets")
LINK_KM = 1.5
PAD_KM = 1.2
COLUMNS = ["id", "bbox", "geometry", "subtype", "class", "connectors", "access_restrictions", "names"]


class Ranged(io.RawIOBase):
    """A file over HTTP range requests, so parquet reads only the bytes it needs."""

    def __init__(self, url, size):
        self.url, self.size, self.pos = url, size, 0

    def seekable(self):
        return True

    def readable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, offset, whence=0):
        self.pos = offset if whence == 0 else self.pos + offset if whence == 1 else self.size + offset
        return self.pos

    def read(self, n=-1):
        if n < 0:
            n = self.size - self.pos
        if n == 0 or self.pos >= self.size:
            return b""
        end = min(self.size, self.pos + n) - 1
        req = urllib.request.Request(self.url, headers={"Range": f"bytes={self.pos}-{end}"})
        for attempt in range(4):
            try:
                data = urllib.request.urlopen(req, timeout=120).read()
                break
            except Exception:
                if attempt == 3:
                    raise
        self.pos += len(data)
        return data

    def readinto(self, b):
        data = self.read(len(b))
        b[: len(data)] = data
        return len(data)


def listing():
    keys, token = [], None
    while True:
        url = f"{BASE.rstrip('/')}?list-type=2&prefix={TYPE}" + (f"&continuation-token={urllib.parse.quote(token)}" if token else "")
        body = urllib.request.urlopen(url).read().decode()
        keys += re.findall(r"<Key>(.*?)</Key><LastModified>.*?<Size>(\d+)</Size>", body)
        m = re.search(r"<NextContinuationToken>(.*?)</NextContinuationToken>", body)
        if not m:
            return keys
        token = m.group(1)


def overlapping(key, size, box):
    """Row groups of one file whose bbox statistics overlap `box`."""
    f = pq.ParquetFile(Ranged(BASE + key, int(size)))
    md = f.metadata
    names = [md.schema.column(i).path for i in range(md.num_columns)]
    ix = {n: i for i, n in enumerate(names)}
    hits = []
    for r in range(md.num_row_groups):
        g = md.row_group(r)
        try:
            xmin = g.column(ix["bbox.xmin"]).statistics.min
            xmax = g.column(ix["bbox.xmax"]).statistics.max
            ymin = g.column(ix["bbox.ymin"]).statistics.min
            ymax = g.column(ix["bbox.ymax"]).statistics.max
        except Exception:
            continue
        if xmax >= box[0] and xmin <= box[2] and ymax >= box[1] and ymin <= box[3]:
            hits.append(r)
    return key, size, hits


def km(a, b):
    t = math.pi / 180
    x = (b[0] - a[0]) * t * math.cos((a[1] + b[1]) / 2 * t)
    y = (b[1] - a[1]) * t
    return 6371 * math.hypot(x, y)


def areas_from_library():
    src = open(os.path.join(ROOT, "apps", "prototype", "src", "library.generated.ts")).read()
    lib = json.loads(src[src.index("= [") + 2 : src.index("] as const;") + 1])
    pts = [(e["point"]["at"]["lng"], e["point"]["at"]["lat"], e["id"]) for e in lib]
    parent = list(range(len(pts)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(len(pts)):
        for j in range(i + 1, len(pts)):
            if km(pts[i], pts[j]) < LINK_KM:
                parent[find(i)] = find(j)
    groups = {}
    for i, p in enumerate(pts):
        groups.setdefault(find(i), []).append(p)
    areas = []
    for members in groups.values():
        lat = sum(p[1] for p in members) / len(members)
        dlat = PAD_KM / 111.32
        dlng = PAD_KM / (111.32 * math.cos(lat * math.pi / 180))
        box = (
            min(p[0] for p in members) - dlng,
            min(p[1] for p in members) - dlat,
            max(p[0] for p in members) + dlng,
            max(p[1] for p in members) + dlat,
        )
        # Named after its first echo alphabetically, which is stable between runs.
        areas.append((sorted(p[2] for p in members)[0], box))
    return sorted(areas)


def foot_denied(restrictions):
    """True when foot traffic is denied along the whole segment."""
    for r in restrictions or []:
        if r.get("access_type") != "denied" or r.get("between"):
            continue
        when = r.get("when") or {}
        if when.get("heading") or when.get("during"):
            continue
        modes = when.get("mode")
        if modes is None or "foot" in modes:
            return True
    return False


def substring(coords, a, b):
    """The part of a polyline between fractions `a` and `b` of its length."""
    seg = [km(coords[i], coords[i + 1]) for i in range(len(coords) - 1)]
    total = sum(seg) or 1e-9

    def point_at(f):
        target, run = f * total, 0.0
        for i, s in enumerate(seg):
            if run + s >= target or i == len(seg) - 1:
                t = 0 if s == 0 else max(0.0, min(1.0, (target - run) / s))
                return i, (coords[i][0] + (coords[i + 1][0] - coords[i][0]) * t, coords[i][1] + (coords[i + 1][1] - coords[i][1]) * t)
            run += s
        return len(seg) - 1, coords[-1]

    ia, pa = point_at(a)
    ib, pb = point_at(b)
    return [pa] + coords[ia + 1 : ib + 1] + [pb]


def wkb_linestring(blob):
    """Overture geometries are WKB; segments are always LineStrings."""
    import struct

    order = "<" if blob[0] == 1 else ">"
    kind = struct.unpack(order + "I", blob[1:5])[0]
    if kind != 2:
        return None
    n = struct.unpack(order + "I", blob[5:9])[0]
    return [struct.unpack(order + "dd", blob[9 + 16 * i : 25 + 16 * i]) for i in range(n)]


def bearing(a, b):
    t = math.pi / 180
    y = math.sin((b[0] - a[0]) * t) * math.cos(b[1] * t)
    x = math.cos(a[1] * t) * math.sin(b[1] * t) - math.sin(a[1] * t) * math.cos(b[1] * t) * math.cos((b[0] - a[0]) * t)
    return (math.atan2(y, x) / t + 360) % 360


def name_sidewalks(edges, names, name_ix):
    """
    Give a pavement the name of the street it runs beside.

    In OpenStreetMap a pavement is its own unnamed path, and most of a walk is on them, so
    directions built from names alone said "straight on" through three turns. A path with no
    name, running parallel (within 25 degrees) to a named road no more than 25 m away, takes
    that road's name. Crossings run across the road rather than along it and stay unnamed,
    which is right: you cross Market Street, you do not turn onto it.
    """
    FOOT = {"footway", "path", "pedestrian", "steps", "cycleway", "living_street", "track", "bridleway"}
    cell = 0.0005
    grid = {}
    for ix, (a, b, length, label, klass, line) in enumerate(edges):
        if not names[label] or klass in FOOT:
            continue
        for i in range(len(line) - 1):
            mid = ((line[i][0] + line[i + 1][0]) / 2, (line[i][1] + line[i + 1][1]) / 2)
            grid.setdefault((int(mid[0] // cell), int(mid[1] // cell)), []).append((ix, i))
    for k, (a, b, length, label, klass, line) in enumerate(edges):
        if names[label] or klass not in FOOT or length < 4:
            continue
        mid = line[len(line) // 2] if len(line) > 2 else ((line[0][0] + line[-1][0]) / 2, (line[0][1] + line[-1][1]) / 2)
        heading = bearing(line[0], line[-1])
        best, best_d = None, 25.0
        cx, cy = int(mid[0] // cell), int(mid[1] // cell)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for ix, i in grid.get((cx + dx, cy + dy), []):
                    road = edges[ix][5]
                    p, q = road[i], road[i + 1]
                    diff = abs((bearing(p, q) - heading + 180) % 360 - 180)
                    if min(diff, 180 - diff) > 25:
                        continue
                    # Distance from the path's middle to that piece of road, in metres.
                    kx = 111320 * math.cos(mid[1] * math.pi / 180)
                    ax, ay = (p[0] - mid[0]) * kx, (p[1] - mid[1]) * 111320
                    bx, by = (q[0] - mid[0]) * kx, (q[1] - mid[1]) * 111320
                    vx, vy = bx - ax, by - ay
                    l2 = vx * vx + vy * vy or 1e-9
                    t = max(0.0, min(1.0, -(ax * vx + ay * vy) / l2))
                    d = math.hypot(ax + vx * t, ay + vy * t)
                    if d < best_d:
                        best, best_d = edges[ix][3], d
        if best is not None:
            edges[k] = (a, b, length, best, klass, line)


def build(name, box, files):
    with cf.ThreadPoolExecutor(16) as ex:
        found = [h for h in ex.map(lambda f: overlapping(f[0], f[1], box), files) if h[2]]
    rows = []
    for key, size, groups in found:
        f = pq.ParquetFile(Ranged(BASE + key, int(size)))
        for g in groups:
            for row in f.read_row_group(g, columns=COLUMNS).to_pylist():
                b = row["bbox"]
                if b["xmax"] >= box[0] and b["xmin"] <= box[2] and b["ymax"] >= box[1] and b["ymin"] <= box[3]:
                    rows.append(row)

    nodes, node_ix, edges, names = [], {}, [], []
    name_ix = {}

    def node(cid, xy):
        if cid not in node_ix:
            node_ix[cid] = len(nodes)
            nodes.append(xy)
        return node_ix[cid]

    def name_of(row):
        n = ((row.get("names") or {}).get("primary")) or ""
        if n not in name_ix:
            name_ix[n] = len(names)
            names.append(n)
        return name_ix[n]

    for row in rows:
        if row["subtype"] != "road" or foot_denied(row.get("access_restrictions")):
            continue
        coords = wkb_linestring(row["geometry"])
        conns = sorted(row.get("connectors") or [], key=lambda c: c["at"])
        if not coords or len(conns) < 2:
            continue
        label = name_of(row)
        for c0, c1 in zip(conns, conns[1:]):
            if c1["at"] <= c0["at"]:
                continue
            line = substring(coords, c0["at"], c1["at"])
            a = node(c0["connector_id"], line[0])
            b = node(c1["connector_id"], line[-1])
            length = sum(km(line[i], line[i + 1]) for i in range(len(line) - 1)) * 1000
            edges.append((a, b, round(length, 1), label, row["class"] or "", line))

    name_sidewalks(edges, names, name_ix)

    # Compact: coordinates as integer micro-degrees, each line delta-encoded from its
    # start node, so a file is mostly small integers.
    q = lambda v: round(v * 1e6)
    out = {
        "v": 1,
        "area": name,
        "bbox": [round(v, 5) for v in box],
        "source": f"Overture Maps {RELEASE}, transportation/segment (OpenStreetMap contributors, ODbL)",
        "names": names,
        "nodes": [c for xy in nodes for c in (q(xy[0]), q(xy[1]))],
        "edges": [],
    }
    for a, b, length, label, klass, line in edges:
        x0, y0 = q(line[0][0]), q(line[0][1])
        inner, px, py = [], x0, y0
        for xy in line[1:-1]:
            x, y = q(xy[0]), q(xy[1])
            inner += [x - px, y - py]
            px, py = x, y
        out["edges"].append([a, b, length, label, klass, inner])
    path = os.path.join(OUT, f"{name}.json")
    with open(path, "w") as fh:
        json.dump(out, fh, separators=(",", ":"))
    return len(nodes), len(edges), os.path.getsize(path)


def main():
    os.makedirs(OUT, exist_ok=True)
    areas = areas_from_library()
    files = listing()
    # `ONLY=area-name` rebuilds one area's file and leaves the rest as they are.
    only = os.environ.get("ONLY")
    index = []
    for name, box in areas:
        index.append({"area": name, "bbox": [round(v, 5) for v in box], "file": f"{name}.json"})
        if only and name != only:
            continue
        n, e, size = build(name, box, files)
        print(f"{name}: {n} nodes, {e} edges, {size // 1024} KB", file=sys.stderr)
    with open(os.path.join(OUT, "index.json"), "w") as fh:
        json.dump({"v": 1, "release": RELEASE, "areas": index}, fh, indent=1)


if __name__ == "__main__":
    main()
