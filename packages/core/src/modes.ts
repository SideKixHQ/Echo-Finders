/**
 * Everything that differs between crossing a continent at 500 knots and crossing a
 * neighbourhood at 3mph.
 *
 * The engine itself is mode-agnostic. All of the mode-specific judgement is concentrated
 * here, in one table, so the difference between a flight and a walking tour is a set of
 * numbers to argue about rather than a second codebase to maintain.
 *
 * The numbers matter more than they look. Timing tolerance is the clearest case: on a
 * flight a story may play ten minutes from its ideal moment and still feel like it is
 * about the place below, because ten minutes is a fifth of the way across a state. On foot,
 * ninety seconds late means the listener has walked past the building and is looking at a
 * different one — so the same tolerance that makes a flight feel relaxed makes a walking
 * tour feel broken.
 */

import type { ListeningDensity, PositionSourceKind, TravelMode } from "./types.js";

export interface ModePreset {
  /** Typical moving speed, km/h. Used for dead reckoning and duration estimates. */
  readonly speedKph: number;

  /** Default corridor half-width, km. How far off-route a story can be and still count. */
  readonly corridorKm: number;

  /**
   * How far, in seconds, a story may play from the moment the listener is nearest it.
   * Roughly "how long the place stays the place you are at".
   */
  readonly maxTimingDriftS: number;

  /** Shortest silence between two stories. */
  readonly minGapS: number;

  /**
   * Talk-to-silence ratio per density setting.
   *
   * Flights are sparse: the appeal is a long, calm journey with things surfacing
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
   * Position sources in priority order (ADR-0002).
   *
   * Note that flight is the odd one out, and it is the only mode where GNSS is not the
   * first choice: in a cabin it is unreliable and often absent, while the aircraft itself
   * knows exactly where it is. On the ground the usual hierarchy applies — GNSS is
   * excellent, and dead reckoning is only a stopgap for a tunnel or an urban canyon.
   */
  readonly positionPriority: readonly PositionSourceKind[];

  /** Suggested trigger radius for new content in this mode, km. Editorial guidance. */
  readonly typicalTriggerRadiusKm: number;

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
    speedKph: 850,
    corridorKm: 80,
    maxTimingDriftS: 600,
    minGapS: 45,
    dutyCycle: { light: 0.2, balanced: 0.4, immersive: 0.65 },
    // Taxi, then climb. No narration during the safety briefing.
    idleS: 600,
    settlingS: 900,
    arrivingS: 1200,
    positionPriority: ["aircraft-feed", "dead-reckoned", "device-gnss"],
    typicalTriggerRadiusKm: 60,
    packageBudgetBytes: 250 * MB,
  },

  rail: {
    speedKph: 120,
    corridorKm: 12,
    maxTimingDriftS: 300,
    minGapS: 30,
    dutyCycle: { light: 0.25, balanced: 0.45, immersive: 0.7 },
    idleS: 60,
    settlingS: 120,
    arrivingS: 120,
    positionPriority: ["device-gnss", "dead-reckoned"],
    typicalTriggerRadiusKm: 8,
    packageBudgetBytes: 150 * MB,
  },

  driving: {
    speedKph: 90,
    corridorKm: 5,
    maxTimingDriftS: 180,
    minGapS: 20,
    dutyCycle: { light: 0.3, balanced: 0.55, immersive: 0.8 },
    idleS: 15,
    settlingS: 45,
    arrivingS: 45,
    positionPriority: ["device-gnss", "dead-reckoned"],
    typicalTriggerRadiusKm: 3,
    packageBudgetBytes: 120 * MB,
  },

  cycling: {
    speedKph: 18,
    corridorKm: 1,
    maxTimingDriftS: 120,
    minGapS: 15,
    dutyCycle: { light: 0.35, balanced: 0.6, immersive: 0.8 },
    idleS: 5,
    settlingS: 40,
    arrivingS: 40,
    positionPriority: ["device-gnss"],
    typicalTriggerRadiusKm: 0.5,
    packageBudgetBytes: 80 * MB,
  },

  walking: {
    speedKph: 4.5,
    corridorKm: 0.3,
    // Ninety seconds on foot is roughly a hundred metres — about as far as you can be from
    // a building and still accept that the story is about it.
    maxTimingDriftS: 90,
    minGapS: 10,
    dutyCycle: { light: 0.4, balanced: 0.65, immersive: 0.85 },
    idleS: 3,
    settlingS: 17,
    arrivingS: 17,
    positionPriority: ["device-gnss"],
    typicalTriggerRadiusKm: 0.12,
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
