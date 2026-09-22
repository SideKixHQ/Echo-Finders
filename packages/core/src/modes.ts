/**
 * Everything that differs between crossing a continent at 500 knots and crossing a
 * neighbourhood at 3mph.
 *
 * The engine itself is mode-agnostic. All of the mode-specific judgement is concentrated
 * here, in one table, so the difference between a flight and a walking tour is a set of
 * numbers to argue about rather than a second codebase to maintain.
 *
 * The numbers matter more than they look. Timing tolerance is the clearest case: on a
 * flight an echo may play ten minutes from its ideal moment and still feel like it is
 * about the place below, because ten minutes is a fifth of the way across a state. On foot,
 * ninety seconds late means the listener has walked past the building and is looking at a
 * different one — so the same tolerance that makes a flight feel relaxed makes a walking
 * tour feel broken.
 */

import type { ListeningDensity, PositionSourceKind, Provenance, TravelMode } from "./types.js";

export interface ModePreset {
  /** Typical moving speed, km/h. Used for dead reckoning and duration estimates. */
  readonly speedKph: number;

  /** Default corridor half-width, km. How far off-route an echo can be and still count. */
  readonly corridorKm: number;

  /**
   * How far, in seconds, an echo may play from the moment the listener is nearest it.
   * Roughly "how long the place stays the place you are at".
   */
  readonly maxTimingDriftS: number;

  /** Shortest silence between two echoes. */
  readonly minGapS: number;

  /**
   * Talk-to-silence ratio per density setting.
   *
   * Flights are sparse: the appeal is a long, calm route with things surfacing
   * occasionally, and a passenger wants to read, sleep and look out of the window. Walking
   * tours are the opposite — the listener has chosen to be told things, is walking *because*
   * of the audio, and will stop moving if it stops talking.
   */
  readonly dutyCycle: Record<ListeningDensity, number>;

  /**
   * Time at the very start spent barely moving: taxiing, getting into the car, putting
   * headphones in. Modelling this separately is what stops the engine believing a flight
   * is over Philadelphia ten minutes after a JFK departure.
   */
  readonly idleS: number;
  /** Time spent accelerating to full speed: the climb, merging onto the motorway. */
  readonly settlingS: number;
  /** Time spent slowing down: the descent, the final turn onto the street. */
  readonly arrivingS: number;

  /**
   * How long the listener is expected to still be *at* the destination once the route's
   * nominal duration is up, and so still willing to be told about it.
   *
   * This exists because the last waypoint is the one place the geometry gets wrong on its
   * own. An echo is anchored near the moment the listener is closest to it, which for the
   * final stop is the very end of the route — so it needs room after that moment, and a
   * window that closes on arrival has none. Without this the most important echo on a
   * walking tour, the one about the place the walk was built to reach, is the single echo
   * that can never play.
   *
   * It is a mode property because arriving means opposite things. Walk to a memorial and
   * you stop, stand, and look at it; that is the point of having walked there. A flight
   * arrives at a gate and the listening is over — nobody is still being told about the
   * approach while queueing to disembark — so for carried modes this is zero, and the
   * window closes as it always did.
   */
  readonly destinationDwellS: number;

  /**
   * Whether the traveller can change where they are going.
   *
   * The distinction is agency over the route, not speed, and getting that wrong is easy:
   * the first attempt at this gated guidance on how fast you were moving, which quietly
   * assumed a driver is a passive passenger. They are not. A navigator in a car can say
   * "turn left here" as readily as a person on foot can, and both of them can plan a route
   * around the echoes they want before setting off. That is a different product from the
   * one a passenger gets, and it is the *same* product walking and driving share.
   *
   * Being carried is the real dividing line. Nobody diverts an aircraft towards a good
   * story, and nobody asks a train to. For those modes an echo is something you pass,
   * guidance towards one describes a choice the listener does not have, and any feature
   * that begins "walk this way" is noise.
   *
   * Governs, at minimum: whether proximity guidance is worth rendering at all — haptic or
   * audible — and whether route planning may offer a detour to reach something.
   */
  readonly selfDirected: boolean;

  /**
   * Position sources in priority order (ADR-0002).
   *
   * Note that flight is the odd one out, and it is the only mode where GNSS is not the
   * first choice: in a cabin it is unreliable and often absent, while the aircraft itself
   * knows exactly where it is. On the ground the usual hierarchy applies — GNSS is
   * excellent, and dead reckoning is only a stopgap for a tunnel or an urban canyon.
   */
  readonly positionPriority: readonly PositionSourceKind[];

  /**
   * Which kinds of echo play by default in this mode.
   *
   * The one genuinely commercial setting in this table. A licensed airline service carries
   * the editorial library and vetted partners and nothing else — an airline will not put
   * unvetted passenger contributions in front of a cabin, and the contract will say so.
   * Someone walking their own city is the opposite case: the contributions are the point,
   * because no editorial team knows which corner shop someone's grandparents met outside.
   */
  readonly defaultProvenances: readonly Provenance[];

  /** Suggested trigger radius for new content in this mode, km. Editorial guidance. */
  readonly typicalTriggerRadiusKm: number;

