#!/usr/bin/env python3
"""
`content/routes/<id>.path.json`: the road a drive actually follows.

A route is a short list of waypoints, and the engine joined them with straight lines. For a
flight that is right: an aircraft flies the great circle. For a drive it is wrong, and on
the Blue Ridge Parkway, which winds along a ridge for its whole length, the line cut across
valleys between overlooks. The line on the map is the drive, and the corridor the engine
searches for echoes is built along it, so both were off the road.

This traces the real road once, at build time, from the same open data the map and the
walking directions use (Overture transportation segments, OpenStreetMap-derived, ODbL),
and saves it beside the route. `build-library.mjs` hands it to the engine as `path`, and
`buildRouteGeometry` follows it instead of the straight lines. No routing service: a drive
is traced when it is written, not every time somebody takes it. Directions while driving
are the phone's own maps app's job (James, 2026-10-15).

HOW. Every drivable road in a box around the route becomes a graph, joined where Overture
says segments meet. Each leg, waypoint to waypoint, is the cheapest path through it, where
cost is length, made cheaper on the road the route is named for (`follows:` in the route
file), so "the Blue Ridge Parkway from Asheville to Boone" stays on the Parkway rather than
taking the interstate because it is shorter. The result is thinned to what still draws
within a few metres of the road.

Run: `pip install pyarrow pyyaml` then `python3 scripts/build-route-paths.py`. Only driving
routes are traced; `ONLY=<route id>` traces one.
"""

import concurrent.futures as cf
import heapq
import importlib.util
import json
import math
import os
import sys

import pyarrow.parquet as pq
import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
ROUTES = os.path.join(HERE, "..", "content", "routes")

# The Overture reader is the walking network's, so the release always matches.
_spec = importlib.util.spec_from_file_location("streets", os.path.join(HERE, "build-streets.py"))
streets = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(streets)

# Roads a car can use. Footways, paths, steps and cycleways are left out, and so are
# service roads: car parks and driveways are never part of a scenic drive.
DRIVABLE = {"motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential", "living_street", "unknown"}
# The road a route is named for costs this fraction of its length.
PREFER = 0.35
# How far past the waypoints to read roads, degrees. Enough for the road to swing out.
PAD_DEG = 0.12
# Thinning tolerance, metres: the drawn line stays this close to the road.
TOLERANCE_M = 12
COLUMNS = ["id", "bbox", "geometry", "subtype", "class", "connectors", "names"]


def km(a, b):
    return streets.km(a, b)


def graph(box):
    """Nodes, adjacency and edge geometry for every drivable road in `box`."""
    streets.TYPE = f"release/{streets.RELEASE}/theme=transportation/type=segment/"
    files = streets.listing()
    with cf.ThreadPoolExecutor(16) as ex:
        found = [h for h in ex.map(lambda f: streets.overlapping(f[0], f[1], box), files) if h[2]]

    def read(hit):
        key, size, groups = hit
        f = pq.ParquetFile(streets.Ranged(streets.BASE + key, int(size)))
        rows = []
        for g in groups:
            for row in f.read_row_group(g, columns=COLUMNS).to_pylist():
                b = row["bbox"]
                if row["subtype"] != "road" or (row["class"] or "unknown") not in DRIVABLE:
                    continue
                if b["xmax"] >= box[0] and b["xmin"] <= box[2] and b["ymax"] >= box[1] and b["ymin"] <= box[3]:
                    rows.append(row)
        return rows

    rows = []
    with cf.ThreadPoolExecutor(8) as ex:
        for part in ex.map(read, found):
            rows += part

    nodes, node_ix, adj = [], {}, {}

    def node(cid, xy):
        if cid not in node_ix:
            node_ix[cid] = len(nodes)
            nodes.append(xy)
        return node_ix[cid]

    for row in rows:
        coords = streets.wkb_linestring(row["geometry"])
        conns = sorted(row.get("connectors") or [], key=lambda c: c["at"])
        if not coords or len(conns) < 2:
            continue
        name = ((row.get("names") or {}).get("primary")) or ""
        for c0, c1 in zip(conns, conns[1:]):
            if c1["at"] <= c0["at"]:
                continue
            line = streets.substring(coords, c0["at"], c1["at"])
            a = node(c0["connector_id"], line[0])
            b = node(c1["connector_id"], line[-1])
            length = sum(km(line[i], line[i + 1]) for i in range(len(line) - 1))
            adj.setdefault(a, []).append((b, length, name, line))
            adj.setdefault(b, []).append((a, length, name, line[::-1]))
    return nodes, adj


