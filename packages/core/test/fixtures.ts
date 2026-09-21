import type {
  Echo,
  EchoCategory,
  EchoFormat,
  EchoPoint,
  LatLng,
  ListenerProfile,
  Route,
  Source,
} from "../src/types.js";
import { NOMINAL_DURATION_S } from "../src/types.js";
import { buildRouteGeometry, pointAtDistance } from "../src/geo/corridor.js";
import { presetFor } from "../src/modes.js";

export const JFK_MIA: Route = {
  id: "test-jfk-mia",
  mode: "flight",
  origin: {
    code: "JFK",
    name: "John F. Kennedy International",
    at: { lat: 40.6413, lng: -73.7781 },
    timeZone: "America/New_York",
  },
  destination: {
    code: "MIA",
    name: "Miami International",
    at: { lat: 25.7959, lng: -80.287 },
    timeZone: "America/New_York",
  },
  waypoints: [
    { at: { lat: 40.6413, lng: -73.7781 }, name: "JFK" },
    { at: { lat: 39.36, lng: -74.42 }, name: "Atlantic City" },
    { at: { lat: 36.85, lng: -76.0 }, name: "Norfolk" },
    { at: { lat: 33.69, lng: -78.89 }, name: "Myrtle Beach" },
    { at: { lat: 30.33, lng: -81.65 }, name: "Jacksonville" },
    { at: { lat: 25.7959, lng: -80.287 }, name: "MIA" },
  ],
  // Midday departure, so daylight-dependent echoes are not suppressed by default.
  departureAt: "2026-06-15T14:00:00Z",
  durationS: 10_800,
  cruiseAltitudeFt: 35_000,
};

const SOURCE: Source = {
  title: "Test source",
  publisher: "National Park Service",
  url: "https://www.nps.gov/",
  retrievedAt: "2026-09-01",
  rights: "public-domain",
};

/**
 * Test-facing shape for building an echo.
 *
 * Deliberately flatter than `Echo` itself: a test that only cares where something is
 * should say `at`, not spell out a whole `EchoPoint`. Spreading an existing echo works
 * too, so `makeEcho({ ...other, id: "x" })` keeps its point.
 */
export type EchoDraft = Partial<Omit<Echo, "point">> & {
  id: string;
  at?: LatLng;
  point?: EchoPoint;
  triggerRadiusKm?: number;
  place?: string;
};

export function makeEcho(draft: EchoDraft): Echo {
  const format: EchoFormat = draft.format ?? "short";
  const category: EchoCategory = draft.category ?? "history";

  const at = draft.at ?? draft.point?.at;
  if (!at) throw new Error(`makeEcho(${draft.id}) needs either at or point`);

  const point: EchoPoint = {
    at,
    triggerRadiusKm: draft.triggerRadiusKm ?? draft.point?.triggerRadiusKm ?? 60,
    place: draft.place ?? draft.point?.place ?? "Somewhere",
  };

  const { at: _at, triggerRadiusKm: _r, place: _p, point: _point, ...rest } = draft;

  return {
    title: `Echo ${draft.id}`,
    summary: `Summary for ${draft.id}`,
    category,
    format,
    durationS: NOMINAL_DURATION_S[format],
    minAge: 0,
    quality: 0.8,
    visibility: "position-only",
    sources: [SOURCE],
    editorial: "approved",
    factCheck: "corroborated",
    certainty: "documented",
    audioKey: `audio/${draft.id}.opus`,
    ...rest,
    point,
  };
}

/**
 * Echoes spread evenly down the flight path, so scheduling tests have a dense corridor
 * to work with rather than a handful of clustered points.
 *
 * Placed along the *actual* route geometry rather than a straight line between the
 * endpoints. The two are not the same thing: JFK–MIA tracks out over the Atlantic and
 * rejoins the coast near Myrtle Beach, some 190km east of the direct line, so a naive
 * fixture would sit outside the corridor and be correctly rejected by the engine.
 */
