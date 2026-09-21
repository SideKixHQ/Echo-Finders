import type { Journey, ListenerProfile, Source, Story, StoryCategory, StoryFormat } from "../src/types.js";
import { NOMINAL_DURATION_S } from "../src/types.js";
import { buildRouteGeometry, pointAtDistance } from "../src/geo/corridor.js";
import { presetFor } from "../src/modes.js";

export const JFK_MIA: Journey = {
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
  // Midday departure, so daylight-dependent stories are not suppressed by default.
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

export function makeStory(overrides: Partial<Story> & Pick<Story, "id" | "at">): Story {
  const format: StoryFormat = overrides.format ?? "short";
  const category: StoryCategory = overrides.category ?? "history";
  return {
    title: `Story ${overrides.id}`,
    summary: `Summary for ${overrides.id}`,
    triggerRadiusKm: 60,
    place: "Somewhere",
    category,
    format,
    durationS: NOMINAL_DURATION_S[format],
    minAge: 0,
    quality: 0.8,
    visibility: "position-only",
    sources: [SOURCE],
    editorial: "approved",
    factCheck: "corroborated",
    audioKey: `audio/${overrides.id}.opus`,
    ...overrides,
  };
}

/**
 * Stories spread evenly down the flight path, so scheduling tests have a dense corridor
 * to work with rather than a handful of clustered points.
 *
 * Placed along the *actual* route geometry rather than a straight line between the
 * endpoints. The two are not the same thing: JFK–MIA tracks out over the Atlantic and
 * rejoins the coast near Myrtle Beach, some 190km east of the direct line, so a naive
 * fixture would sit outside the corridor and be correctly rejected by the engine.
 */
export function storiesAlongJfkMia(
  count: number,
  categories: readonly StoryCategory[] = ["history", "famous-people", "nature-science", "culture-food"],
): Story[] {
  const geometry = buildRouteGeometry(JFK_MIA);

  return Array.from({ length: count }, (_, i) => {
    const at = pointAtDistance(geometry, ((i + 0.5) / count) * geometry.totalKm);
    // A little lateral scatter, alternating side of the track, so proximity scores vary
    // rather than every story sitting exactly on the centreline.
    const offsetDeg = ((i % 5) - 2) * 0.08;

    return makeStory({
      id: `story-${String(i).padStart(3, "0")}`,
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
 * radii are metres rather than kilometres, and a story that plays ninety seconds late is
 * about a building the listener can no longer see.
 */
export const MANHATTAN_WALK: Journey = {
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
export const PARKWAY_DRIVE: Journey = {
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

/** Stories placed along an arbitrary journey's real geometry, at a mode-appropriate scale. */
export function storiesAlong(
  journey: Journey,
  count: number,
  overrides: Partial<Story> = {},
): Story[] {
  const geometry = buildRouteGeometry(journey);
  const radius = overrides.triggerRadiusKm ?? presetFor(journey.mode).typicalTriggerRadiusKm;

  return Array.from({ length: count }, (_, i) => {
    const at = pointAtDistance(geometry, ((i + 0.5) / count) * geometry.totalKm);
    return makeStory({
      id: `${journey.mode}-story-${String(i).padStart(3, "0")}`,
      at,
      triggerRadiusKm: radius,
      category: (["history", "famous-people", "culture-food", "landmarks"] as const)[i % 4]!,
      ...overrides,
    });
  });
}