def nearest(nodes, adj, at):
    """The road node closest to a waypoint (lng, lat)."""
    return min(adj, key=lambda i: km(nodes[i], at))


def leg(adj, start, goal, follows):
    """Cheapest path start → goal, as a list of (lng, lat)."""
    best = {start: 0.0}
    back = {}
    queue = [(0.0, start)]
    while queue:
        cost, here = heapq.heappop(queue)
        if here == goal:
            break
        if cost > best.get(here, math.inf):
            continue
        for there, length, name, line in adj.get(here, []):
            step = length * (PREFER if follows and follows.lower() in name.lower() else 1.0)
            if cost + step < best.get(there, math.inf):
                best[there] = cost + step
                back[there] = (here, line)
                heapq.heappush(queue, (cost + step, there))
    if goal not in back and goal != start:
        raise SystemExit(f"no road between waypoints {start} and {goal}")
    parts, at = [], goal
    while at != start:
        prev, line = back[at]
        parts.append(line)
        at = prev
    out = []
    for line in reversed(parts):
        out += line if not out else line[1:]
    return out


def thin(points, tolerance_m):
    """Douglas-Peucker in metres, on (lng, lat) points."""
    if len(points) < 3:
        return points
    lat0 = sum(p[1] for p in points) / len(points)
    kx, ky = 111320 * math.cos(math.radians(lat0)), 111320
    xy = [(p[0] * kx, p[1] * ky) for p in points]
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        i, j = stack.pop()
        (ax, ay), (bx, by) = xy[i], xy[j]
        vx, vy = bx - ax, by - ay
        l2 = vx * vx + vy * vy or 1e-9
        far, far_d = None, tolerance_m
        for k in range(i + 1, j):
            px, py = xy[k]
            t = max(0.0, min(1.0, ((px - ax) * vx + (py - ay) * vy) / l2))
            d = math.hypot(px - ax - vx * t, py - ay - vy * t)
            if d > far_d:
                far, far_d = k, d
        if far is not None:
            keep[far] = True
            stack += [(i, far), (far, j)]
    return [p for p, k in zip(points, keep) if k]


def trace(route):
    waypoints = [(w["at"]["lng"], w["at"]["lat"]) for w in route["waypoints"]]
    box = [
        min(p[0] for p in waypoints) - PAD_DEG,
        min(p[1] for p in waypoints) - PAD_DEG,
        max(p[0] for p in waypoints) + PAD_DEG,
        max(p[1] for p in waypoints) + PAD_DEG,
    ]
    nodes, adj = graph(box)
    stops = [nearest(nodes, adj, w) for w in waypoints]
    path = []
    for a, b in zip(stops, stops[1:]):
        part = leg(adj, a, b, route.get("follows"))
        path += part if not path else part[1:]
    total = sum(km(path[i], path[i + 1]) for i in range(len(path) - 1))
    thinned = thin(path, TOLERANCE_M)
    out = {
        "v": 1,
        "route": route["id"],
        "source": f"Overture Maps {streets.RELEASE}, transportation/segment (OpenStreetMap contributors, ODbL)",
        "follows": route.get("follows"),
        "km": round(total, 1),
        "path": [[round(p[1], 5), round(p[0], 5)] for p in thinned],
    }
    target = os.path.join(ROUTES, f"{route['id']}.path.json")
    with open(target, "w") as fh:
        json.dump(out, fh, separators=(",", ":"))
        fh.write("\n")
    print(f"{route['id']}: {total:.1f} km of road, {len(path)} points thinned to {len(thinned)}", file=sys.stderr)


def main():
    only = os.environ.get("ONLY")
    for file in sorted(os.listdir(ROUTES)):
        if not file.endswith((".yml", ".yaml")):
            continue
        with open(os.path.join(ROUTES, file)) as fh:
            route = yaml.safe_load(fh)
        if route.get("mode") != "driving" or (only and route["id"] != only):
            continue
        trace(route)


if __name__ == "__main__":
    main()