export function echoesAlongJfkMia(
  count: number,
  categories: readonly EchoCategory[] = ["history", "famous-people", "nature-science", "culture-food"],
): Echo[] {
  const geometry = buildRouteGeometry(JFK_MIA);

  return Array.from({ length: count }, (_, i) => {
    const at = pointAtDistance(geometry, ((i + 0.5) / count) * geometry.totalKm);
    // A little lateral scatter, alternating side of the track, so proximity scores vary
    // rather than every echo sitting exactly on the centreline.
    const offsetDeg = ((i % 5) - 2) * 0.08;

    return makeEcho({
      id: `echo-${String(i).padStart(3, "0")}`,
      at: { lat: at.lat + offsetDeg, lng: at.lng },
      category: categories[i % categories.length]!,
      quality: 0.7 + (i % 3) * 0.1,
    });
  });
}

export const ADULT: ListenerProfile = {
  categories: ["history", "famous-people", "nature-science", "culture-food", "landmarks", "music"],
  age: 35,
};

export const CHILD: ListenerProfile = {
  categories: ["kids", "nature-science", "history"],
  age: 7,
};

export const TRUE_CRIME_FAN: ListenerProfile = {
  categories: ["true-crime", "history"],
  age: 35,
};

/**
 * A walking tour of lower Manhattan: about two kilometres, forty minutes, following
 * streets rather than a straight line.
 *
 * Deliberately the hardest case for the engine. Everything is close together, the trigger
 * radii are metres rather than kilometres, and a echo that plays ninety seconds late is
 * about a building the listener can no longer see.
 */
export const MANHATTAN_WALK: Route = {
  id: "test-manhattan-walk",
  mode: "walking",
  origin: {
    name: "Battery Park",
    at: { lat: 40.7033, lng: -74.017 },
    timeZone: "America/New_York",
  },
  destination: {
    name: "City Hall Park",
    at: { lat: 40.7127, lng: -74.006 },
    timeZone: "America/New_York",
  },
  waypoints: [
    { at: { lat: 40.7033, lng: -74.017 }, name: "Battery Park" },
    { at: { lat: 40.7046, lng: -74.0132 }, name: "Bowling Green" },
    { at: { lat: 40.7069, lng: -74.0113 }, name: "Wall Street" },
    { at: { lat: 40.7089, lng: -74.0101 }, name: "Federal Hall" },
    { at: { lat: 40.7115, lng: -74.0077 }, name: "St Paul's Chapel" },
    { at: { lat: 40.7127, lng: -74.006 }, name: "City Hall Park" },
  ],
  departureAt: "2026-06-15T14:00:00Z",
  durationS: 2400,
};

/** A drive down the Blue Ridge Parkway: slower than a flight, wider than a walk. */
export const PARKWAY_DRIVE: Route = {
  id: "test-parkway-drive",
  mode: "driving",
  origin: {
    name: "Asheville, North Carolina",
    at: { lat: 35.5951, lng: -82.5515 },
    timeZone: "America/New_York",
  },
  destination: {
    name: "Boone, North Carolina",
    at: { lat: 36.2168, lng: -81.6746 },
    timeZone: "America/New_York",
  },
  waypoints: [
    { at: { lat: 35.5951, lng: -82.5515 }, name: "Asheville" },
    { at: { lat: 35.7654, lng: -82.2651 }, name: "Mount Mitchell" },
    { at: { lat: 35.9606, lng: -82.0713 }, name: "Linville Falls" },
    { at: { lat: 36.1015, lng: -81.8164 }, name: "Grandfather Mountain" },
    { at: { lat: 36.2168, lng: -81.6746 }, name: "Boone" },
  ],
  departureAt: "2026-06-15T14:00:00Z",
  durationS: 9000,
};

/** Echoes placed along an arbitrary route's real geometry, at a mode-appropriate scale. */
export function echoesAlong(
  route: Route,
  count: number,
  overrides: Partial<EchoDraft> = {},
): Echo[] {
  const geometry = buildRouteGeometry(route);
  const radius = overrides.triggerRadiusKm ?? presetFor(route.mode).typicalTriggerRadiusKm;

  return Array.from({ length: count }, (_, i) => {
    const at = pointAtDistance(geometry, ((i + 0.5) / count) * geometry.totalKm);
    return makeEcho({
      id: `${route.mode}-echo-${String(i).padStart(3, "0")}`,
      at,
      triggerRadiusKm: radius,
      category: (["history", "famous-people", "culture-food", "landmarks"] as const)[i % 4]!,
      ...overrides,
    });
  });
}