  /**
   * What a device's position fix is typically worth in this mode, metres.
   *
   * Authoring guidance, not a runtime knob: capture uses the accuracy the device actually
   * reports, which already accounts for conditions far better than any table could. This
   * exists so nobody writes a twenty-metre echo for a city street, where no phone could
   * ever confirm standing in it — the radius would be smaller than the uncertainty.
   */
  readonly typicalFixAccuracyM: number;

  /**
   * Size ceiling for an offline package, bytes.
   *
   * A walking tour is tiny and should download over mobile data without a thought. A
   * long-haul flight package is two orders of magnitude larger and has to be fetched at
   * the gate or served from the aircraft.
   */
  readonly packageBudgetBytes: number;
}

const MB = 1024 * 1024;

export const MODE_PRESETS: Record<TravelMode, ModePreset> = {
  flight: {
    // Carried. The route is somebody else's decision and the door is locked.
    selfDirected: false,
    speedKph: 850,
    corridorKm: 80,
    maxTimingDriftS: 600,
    minGapS: 45,
    dutyCycle: { light: 0.2, balanced: 0.4, immersive: 0.65 },
    // Taxi, then climb. No narration during the safety briefing.
    idleS: 600,
    settlingS: 900,
    arrivingS: 1200,
    // The listening ends at the gate.
    destinationDwellS: 0,
    positionPriority: ["aircraft-feed", "dead-reckoned", "device-gnss"],
    defaultProvenances: ["editorial", "partner"],
    typicalTriggerRadiusKm: 60,
    // Irrelevant in practice: the aircraft feed is authoritative (ADR-0002).
    typicalFixAccuracyM: 50,
    packageBudgetBytes: 250 * MB,
  },

  rail: {
    // Carried, and the timetable is not negotiable.
    selfDirected: false,
    speedKph: 120,
    corridorKm: 12,
    maxTimingDriftS: 300,
    minGapS: 30,
    dutyCycle: { light: 0.25, balanced: 0.45, immersive: 0.7 },
    idleS: 60,
    settlingS: 120,
    arrivingS: 120,
    destinationDwellS: 0,
    positionPriority: ["device-gnss", "dead-reckoned"],
    defaultProvenances: ["editorial", "partner"],
    typicalTriggerRadiusKm: 8,
    // Good sightlines, but tunnels and cuttings lose the fix entirely.
    typicalFixAccuracyM: 20,
    packageBudgetBytes: 150 * MB,
  },

  driving: {
    // A navigator can redirect a car as readily as a walker redirects themselves.
    selfDirected: true,
    speedKph: 90,
    corridorKm: 5,
    maxTimingDriftS: 180,
    minGapS: 20,
    dutyCycle: { light: 0.3, balanced: 0.55, immersive: 0.8 },
    idleS: 15,
    settlingS: 45,
    arrivingS: 45,
    // The destination is a parking space, and the driver gets out of the car.
    destinationDwellS: 0,
    positionPriority: ["device-gnss", "dead-reckoned"],
    defaultProvenances: ["editorial", "partner", "personal"],
    typicalTriggerRadiusKm: 3,
    // The easiest case: open sky, steady motion, and Doppler to help.
    typicalFixAccuracyM: 15,
    packageBudgetBytes: 120 * MB,
  },

  cycling: {
    selfDirected: true,
    speedKph: 18,
    corridorKm: 1,
    maxTimingDriftS: 120,
    minGapS: 15,
    dutyCycle: { light: 0.35, balanced: 0.6, immersive: 0.8 },
    idleS: 5,
    settlingS: 40,
    arrivingS: 40,
    // Long enough to get off the bike and read the plaque.
    destinationDwellS: 120,
    positionPriority: ["device-gnss"],
    defaultProvenances: ["editorial", "partner", "personal"],
    typicalTriggerRadiusKm: 0.5,
    // Like driving, but more time spent among buildings.
    typicalFixAccuracyM: 20,
    packageBudgetBytes: 80 * MB,
  },

  walking: {
    selfDirected: true,
    speedKph: 4.5,
    corridorKm: 0.3,
    // Ninety seconds on foot is roughly a hundred metres — about as far as you can be from
    // a building and still accept that the echo is about it.
    maxTimingDriftS: 90,
    minGapS: 10,
    dutyCycle: { light: 0.4, balanced: 0.65, immersive: 0.85 },
    idleS: 3,
    settlingS: 17,
    arrivingS: 17,
    // The whole reason for the walk is standing at the last stop, so this is generous:
    // four minutes is a long echo and a plausible amount of time to spend looking.
    destinationDwellS: 240,
    positionPriority: ["device-gnss"],
    defaultProvenances: ["editorial", "partner", "personal"],
    typicalTriggerRadiusKm: 0.12,
    // The hardest case. A street between tall buildings is the worst place
    // a phone can be asked where it is, and it is exactly where echoes are densest.
    typicalFixAccuracyM: 30,
    packageBudgetBytes: 60 * MB,
  },
};

export function presetFor(mode: TravelMode): ModePreset {
  return MODE_PRESETS[mode];
}

/** Duty cycle for a mode and density, with `balanced` as the default. */
export function dutyCycleFor(mode: TravelMode, density: ListeningDensity = "balanced"): number {
  return MODE_PRESETS[mode].dutyCycle[density];
}
