/**
 * The Echo Finders domain model.
 *
 * The product is location-aware audio storytelling. A flight is one way to move across a
 * landscape; a car, a bicycle and a pair of shoes are others. The engine is written against
 * a *route* rather than a flight, because the underlying question is identical in every
 * case — what is worth saying about the place you are passing, and when — and because the
 * differences that do exist are quantitative (speed, corridor width, how long a echo stays
 * relevant) rather than structural. Those live in `MODE_PRESETS`.
 *
 * A echo is deliberately split into three independent records: the sourced facts, the
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
 * and how long a echo remains relevant by roughly ten.
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

export const ECHO_CATEGORIES = [
  "history",
  "true-crime",
  "famous-people",
  "nature-science",
  "culture-food",
  "local-legends",
  "landmarks",
  "attractions",
  /** Somewhere to stay. Commercially useful and genuinely interesting when it has a past. */
  "stay",
  "music",
  "industry",
  "kids",
] as const;

export type EchoCategory = (typeof ECHO_CATEGORIES)[number];

/** Categories that must never play unless the passenger has explicitly opted in. */
export const OPT_IN_CATEGORIES: readonly EchoCategory[] = ["true-crime"];

/**
 * A paid placement.
 *
 * Deliberately *not* a echo category. The design prototype models ads as one more entry
 * in the category list, which is convenient for rendering and wrong for everything else:
 * it means every age gate, interest filter, variety rule and "already heard" check treats
 * a restaurant promotion as editorial content. Ads need their own frequency caps, their
 * own kill switch, and a guarantee they never appear in kids mode — none of which a
 * category can express.
 *
 * So sponsorship is a property a placement has, and placements are scheduled separately
 * from echoes.
 */
export interface Sponsorship {
  /** Shown and read aloud. Never optional: undisclosed advertising is not an option. */
  readonly disclosure: string;
  readonly advertiser: string;
  /** Airlines and operators can block individual advertisers by id. */
  readonly advertiserId: string;
  /** Campaign window, ISO dates. Outside it the placement is not eligible. */
  readonly runsFrom?: string;
  readonly runsUntil?: string;
}

/**
 * How long the piece runs. Three fixed shapes rather than free-form duration, because a
 * scheduler that can assume "roughly 30s, 90s or 3min" produces far better-paced flights
 * than one juggling arbitrary lengths.
 */
export type EchoFormat = "look-below" | "short" | "feature" | "deep";

export const NOMINAL_DURATION_S: Record<EchoFormat, number> = {
  "look-below": 30,
  short: 90,
  feature: 210,
  /**
   * Long-form. The kind of echo someone settles into on a five-hour flight — the whole
   * Donner Pass account, not the headline.
   *
   * These behave differently enough to be worth calling out: a ten-minute echo at cruise
   * covers 1,400km, so it cannot be *centred* on the place it is about. The scheduler
   * anchors long echoes to their opening instead. See `anchorOffsetS`.
   */
  deep: 600,
};

/**
 * Echoes up to this length are centred on the place they describe, so the narration is
 * still running as the listener looks at it. Longer ones are anchored to their opening,
 * because by the end of a ten-minute feature the landscape has changed entirely.
 */
export const CENTRE_ANCHOR_MAX_S = 240;

/** How long before reaching a place a long echo should begin. */
export const LEAD_ANCHOR_S = 60;

/**
 * Where within a echo its "you are here" moment falls, in seconds from the start.
 *
 * Short echo: the middle. Long echo: a minute in, just after the scene is set.
 */
export function anchorOffsetS(durationS: number): number {
  return durationS <= CENTRE_ANCHOR_MAX_S ? durationS / 2 : LEAD_ANCHOR_S;
}

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
   * foot, glimpsed at best from a car, and meaningless from 35,000 feet. A echo marked
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
 * Extra obligations attached to the riskiest category. A true-crime echo that does not
 * satisfy every one of these cannot be published; see `validateEcho`.
 */
export interface TrueCrimeReview {
  /** Anyone named who is still alive, which raises the review bar sharply. */
  readonly involvesLivingPeople: boolean;
  /** Distinguishes "was convicted of" from "was accused of". Getting this wrong is defamation. */
  readonly convictionStatus: "convicted" | "alleged" | "unsolved" | "exonerated";
  /** Named human who signed off. Never a model, never a team, never blank. */
  readonly reviewedBy: string;
  readonly reviewedAt: string;
  /** Warning read before the echo begins. */
  readonly contentWarning: string;
}

