/**
 * The SkyStories domain model.
 *
 * A story is deliberately split into three independent records: the sourced facts, the
 * script written from them, and the audio rendered from that script. Keeping them apart
 * is what lets us correct a fact without re-recording, or re-voice the whole library
 * without touching a word of editorial. See docs/adr/0005-content-in-git.md.
 */

export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export const STORY_CATEGORIES = [
  "history",
  "true-crime",
  "famous-people",
  "nature-science",
  "culture-food",
  "local-legends",
  "landmarks",
  "attractions",
  "music",
  "industry",
  "kids",
] as const;

export type StoryCategory = (typeof STORY_CATEGORIES)[number];

/** Categories that must never play unless the passenger has explicitly opted in. */
export const OPT_IN_CATEGORIES: readonly StoryCategory[] = ["true-crime"];

/**
 * How long the piece runs. Three fixed shapes rather than free-form duration, because a
 * scheduler that can assume "roughly 30s, 90s or 3min" produces far better-paced flights
 * than one juggling arbitrary lengths.
 */
export type StoryFormat = "look-below" | "short" | "feature";

export const NOMINAL_DURATION_S: Record<StoryFormat, number> = {
  "look-below": 30,
  short: 90,
  feature: 210,
};

/** Editorial state. Only `approved` may ever reach a passenger. */
export type EditorialStatus = "draft" | "in-review" | "approved" | "retired";

/** How confident we are in the facts, set by the human reviewer, never by a model. */
export type FactCheckStatus = "unchecked" | "single-source" | "corroborated" | "disputed";

/**
 * Whether the thing being described can actually be seen from the aircraft. Drives both
 * scoring and the wording of the script — "look out of the left side" is a lie if the
 * subject is a battlefield that looks like a field.
 */
export type Visibility =
  /** Recognisable from altitude: coastline, canyon, lake, major city grid. */
  | "landmark-visible"
  /** You are over it, but there is nothing to see. Most history lives here. */
  | "position-only"
  /** Needs daylight and clear skies to be worth mentioning. */
  | "daylight-dependent";

// ---------------------------------------------------------------------------
// Sourcing — the audit trail behind every claim
// ---------------------------------------------------------------------------

export interface Source {
  readonly title: string;
  readonly publisher: string;
  readonly url?: string;
  /** ISO date the source was retrieved. Sources move and vanish; we record when we looked. */
  readonly retrievedAt: string;
  /** What we are allowed to do with it. Blocks publication when unresolved. */
  readonly rights: "public-domain" | "cc-by" | "cc-by-sa" | "licensed" | "fair-use-facts";
}

/**
 * Extra obligations attached to the riskiest category. A true-crime story that does not
 * satisfy every one of these cannot be published; see `validateStory`.
 */
export interface TrueCrimeReview {
  /** Anyone named who is still alive, which raises the review bar sharply. */
  readonly involvesLivingPeople: boolean;
  /** Distinguishes "was convicted of" from "was accused of". Getting this wrong is defamation. */
  readonly convictionStatus: "convicted" | "alleged" | "unsolved" | "exonerated";
  /** Named human who signed off. Never a model, never a team, never blank. */
  readonly reviewedBy: string;
  readonly reviewedAt: string;
  /** Warning read before the story begins. */
  readonly contentWarning: string;
}

// ---------------------------------------------------------------------------
// The story record
// ---------------------------------------------------------------------------

export interface Story {
  readonly id: string;
  readonly title: string;
  /** One line, shown on the map pin. */
  readonly summary: string;

  readonly at: LatLng;
  /**
   * How far off the flight path this story is still worth playing, in km. Generous by
   * design: position is approximate (ADR-0002) and a city is interesting from 60km away.
   */
  readonly triggerRadiusKm: number;
  /** Human-readable anchor: "Savannah, Georgia". Used in the script and on the pin. */
  readonly place: string;

  readonly category: StoryCategory;
  readonly format: StoryFormat;
  /** Actual runtime of the rendered audio. Falls back to the format's nominal length. */
  readonly durationS: number;

  /** Minimum passenger age. The kids filter and the family age gate both read this. */
  readonly minAge: number;
  /** Editorial quality, 0–1. Set by the reviewer; the strongest single scoring input. */
  readonly quality: number;

  readonly visibility: Visibility;
  /** If set, only play between these local hours — a "see the lights" story needs night. */
  readonly hours?: { readonly fromHour: number; readonly toHour: number };

