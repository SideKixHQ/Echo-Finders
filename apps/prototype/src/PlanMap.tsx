/**
 * The route, drawn small, at the top of "Choose what plays itself".
 *
 * James (2026-10-13): "add a map preview to the choose echoes screen". The list says what
 * each echo is and how far along it falls; this says where. The line is the route, each
 * dot is an echo with its number from the list, and the ones you have picked are lit.
 * Tapping a dot takes you to its card.
 *
 * Plain SVG, not MapLibre: a second live map behind a list is a lot of phone for a
 * thumbnail, and this has to draw on a seatback with no WebGL. Coastlines come from the
 * same file the no-WebGL map uses (`public/map/land.json`), so a flight is a line down a
 * coast rather than a line across nothing.
 */

import { useEffect, useMemo, useState } from "react";
import { buildRouteGeometry, type LatLng, type Route, type Upcoming } from "@echofinders/core";

interface Props {
  readonly route: Route;
  readonly items: readonly Upcoming[];
  readonly chosen: ReadonlySet<string>;
  readonly onPick: (echoId: string) => void;
}

const W = 360;
const H = 150;
const PAD = 18;

/** Web Mercator, 0–1 across the world. */
const merc = ({ lat, lng }: LatLng) => {
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return { x: (lng + 180) / 360, y: 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI) };
};

let landCache: Promise<readonly (readonly [number, number])[][]> | null = null;
const loadLand = () =>
  (landCache ??= fetch("/map/land.json")
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []));

export function PlanMap({ route, items, chosen, onPick }: Props) {
  const line = useMemo(() => {
    try {
      return buildRouteGeometry(route).points;
    } catch {
      return [] as LatLng[];
    }
  }, [route]);

  // Coastlines only matter at a scale where land and sea are both in view: a flight or a
  // drive, not a walk across one neighbourhood.
  const wide = route.mode === "flight" || route.mode === "driving";
  const [land, setLand] = useState<readonly (readonly [number, number])[][]>([]);
  useEffect(() => {
    if (wide) void loadLand().then(setLand);
  }, [wide]);

  const project = useMemo(() => {
    const pts = [...line, ...items.map((i) => i.echo.point.at)].map(merc);
    if (pts.length === 0) return null;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    // One scale for both axes, so the shape is true; a floor so a walk is not a dot.
    const span = Math.max((x1 - x0) / (W - 2 * PAD), (y1 - y0) / (H - 2 * PAD), 2e-6);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    return (at: LatLng) => {
      const m = merc(at);
      return { x: W / 2 + (m.x - cx) / span, y: H / 2 + (m.y - cy) / span };
    };
  }, [line, items]);

  if (!project) return null;

  const routePath = line
    .map((p, i) => {
      const { x, y } = project(p);
      return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join("");
  let landPath = "";
  for (const ring of land) {
    let prev: number | null = null;
    for (const [lng, lat] of ring) {
      const { x, y } = project({ lat, lng });
      landPath += `${prev === null || Math.abs(lng - prev) > 180 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      prev = lng;
    }
    landPath += "Z";
  }

  return (
    <svg
      className="plan-map"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Map of ${route.name ?? "the route"}: ${items.length} ${items.length === 1 ? "echo" : "echoes"}, ${
        items.filter((i) => chosen.has(i.echo.id)).length
      } chosen`}
    >
      <defs>
        <clipPath id="plan-map-clip">
          <rect width={W} height={H} rx="14" />
        </clipPath>
      </defs>
      <g clipPath="url(#plan-map-clip)">
        <rect className="plan-map-sea" width={W} height={H} />
        {landPath && <path className="plan-map-land" d={landPath} />}
        <path className="plan-map-route" d={routePath} />
        {items.map((item, i) => {
          const { x, y } = project(item.echo.point.at);
          const on = chosen.has(item.echo.id);
          return (
            <g
              key={item.echo.id}
              className={on ? "plan-map-stop on" : "plan-map-stop"}
              transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
              onClick={() => onPick(item.echo.id)}
            >
              <title>{`${i + 1}. ${item.echo.title}`}</title>
              <circle r="14" className="plan-map-hit" />
              <circle r="9" />
              <text dy="3.5">{i + 1}</text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
