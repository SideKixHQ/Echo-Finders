/**
 * Walking directions, worked out on the phone.
 *
 * James (2026-10-11): "if i tap on an echo and i want to go to that echo i need a way to get
 * directions to that echo. it cant just be out in space for me to stumble upon."
 *
 * A hosted router would be a bill on every "take me there" and needs a network a flight or
 * a basement does not have (`docs/02-costs.md`). So the walkable streets around the library
 * ship as small files (`scripts/build-streets.py`) and this routes over them: snap both ends
 * to the nearest street, A* along the network, and describe the result as a line to draw and
 * a handful of turns to say.
 *
 * Pure: the caller loads the file. Nothing here touches the network or the DOM.
 */

import type { LatLng } from "../types.js";
import { bearingDeg, distanceKm } from "./great-circle.js";

/** The file format written by `scripts/build-streets.py`, version 1. */
export interface StreetFile {
  readonly v: 1;
  readonly area: string;
  readonly bbox: readonly [number, number, number, number];
  readonly names: readonly string[];
  /** Flat [lng, lat, lng, lat, …] in micro-degrees. */
  readonly nodes: readonly number[];
  /** [from, to, metres, name index, class, inner points as micro-degree deltas]. */
  readonly edges: readonly (readonly [number, number, number, number, string, readonly number[]])[];
}

interface Edge {
  readonly a: number;
  readonly b: number;
  readonly metres: number;
  readonly name: string;
  /** Every point along it, `a` first and `b` last. */
  readonly line: readonly LatLng[];
}

export interface StreetGraph {
  readonly area: string;
  readonly bbox: readonly [number, number, number, number];
  readonly nodes: readonly LatLng[];
  readonly edges: readonly Edge[];
  /** For each node, the edges that touch it. */
  readonly touching: readonly (readonly number[])[];
  /** Edge indices bucketed by a ~100m grid, for snapping without scanning every street. */
  readonly grid: ReadonlyMap<string, readonly number[]>;
}

/** Walking pace for times shown to people: 4.5 km/h, a sightseer's rather than a commuter's. */
export const WALK_M_PER_S = 1.25;

const CELL_DEG = 0.001;
const cellOf = (p: LatLng) => `${Math.floor(p.lng / CELL_DEG)},${Math.floor(p.lat / CELL_DEG)}`;

export function decodeStreets(file: StreetFile): StreetGraph {
  const nodes: LatLng[] = [];
  for (let i = 0; i < file.nodes.length; i += 2) {
    nodes.push({ lng: file.nodes[i]! / 1e6, lat: file.nodes[i + 1]! / 1e6 });
  }
  const touching: number[][] = nodes.map(() => []);
  const grid = new Map<string, number[]>();
  const edges: Edge[] = file.edges.map(([a, b, metres, nameIx, , inner], ix) => {
    const start = nodes[a]!;
    const line: LatLng[] = [start];
    let x = Math.round(start.lng * 1e6);
    let y = Math.round(start.lat * 1e6);
    for (let i = 0; i < inner.length; i += 2) {
      x += inner[i]!;
      y += inner[i + 1]!;
      line.push({ lng: x / 1e6, lat: y / 1e6 });
    }
    line.push(nodes[b]!);
    touching[a]!.push(ix);
    touching[b]!.push(ix);
    // Every cell any part of it passes through, sampled finely enough not to skip one.
    const cells = new Set<string>();
    for (let i = 0; i < line.length - 1; i++) {
      const p = line[i]!;
      const q = line[i + 1]!;
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(q.lng - p.lng), Math.abs(q.lat - p.lat)) / (CELL_DEG / 2)));
      for (let s = 0; s <= steps; s++) {
        cells.add(cellOf({ lng: p.lng + ((q.lng - p.lng) * s) / steps, lat: p.lat + ((q.lat - p.lat) * s) / steps }));
      }
    }
    for (const c of cells) {
      let list = grid.get(c);
      if (!list) grid.set(c, (list = []));
      list.push(ix);
    }
    return { a, b, metres, name: file.names[nameIx] ?? "", line };
  });
  return { area: file.area, bbox: file.bbox, nodes, edges, touching, grid };
}

