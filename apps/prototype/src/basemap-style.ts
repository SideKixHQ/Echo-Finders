/**
 * The navy map, as a MapLibre style over Protomaps vector tiles.
 *
 * James chose this on 2026-10-09 from screenshots of three options: our own navy style, the
 * stock Protomaps dark flavour, and the Esri grey canvas the app had been drawing through a
 * colour filter. Esri had to go before the app takes money: its tiles are licensed for
 * development and light use, and a paid app on them is a bill nobody had priced
 * (`docs/02-costs.md`).
 *
 * The colours are the board's (`design/`), drawn directly rather than filtered out of
 * someone else's grey: land is not painted at all, so the app's own `mapField` gradient
 * shows through as the ground, and water, parks, buildings and roads step up from it in
 * the same indigo the board draws its streets in. The light scheme keeps a light map.
 *
 * The layer names and `kind` values are the Protomaps basemap tile schema, v4
 * (`@protomaps/basemaps`): `water`, `landcover`, `landuse`, `buildings`, `roads`, `places`.
 */

import type { StyleSpecification, LayerSpecification, ExpressionSpecification } from "maplibre-gl";

export type MapTheme = "dark" | "light";

interface Palette {
  readonly water: string;
  readonly wild: string;
  readonly park: string;
  readonly plaza: string;
  readonly building: string;
  readonly buildingLine: string;
  readonly path: string;
  readonly service: string;
  readonly minor: string;
  readonly major: string;
  readonly highway: string;
  /** Light only: a hairline either side of a road so white roads read on a pale ground. */
  readonly casing: string | null;
  readonly rail: string;
  readonly label: string;
  readonly halo: string;
}

const PALETTE: Record<MapTheme, Palette> = {
  dark: {
    water: "#18245c",
    wild: "#0f1739",
    park: "#12313a",
    plaza: "#131a40",
    building: "#1a2152",
    buildingLine: "#242e68",
    path: "#1a2251",
    service: "#1f2856",
    minor: "#28326c",
    major: "#36428a",
    highway: "#4150a0",
    casing: null,
    rail: "#262f66",
    label: "#5f6aa8",
    halo: "#0b0f2b",
  },
  light: {
    water: "#c6d3e0",
    wild: "#e9ece9",
    park: "#d9e6d4",
    plaza: "#ebedf0",
    building: "#e1e4ea",
    buildingLine: "#d0d4dc",
    path: "#d8dce3",
    service: "#ffffff",
    minor: "#ffffff",
    major: "#ffffff",
    highway: "#fdfdfd",
    casing: "#cfd4dc",
    rail: "#c3c8d1",
    label: "#7a8296",
    halo: "#ffffff",
  },
};

/** Line width that grows with zoom: thin at the city view, a street's width on foot. */
const width = (z13: number, z16: number, z18: number, extra = 0): ExpressionSpecification => [
  "interpolate",
  ["exponential", 1.6],
  ["zoom"],
  13,
  z13 + extra,
  16,
  z16 + extra,
  18,
  z18 + extra,
];

const notTunnel: ExpressionSpecification = ["!", ["has", "is_tunnel"]];
const kind = (...kinds: string[]): ExpressionSpecification => ["in", ["get", "kind"], ["literal", kinds]];

/** The one font, self-hosted: Latin, Latin Extended and punctuation (`public/fonts`). */
export const FONT = "Noto Sans Medium";

/**
 * The style for a given theme, reading tiles from `tiles` (a `pmtiles://` URL) and glyphs
 * from `glyphs` (a URL template with `{fontstack}` and `{range}`).
 */