  readonly sources: readonly Source[];
  readonly editorial: EditorialStatus;
  readonly factCheck: FactCheckStatus;
  readonly trueCrimeReview?: TrueCrimeReview;

  /** Audio asset key in object storage. Absent while the story is still text. */
  readonly audioKey?: string;
  /** Size of the rendered audio in bytes. Drives the route package budget. */
  readonly audioBytes?: number;
  readonly transcript?: string;
  readonly imageKey?: string;

  /** A place a passenger can actually go, for save-for-later (ADR-0004). */
  readonly attraction?: Attraction;

  /** Stories covering the same subject, so we never play both on one flight. */
  readonly relatedIds?: readonly string[];
  /** Free-form tags for interest matching. */
  readonly tags?: readonly string[];
}

export interface Attraction {
  readonly name: string;
  readonly at: LatLng;
  /** Google Places ID, resolved at content build time, never in flight. */
  readonly googlePlaceId?: string;
  readonly rating?: number;
  readonly url?: string;
}

// ---------------------------------------------------------------------------
// Flights
// ---------------------------------------------------------------------------

export interface Waypoint {
  readonly at: LatLng;
  readonly name?: string;
}

export interface FlightPlan {
  readonly id: string;
  readonly origin: Airport;
  readonly destination: Airport;
  /** Ordered waypoints from origin to destination, inclusive of both. */
  readonly waypoints: readonly Waypoint[];
  /** Scheduled departure, ISO 8601 with offset. */
  readonly departureAt: string;
  /** Scheduled block time in seconds, gate to gate. */
  readonly durationS: number;
  readonly cruiseAltitudeFt?: number;
}

export interface Airport {
  readonly iata: string;
  readonly name: string;
  readonly at: LatLng;
  /** IANA zone, for the day/night and local-hour rules. */
  readonly timeZone: string;
}

/** Where the aircraft is, however we came to know it. */
export interface Position {
  readonly at: LatLng;
  readonly altitudeFt?: number;
  readonly groundSpeedKts?: number;
  readonly headingDeg?: number;
  /** Epoch milliseconds. */
  readonly timestamp: number;
  readonly source: PositionSourceKind;
}

export type PositionSourceKind = "aircraft-feed" | "device-gnss" | "dead-reckoned";

/** Coarse phase of flight. Stories are held back until the cabin has settled. */
export type FlightPhase = "pre-departure" | "climb" | "cruise" | "descent" | "arrived";

// ---------------------------------------------------------------------------
// Passenger preferences
// ---------------------------------------------------------------------------

export interface ListenerProfile {
  /** Categories the passenger wants. Opt-in categories are absent unless chosen. */
  readonly categories: readonly StoryCategory[];
  /** Drives the age gate. A family profile sets the youngest listener present. */
  readonly age: number;
  /** Tag affinities, 0–1, from onboarding taps. Absent tags score neutral. */
  readonly interests?: Readonly<Record<string, number>>;
  /** Roughly how much of the flight should be audio rather than silence. */
  readonly density?: ListeningDensity;
  /** Story IDs already heard, on this or an earlier flight. Never repeated. */
  readonly heardStoryIds?: readonly string[];
}

/** How chatty the flight should be. Silence is a feature; most people want less than we think. */
export type ListeningDensity = "light" | "balanced" | "immersive";

export const DENSITY_DUTY_CYCLE: Record<ListeningDensity, number> = {
  light: 0.2,
  balanced: 0.4,
  immersive: 0.65,
};

// ---------------------------------------------------------------------------
// Scheduling output
// ---------------------------------------------------------------------------

/** A story placed on the flight's timeline. */
export interface ScheduledStory {
  readonly story: Story;
  /** Seconds after departure when playback begins. */
  readonly startS: number;
  readonly endS: number;
  /** Seconds after departure when the aircraft is nearest this story. */
  readonly nearestS: number;
  /** Perpendicular distance from the flight path, km. */
  readonly crossTrackKm: number;
  readonly score: number;
}

export interface Playlist {
  readonly flightId: string;
  readonly items: readonly ScheduledStory[];
  /** Ranked but unscheduled — the reserve the client draws on when a filter changes. */
  readonly reserve: readonly Story[];
  readonly totalAudioS: number;
  readonly flightDurationS: number;
}