/** Is this position inside the area a graph was built for? */
export function streetsCover(graph: Pick<StreetGraph, "bbox">, p: LatLng): boolean {
  const [w, s, e, n] = graph.bbox;
  return p.lng >= w && p.lng <= e && p.lat >= s && p.lat <= n;
}

interface Snap {
  readonly edge: number;
  /** Index of the segment within the edge's line. */
  readonly seg: number;
  /** 0..1 along that segment. */
  readonly t: number;
  readonly at: LatLng;
  readonly offM: number;
  /** Metres from the edge's start node to the snapped point, along the edge. */
  readonly alongM: number;
}

/** Local flat metres, which at street scale is exact enough. */
function toXY(p: LatLng, ref: LatLng) {
  const k = 111_320;
  return { x: (p.lng - ref.lng) * k * Math.cos((ref.lat * Math.PI) / 180), y: (p.lat - ref.lat) * k };
}

function lineMetres(line: readonly LatLng[], upTo = line.length - 1): number {
  let m = 0;
  for (let i = 0; i < upTo; i++) m += distanceKm(line[i]!, line[i + 1]!) * 1000;
  return m;
}

/** The nearest point on any street, searching outward from the position's own cell. */
export function snapToStreet(graph: StreetGraph, p: LatLng, maxM = 400): Snap | null {
  const cx = Math.floor(p.lng / CELL_DEG);
  const cy = Math.floor(p.lat / CELL_DEG);
  let best = null as Snap | null;
  const seen = new Set<number>();
  const rings = Math.ceil(maxM / 80);
  for (let r = 0; r <= rings; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        for (const ix of graph.grid.get(`${cx + dx},${cy + dy}`) ?? []) {
          if (seen.has(ix)) continue;
          seen.add(ix);
          const line = graph.edges[ix]!.line;
          for (let s = 0; s < line.length - 1; s++) {
            const a = toXY(line[s]!, p);
            const b = toXY(line[s + 1]!, p);
            const vx = b.x - a.x;
            const vy = b.y - a.y;
            const len2 = vx * vx + vy * vy;
            const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * vx + a.y * vy) / len2));
            const off = Math.hypot(a.x + vx * t, a.y + vy * t);
            if (!best || off < best.offM) {
              const at = {
                lng: line[s]!.lng + (line[s + 1]!.lng - line[s]!.lng) * t,
                lat: line[s]!.lat + (line[s + 1]!.lat - line[s]!.lat) * t,
              };
              best = { edge: ix, seg: s, t, at, offM: off, alongM: lineMetres(line, s) + distanceKm(line[s]!, at) * 1000 };
            }
          }
        }
      }
    }
    // A hit in this ring can still lose to one in the next only if it is further than a
    // ring's width; past that, stop looking.
    if (best !== null && (best as Snap).offM < r * 80) break;
  }
  return best !== null && (best as Snap).offM <= maxM ? best : null;
}

export interface Turn {
  /** Where the turn is. */
  readonly at: LatLng;
  /** Metres walked from the start to reach it. */
  readonly fromStartM: number;
  readonly direction: "left" | "right" | "slight left" | "slight right" | "straight";
  /** The street you turn onto, or "" when it has no name (a path, a square). */
  readonly onto: string;
}

export interface WalkingRoute {
  /** From the start, along the streets, to the destination. */
  readonly line: readonly LatLng[];
  readonly metres: number;
  readonly seconds: number;
  readonly turns: readonly Turn[];
  /** The street you set off along. */
  readonly startOn: string;
}

/** The part of an edge's line from its start node to a snap, or from a snap to its end. */
function partOf(edge: Edge, snap: Snap, toEnd: boolean): LatLng[] {
  return toEnd ? [snap.at, ...edge.line.slice(snap.seg + 1)] : [...edge.line.slice(0, snap.seg + 1), snap.at];
}

/** A run of the walk along one street. */
interface Piece {
  readonly points: readonly LatLng[];
  readonly name: string;
}