export function basemapStyle(tiles: string, glyphs: string, theme: MapTheme): StyleSpecification {
  const p = PALETTE[theme];
  const roads: [id: string, filter: ExpressionSpecification, w: [number, number, number], colour: string][] = [
    ["service", ["all", kind("minor_road"), ["==", ["get", "kind_detail"], "service"]], [0.3, 1.6, 5], p.service],
    ["minor", ["all", kind("minor_road"), ["!=", ["get", "kind_detail"], "service"]], [0.6, 3.2, 11], p.minor],
    ["major", kind("major_road"), [1.2, 5, 15], p.major],
    ["highway", kind("highway"), [1.6, 6, 17], p.highway],
  ];

  const layers: LayerSpecification[] = [
    // No background and no `earth`: the land is the app's own field, painted underneath.
    {
      id: "wild",
      type: "fill",
      source: "base",
      "source-layer": "landcover",
      filter: kind("forest", "scrub", "grassland", "wetland", "wood"),
      paint: { "fill-color": p.wild, "fill-opacity": 0.8 },
    },
    {
      id: "park",
      type: "fill",
      source: "base",
      "source-layer": "landuse",
      filter: kind(
        "park",
        "national_park",
        "nature_reserve",
        "protected_area",
        "cemetery",
        "garden",
        "golf_course",
        "grass",
        "playground",
        "pitch",
        "village_green",
        "allotments",
        "dog_park",
        "recreation_ground",
      ),
      paint: { "fill-color": p.park, "fill-opacity": 0.75 },
    },
    {
      id: "plaza",
      type: "fill",
      source: "base",
      "source-layer": "landuse",
      filter: kind("pedestrian", "pier"),
      paint: { "fill-color": p.plaza },
    },
    {
      id: "water",
      type: "fill",
      source: "base",
      "source-layer": "water",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": p.water },
    },
    {
      id: "water-line",
      type: "line",
      source: "base",
      "source-layer": "water",
      filter: ["all", ["==", ["geometry-type"], "LineString"], kind("river", "stream", "canal")],
      paint: { "line-color": p.water, "line-width": 1.5 },
    },
    {
      id: "buildings",
      type: "fill",
      source: "base",
      "source-layer": "buildings",
      minzoom: 14,
      filter: kind("building", "building_part"),
      paint: {
        "fill-color": p.building,
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0.25, 16, 0.6],
        "fill-outline-color": p.buildingLine,
      },
    },
    {
      id: "path",
      type: "line",
      source: "base",
      "source-layer": "roads",
      minzoom: 15,
      filter: ["all", notTunnel, kind("path", "other")],
      paint: {
        "line-color": p.path,
        "line-width": width(0.3, 0.8, 1.6),
        ...(theme === "light" ? { "line-dasharray": [2, 1.5] } : {}),
      },
    },
    {
      id: "rail",
      type: "line",
      source: "base",
      "source-layer": "roads",
      filter: ["all", notTunnel, kind("rail")],
      paint: { "line-color": p.rail, "line-width": 1, "line-dasharray": [3, 2] },
    },
    {
      id: "tunnels",
      type: "line",
      source: "base",
      "source-layer": "roads",
      filter: ["all", ["has", "is_tunnel"], kind("highway", "major_road", "minor_road")],
      paint: {
        "line-color": p.minor,
        "line-opacity": 0.45,
        "line-width": width(0.6, 2.4, 6),
        "line-dasharray": [1.5, 1.2],
      },
    },
  ];

  const roadFilter = (f: ExpressionSpecification): ExpressionSpecification => ["all", notTunnel, f];
  const join = { "line-join": "round", "line-cap": "round" } as const;
  if (p.casing) {
    for (const [id, f, w] of roads) {
      layers.push({
        id: `${id}-casing`,
        type: "line",
        source: "base",
        "source-layer": "roads",
        filter: roadFilter(f),
        layout: join,
        paint: { "line-color": p.casing, "line-width": width(...w, 1.4) },
      });
    }
  }
  for (const [id, f, w, colour] of roads) {
    layers.push({
      id,
      type: "line",
      source: "base",
      "source-layer": "roads",
      filter: roadFilter(f),
      layout: join,
      paint: { "line-color": colour, "line-width": width(...w) },
    });
  }

  const text = {
    "text-color": p.label,
    "text-halo-color": p.halo,
    "text-halo-width": 1.4,
  } as const;
  layers.push(
    {
      // Street names on foot, quiet and in capitals, in the board's label ink.
      id: "road-labels",
      type: "symbol",
      source: "base",
      "source-layer": "roads",
      minzoom: 14,
      filter: ["all", kind("highway", "major_road", "minor_road"), ["has", "name"]],
      layout: {
        "symbol-placement": "line",
        "text-field": ["get", "name"],
        "text-font": [FONT],
        "text-size": 10,
        "text-transform": "uppercase",
        "text-letter-spacing": 0.06,
        "text-max-angle": 30,
        "symbol-spacing": 320,
      },
      paint: text,
    },
    {
      // Towns from the air and the road, where a street name means nothing.
      id: "places",
      type: "symbol",
      source: "base",
      "source-layer": "places",
      minzoom: 5,
      maxzoom: 13,
      filter: kind("locality"),
      layout: {
        "text-field": ["get", "name"],
        "text-font": [FONT],
        "text-size": ["interpolate", ["linear"], ["zoom"], 5, 10, 12, 13],
        "text-letter-spacing": 0.04,
        "symbol-sort-key": ["coalesce", ["get", "min_zoom"], 99],
      },
      paint: text,
    },
  );

  return {
    version: 8,
    glyphs,
    sources: {
      base: {
        type: "vector",
        url: tiles,
        // The tiles' own credit. Shown by the app (`MAP_ATTRIBUTION`), not by MapLibre's control.
        attribution: "© OpenStreetMap",
      },
    },
    layers,
  };
}