// ---------------------------------------------------------------------------
// The echo record
// ---------------------------------------------------------------------------

/**
 * The specific place an echo is connected to — what the map draws as a pin, and what a
 * listener saves for later.
 *
 * It carries the radius as well as the coordinates because "where" is not a point in
 * practice: a blue plaque is meaningful within fifty metres and a city within sixty
 * kilometres, and the same echo is worth playing at very different distances depending on
 * how fast you are moving past it.
 */
export interface EchoPoint {
  readonly at: LatLng;
  /**
   * How far off the route this echo is still worth playing, in km.
   *
   * Kilometres throughout, including the fractional values a walking tour needs — a blue
   * plaque is 0.05, a neighbourhood 0.5, a city 60. One unit everywhere is worth the
   * slightly awkward decimals: every distance in the geometry code is in kilometres, and
   * a second unit in the content files is exactly how a 1,000× error gets shipped.
   */
  readonly triggerRadiusKm: number;
  /** Human-readable anchor: "Savannah, Georgia". Used in the script and on the pin. */
  readonly place: string;
}

/**
 * How firmly the record supports what an echo says.
 *
 * This exists because "we distinguish fact from legend, preserve source information, and
 * clearly identify uncertainty" is only a value if something enforces it. Left to prose,
 * a ghost story and a census record end up sounding equally authoritative in a narrator's
 * voice — and a confident voice is exactly what makes a listener stop checking.
 */
export type Certainty =
  /** The record supports it. Most echoes, and the only kind that may state things plainly. */
  | "documented"
  /** Historians disagree, or the evidence is thin. The script has to say so, out loud. */
  | "contested"
  /** A ghost story, a tall tale, a local legend. True as folklore, not as history. */
  | "legend";

export interface Echo {
  readonly id: string;
  readonly title: string;
  /** One line, shown on the map pin. */
  readonly summary: string;

  /** Where this echo belongs on the Earth. */
  readonly point: EchoPoint;

  readonly category: EchoCategory;
  readonly format: EchoFormat;
  /** Actual runtime of the rendered audio. Falls back to the format's nominal length. */
  readonly durationS: number;

  /** Minimum passenger age. The kids filter and the family age gate both read this. */
  readonly minAge: number;
  /** Editorial quality, 0–1. Set by the reviewer; the strongest single scoring input. */
  readonly quality: number;

  readonly visibility: Visibility;
  /** If set, only play between these local hours — a "see the lights" echo needs night. */
  readonly hours?: { readonly fromHour: number; readonly toHour: number };

  readonly sources: readonly Source[];
  readonly editorial: EditorialStatus;
  readonly factCheck: FactCheckStatus;
  /** How firmly the record supports this. Never inferred — an editor states it. */
  readonly certainty: Certainty;
  /**
   * What exactly is uncertain, and who disagrees. Required whenever `certainty` is not
   * `documented`, because "sources differ" without saying how is not a disclosure.
   */
  readonly certaintyNote?: string;
  readonly trueCrimeReview?: TrueCrimeReview;

  /** One line of teaser copy, shown under the title before playback. */
  readonly teaser?: string;
  /** A second paragraph revealed once the echo has played, for the reader who wants more. */
  readonly detail?: string;

  /** Audio asset key in object storage. Absent while the echo is still text. */
  readonly audioKey?: string;
  /** Size of the rendered audio in bytes. Drives the route package budget. */
  readonly audioBytes?: number;
  /** Sentence-level transcript with timings, for read-along and line seeking. */
  readonly transcript?: Transcript;
  readonly imageKey?: string;

  /**
   * A plainer, shorter telling of the same echo.
   *
   * Serves more people than it first appears: younger listeners, anyone listening in a
   * second language, anyone tired at the end of a long flight, and anyone who simply wants
   * the short version. It is a genuine second asset — its own script, its own audio, its
   * own duration — not the same audio played faster.
   */
  readonly simple?: SimpleVariant;

  /** Paid placement. Absent on editorial content, which is almost all of it. */
  readonly sponsorship?: Sponsorship;

  /** A place a passenger can actually go, for save-for-later (ADR-0004). */
  readonly attraction?: Attraction;