/**
 * Walking route from `from` to `to`, or null when either is off the network (more than
 * `maxSnapM` from any street in this graph) or they are not connected.
 */
export function walkingRoute(graph: StreetGraph, from: LatLng, to: LatLng, maxSnapM = 400): WalkingRoute | null {
  const s = snapToStreet(graph, from, maxSnapM);
  const e = snapToStreet(graph, to, maxSnapM);
  if (!s || !e) return null;
  const startEdge = graph.edges[s.edge]!;
  const endEdge = graph.edges[e.edge]!;

  // Both on the same street, and walking along it is the whole trip.
  if (s.edge === e.edge) {
    const forward = s.alongM <= e.alongM;
    const [lo, hi] = forward ? [s, e] : [e, s];
    const along = [lo.at, ...startEdge.line.slice(lo.seg + 1, hi.seg + 1), hi.at];
    return finish([
      { points: [from], name: "" },
      { points: forward ? along : along.reverse(), name: startEdge.name },
      { points: [to], name: "" },
    ]);
  }

  // A* from two virtual starts (either end of the start edge) to two virtual ends.
  const n = graph.nodes.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prevEdge = new Int32Array(n).fill(-1);
  const prevNode = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  const h = (i: number) => distanceKm(graph.nodes[i]!, e.at) * 1000;
  const open = new Heap();
  const seed = (node: number, d: number) => {
    if (d < dist[node]!) {
      dist[node] = d;
      open.push(node, d + h(node));
    }
  };
  seed(startEdge.a, s.alongM);
  seed(startEdge.b, startEdge.metres - s.alongM);
  const finalCost = (node: number) =>
    node === endEdge.a ? e.alongM : node === endEdge.b ? endEdge.metres - e.alongM : Infinity;

  let best = Infinity;
  let bestNode = -1;
  while (open.size) {
    const [u, f] = open.pop();
    if (done[u]) continue;
    if (f >= best) break;
    done[u] = 1;
    const exit = dist[u]! + finalCost(u);
    if (exit < best) {
      best = exit;
      bestNode = u;
    }
    for (const ix of graph.touching[u]!) {
      const edge = graph.edges[ix]!;
      const v = edge.a === u ? edge.b : edge.a;
      const d = dist[u]! + edge.metres;
      if (d < dist[v]!) {
        dist[v] = d;
        prevEdge[v] = ix;
        prevNode[v] = u;
        open.push(v, d + h(v));
      }
    }
  }
  if (bestNode < 0) return null;

  // Walk back from the exit node to whichever start node it came from.
  const chain: number[] = [];
  let at = bestNode;
  while (prevEdge[at]! >= 0) {
    chain.push(prevEdge[at]!);
    at = prevNode[at]!;
  }
  chain.reverse();
  const firstNode = at;

  const pieces: Piece[] = [{ points: [from], name: "" }];
  pieces.push({
    points: firstNode === startEdge.a ? partOf(startEdge, s, false).reverse() : partOf(startEdge, s, true),
    name: startEdge.name,
  });
  let node = firstNode;
  for (const ix of chain) {
    const edge = graph.edges[ix]!;
    pieces.push({ points: edge.a === node ? edge.line : [...edge.line].reverse(), name: edge.name });
    node = edge.a === node ? edge.b : edge.a;
  }
  pieces.push({
    points: node === endEdge.a ? partOf(endEdge, e, false) : partOf(endEdge, e, true).reverse(),
    name: endEdge.name,
  });
  pieces.push({ points: [to], name: "" });
  return finish(pieces);
}

function finish(pieces: readonly Piece[]): WalkingRoute {
  // One line, with the name of the street each segment of it is on. Repeated points are
  // dropped: they make zero-length segments and meaningless bearings.
  const line: LatLng[] = [];
  const segName: string[] = [];
  for (const piece of pieces) {
    for (const p of piece.points) {
      const last = line[line.length - 1];
      if (last && distanceKm(last, p) * 1000 <= 0.5) continue;
      if (last) segName.push(piece.name);
      line.push(p);
    }
  }
  const metres = lineMetres(line);
  const firstNamed = segName.find((n) => n) ?? "";
  return { line, metres, seconds: metres / WALK_M_PER_S, turns: turnsAlong(line, segName), startOn: firstNamed };
}

