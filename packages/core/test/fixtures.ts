import type { FlightPlan, ListenerProfile, Source, Story, StoryCategory, StoryFormat } from "../src/types.js";
import { NOMINAL_DURATION_S } from "../src/types.js";
import { buildRouteGeometry, pointAtDistance } from "../src/geo/corridor.js";

export const JFK_MIA: FlightPlan = {
  id: "test-jfk-mia",
  origin: {
    iata: "JFK",
    name: "John F. Kennedy International",
    at: { lat: 40.6413, lng: -73.7781 },
    timeZone: "America/New_York",
  },
  destination: {
    iata: "MIA",
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
