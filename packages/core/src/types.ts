/**
 * The SkyStories domain model.
 *
 * The product is location-aware audio storytelling. A flight is one way to move across a
 * landscape; a car, a bicycle and a pair of shoes are others. The engine is written against
 * a *journey* rather than a flight, because the underlying question is identical in every
 * case — what is worth saying about the place you are passing, and when — and because the
 * differences that do exist are quantitative (speed, corridor width, how long a story stays
 * relevant) rather than structural. Those live in `MODE_PRESETS`.
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

/**
 * How the listener is moving. This is the single most important input to the engine after
 * position itself: it changes speed by two orders of magnitude, corridor width by three,
 * and how long a story remains relevant by roughly ten.
 */
export const TRAVEL_MODES = ["flight", "rail", "driving", "cycling", "walking"] as const;

export type TravelMode = (typeof TRAVEL_MODES)[number];

/** True when the listener could plausibly reach out and touch the subject. */
export function isOnFoot(mode: TravelMode): boolean {
  return mode === "walking" || mode === "cycling";
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
  /**
   * Recognisable at a distance: a coastline, a canyon, a mountain, a city grid. Works
   * from the air, from a train window and from a car.
   */
  | "landmark-visible"
  /**
   * Immediately present — a building, a plaque, a doorway, a specific tree. Perfect on
   * foot, glimpsed at best from a car, and meaningless from 35,000 feet. A story marked
   * this way is scored almost entirely by whether the listener can actually stop and look.
   */
  | "at-hand"
  /** You are there, but there is nothing to see. Most history lives here. */
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
   * How far off the route this story is still worth playing, in km.
   *
   * Kilometres throughout, including the fractional values a walking tour needs — a blue
   * plaque is 0.05, a neighbourhood 0.5, a city 60. One unit everywhere is worth the
   * slightly awkward decimals: every distance in the geometry code is in kilometres, and
   * a second unit in the content files is exactly how a 1,000× error gets shipped.
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
// Journeys
// ---------------------------------------------------------------------------

export interface Waypoint {
  readonly at: LatLng;
  readonly name?: string;
}

export interface Journey {
  readonly id: string;
  readonly mode: TravelMode;
  readonly origin: Place;
  readonly destination: Place;
  /**
   * Ordered waypoints from origin to destination, inclusive of both.
   *
   * For a flight these are few and far apart, and the engine joins them along great
   * circles. For a drive or a walk they are dense, because the route follows roads and
   * paths rather than the shortest line — the geometry code makes no distinction, it just
   * gets more points.
   */
  readonly waypoints: readonly Waypoint[];
  /** Scheduled departure, ISO 8601 with offset. */
  readonly departureAt: string;
  /** Expected total duration in seconds, door to door. */
  readonly durationS: number;
  /** Flight only. */
  readonly cruiseAltitudeFt?: number;
}

export interface Place {
  readonly name: string;
  readonly at: LatLng;
  /** IANA zone, for the day/night and local-hour rules. */
  readonly timeZone: string;
  /** Airport IATA code, station code, or similar. Absent for a street corner. */
  readonly code?: string;
}

/** Where the aircraft is, however we came to know it. */
export interface Position {
  readonly at: LatLng;
  readonly altitudeFt?: number;
  readonly speedKph?: number;
  readonly headingDeg?: number;
  /** Epoch milliseconds. */
  readonly timestamp: number;
  readonly source: PositionSourceKind;
}

export type PositionSourceKind = "aircraft-feed" | "device-gnss" | "dead-reckoned";

/**
 * Coarse phase of a journey, named generically because the same five shapes appear in
 * every mode — they just differ in length.
 *
 * On a flight, `settling` is taxi and climb (nobody wants a narrator during the safety
 * briefing) and `arriving` is the descent. On a walking tour both collapse to under a
 * minute: the listener puts their headphones in and wants to start.
 */
export type JourneyPhase = "not-started" | "settling" | "underway" | "arriving" | "arrived";

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
  /** Roughly how much of the journey should be audio rather than silence. */
  readonly density?: ListeningDensity;
  /** Story IDs already heard, on this or an earlier journey. Never repeated. */
  readonly heardStoryIds?: readonly string[];
}

/**
 * How chatty the journey should be.
 *
 * What these mean in practice is mode-dependent, and the difference is large: silence on a
 * three-hour flight is restful, whereas silence on a forty-minute walking tour just feels
 * like the app is broken. The actual duty cycles live in `MODE_PRESETS`.
 */
export type ListeningDensity = "light" | "balanced" | "immersive";

// ---------------------------------------------------------------------------
// Scheduling output
// ---------------------------------------------------------------------------

/** A story placed on the journey's timeline. */
export interface ScheduledStory {
  readonly story: Story;
  /** Seconds after departure when playback begins. */
  readonly startS: number;
  readonly endS: number;
  /** Seconds after departure when the listener is nearest this story. */
  readonly nearestS: number;
  /** Perpendicular distance from the route, km. */
  readonly crossTrackKm: number;
  readonly score: number;
}

export interface Playlist {
  readonly journeyId: string;
  readonly items: readonly ScheduledStory[];
  /** Ranked but unscheduled — the reserve the client draws on when a filter changes. */
  readonly reserve: readonly Story[];
  readonly totalAudioS: number;
  readonly journeyDurationS: number;
  readonly mode: TravelMode;
}