/**
 * The turns worth saying out loud, the way a person gives directions: "left onto Market
 * Street", not every jog along a pavement.
 *
 * The street files include pavements, crossings and paths, which are most of what a walk
 * is made of and have no names. So a turn is where the walk moves onto a differently named
 * street; unnamed stretches in between belong to the street around them. The direction is
 * the change of heading from twenty metres before the junction to twenty metres after it,
 * which sees through the zig-zag of a crossing. A bend in one street is not a turn.
 */
function turnsAlong(line: readonly LatLng[], segName: readonly string[]): Turn[] {
  // Every point where the name of the street underfoot changes.
  const changes: { i: number; m: number; from: string; onto: string }[] = [];
  let walked = 0;
  let current = "";
  for (let i = 0; i < segName.length; i++) {
    const name = segName[i]!;
    if (name && name !== current) {
      if (current) changes.push({ i, m: walked, from: current, onto: name });
      current = name;
    }
    walked += distanceKm(line[i]!, line[i + 1]!) * 1000;
  }

  // Changes within 25 m of each other are one junction: a pavement passing the corner
  // takes the cross street's name for a few metres before taking its own back.
  const turns: Turn[] = [];
  for (let g = 0; g < changes.length; ) {
    let h = g;
    while (h + 1 < changes.length && changes[h + 1]!.m - changes[h]!.m < 25) h++;
    const first = changes[g]!;
    const last = changes[h]!;
    g = h + 1;
    if (last.onto === first.from) continue;
    const before = back(line, first.i, 20);
    const after = ahead(line, last.i, 20);
    let delta = before && after ? bearingDeg(line[last.i]!, after) - bearingDeg(before, line[first.i]!) : 0;
    delta = ((delta + 540) % 360) - 180;
    const abs = Math.abs(delta);
    // A new name with no change of direction is the same road renamed, not a turn.
    if (abs < 20) continue;
    turns.push({
      at: line[last.i]!,
      fromStartM: last.m,
      direction: abs < 50 ? (delta < 0 ? "slight left" : "slight right") : delta < 0 ? "left" : "right",
      onto: last.onto,
    });
  }
  return turns;
}

function back(line: readonly LatLng[], i: number, m: number): LatLng | null {
  let run = 0;
  for (let j = i - 1; j >= 0; j--) {
    run += distanceKm(line[j]!, line[j + 1]!) * 1000;
    if (run >= m) return line[j]!;
  }
  return i > 0 ? line[0]! : null;
}

function ahead(line: readonly LatLng[], i: number, m: number): LatLng | null {
  let run = 0;
  for (let j = i + 1; j < line.length; j++) {
    run += distanceKm(line[j - 1]!, line[j]!) * 1000;
    if (run >= m) return line[j]!;
  }
  return i < line.length - 1 ? line[line.length - 1]! : null;
}

/** A binary min-heap of (node, priority). */
class Heap {
  private readonly items: number[] = [];
  private readonly keys: number[] = [];
  get size() {
    return this.items.length;
  }
  push(item: number, key: number) {
    const { items, keys } = this;
    items.push(item);
    keys.push(key);
    let i = items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p]! <= keys[i]!) break;
      [items[p], items[i]] = [items[i]!, items[p]!];
      [keys[p], keys[i]] = [keys[i]!, keys[p]!];
      i = p;
    }
  }
  pop(): [number, number] {
    const { items, keys } = this;
    const top: [number, number] = [items[0]!, keys[0]!];
    const lastItem = items.pop()!;
    const lastKey = keys.pop()!;
    if (items.length) {
      items[0] = lastItem;
      keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < keys.length && keys[l]! < keys[m]!) m = l;
        if (r < keys.length && keys[r]! < keys[m]!) m = r;
        if (m === i) break;
        [items[m], items[i]] = [items[i]!, items[m]!];
        [keys[m], keys[i]] = [keys[i]!, keys[m]!];
        i = m;
      }
    }
    return top;
  }
}
