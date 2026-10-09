/**
 * "Can I search by zip code?" (James, 2026-10-09). A ZIP code, or a place the library
 * knows by name, moves the map there so its echoes can be browsed from anywhere.
 *
 * Browsing is not being there. Syncing an echo still means standing at it; this only
 * changes where the map is looking (`lookAt` in `App.tsx`).
 *
 * ZIP codes come from the Census Bureau's ZCTA Gazetteer (`public/zips.csv`, built by
 * `scripts/build-zips.mjs`): public domain, on our own server, no geocoding service, no
 * key, no request leaving the app with what somebody typed. It is fetched the first time
 * the search is used, so it costs an ordinary load nothing.
 */

import type { Echo, LatLng } from "@echofinders/core";

export interface PlaceHit {
  /** What the list shows, and what the map says it is looking at. */
  readonly label: string;
  readonly detail: string;
  readonly at: LatLng;
}

let zips: Promise<Map<string, LatLng>> | null = null;

/** Every US ZIP code's centre. Fetched once; an empty map if it cannot be had. */
export function loadZips(): Promise<Map<string, LatLng>> {
  zips ??= fetch("/zips.csv")
    .then((r) => (r.ok ? r.text() : ""))
    .then((text) => {
      const out = new Map<string, LatLng>();
      for (const line of text.split("\n").slice(1)) {
        const [zip, lat, lng] = line.split(",");
        if (zip && zip.length === 5 && lat && lng) out.set(zip, { lat: Number(lat), lng: Number(lng) });
      }
      return out;
    })
    .catch(() => new Map());
  return zips;
}

/** The first part of a place's name: "Bellamy Mansion Museum" from the full address. */
const short = (place: string) => place.split(",")[0]!.trim();

/**
 * What a query finds: a ZIP code (all five digits, or the start of one), and places in the
 * library whose name or town contains the words typed. A handful, nearest-to-exact first.
 */
export function searchPlaces(
  query: string,
  zipTable: ReadonlyMap<string, LatLng>,
  library: readonly Echo[],
  limit = 6,
): PlaceHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const hits: PlaceHit[] = [];

  if (/^\d{2,5}$/.test(q)) {
    for (const [zip, at] of zipTable) {
      if (!zip.startsWith(q)) continue;
      const near = library.filter((e) => roughKm(at, e.point.at) <= 25).length;
      hits.push({ label: `ZIP ${zip}`, detail: near ? `${near} ${near === 1 ? "echo" : "echoes"} within 25 km` : "No echoes near here yet", at });
      if (hits.length >= limit) break;
    }
    return hits;
  }

  // Places: one hit per distinct place name, at its first echo.
  const seen = new Set<string>();
  for (const echo of library) {
    const place = echo.point.place;
    if (!place.toLowerCase().includes(q) || seen.has(short(place))) continue;
    seen.add(short(place));
    const town = place.split(",").slice(-2).join(",").trim();
    hits.push({ label: short(place), detail: town === short(place) ? "" : town, at: echo.point.at });
    if (hits.length >= limit) break;
  }
  return hits;
}

/** Near enough for "is anything within 25 km": flat-earth, which is fine at that range. */
function roughKm(a: LatLng, b: LatLng): number {
  const x = (b.lng - a.lng) * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const y = b.lat - a.lat;
  return Math.sqrt(x * x + y * y) * 111.32;
}