  /** Echoes covering the same subject the same way, so we never play both on one route. */
  readonly relatedIds?: readonly string[];
  /**
   * Echoes telling the *same* subject from a different vantage point — the town's account
   * and the tribe's, the company's and the strikers'.
   *
   * Deliberately not `relatedIds`. Those suppress each other as duplicates; these are the
   * opposite, and pairing them is the point: a place rarely has only one story, and two
   * accounts of one event are more truthful than the better-documented one alone. The
   * scheduler rewards playing them together rather than treating the second as a repeat.
   */
  readonly perspectiveIds?: readonly string[];
  /** Free-form tags for interest matching. */
  readonly tags?: readonly string[];

  /**
   * How far this sits from anywhere many people go, 0–1.
   *
   * Computed at content build time from distance to the nearest populated place, not set
   * by hand. It exists to make capture rarity honest: an echo is rare because standing
   * there is genuinely difficult, never because a designer decided the collection needed
   * pacing.
   */
  readonly remoteness?: number;
}

/** A echo split into seekable, highlightable lines. */
export interface Transcript {
  readonly lines: readonly TranscriptLine[];
  readonly totalS: number;
}

export interface TranscriptLine {
  readonly text: string;
  /** Seconds from the start of the audio at which this line begins. */
  readonly atS: number;
  readonly durationS: number;
}

export interface SimpleVariant {
  readonly title: string;
  readonly durationS: number;
  readonly script: string;
  readonly audioKey?: string;
  readonly audioBytes?: number;
  readonly transcript?: Transcript;
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

export interface Route {
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
  /**
   * Radius of uncertainty around `at`, in metres, as the device reports it.
   *
   * Matters enormously on foot and not at all in the air: a fifty-metre trigger radius and
   * a thirty-metre accuracy circle are the same order of magnitude, so ignoring this would
   * mean opening echoes for people standing on the wrong street.
   */
  readonly accuracyM?: number;
  readonly altitudeFt?: number;
  readonly speedKph?: number;
  readonly headingDeg?: number;
  /** Epoch milliseconds. */
  readonly timestamp: number;
  readonly source: PositionSourceKind;
}

export type PositionSourceKind = "aircraft-feed" | "device-gnss" | "dead-reckoned";

/**
 * Coarse phase of a route, named generically because the same five shapes appear in
 * every mode — they just differ in length.
 *
 * On a flight, `settling` is taxi and climb (nobody wants a narrator during the safety
 * briefing) and `arriving` is the descent. On a walking tour both collapse to under a
 * minute: the listener puts their headphones in and wants to start.
 */
export type RoutePhase = "not-started" | "settling" | "underway" | "arriving" | "arrived";

// ---------------------------------------------------------------------------
// Passenger preferences
// ---------------------------------------------------------------------------

export interface ListenerProfile {
  /** Categories the passenger wants. Opt-in categories are absent unless chosen. */
  readonly categories: readonly EchoCategory[];
  /** Drives the age gate. A family profile sets the youngest listener present. */
  readonly age: number;
  /** Tag affinities, 0–1, from onboarding taps. Absent tags score neutral. */
  readonly interests?: Readonly<Record<string, number>>;
  /** Roughly how much of the route should be audio rather than silence. */
  readonly density?: ListeningDensity;
  /** Echo IDs already heard, on this or an earlier route. Never repeated. */
  readonly heardEchoIds?: readonly string[];
}

/**
 * How chatty the route should be.
 *
 * What these mean in practice is mode-dependent, and the difference is large: silence on a
 * three-hour flight is restful, whereas silence on a forty-minute walking tour just feels
 * like the app is broken. The actual duty cycles live in `MODE_PRESETS`.
 */
export type ListeningDensity = "light" | "balanced" | "immersive";

// ---------------------------------------------------------------------------
// Scheduling output
// ---------------------------------------------------------------------------

/** A echo placed on the route's timeline. */
export interface ScheduledEcho {
  readonly echo: Echo;
  /** Seconds after departure when playback begins. */
  readonly startS: number;
  readonly endS: number;
  /** Seconds after departure when the listener is nearest this echo. */
  readonly nearestS: number;
  /** Perpendicular distance from the route, km. */
  readonly crossTrackKm: number;
  readonly score: number;
}

export interface Playlist {
  readonly routeId: string;
  readonly items: readonly ScheduledEcho[];
  /** Ranked but unscheduled — the reserve the client draws on when a filter changes. */
  readonly reserve: readonly Echo[];
  readonly totalAudioS: number;
  readonly routeDurationS: number;
  readonly mode: TravelMode;
}
