/**
 * Hot and cold, by feel.
 *
 * A vibration that rises as you approach an echo turns navigation into the children's
 * game, and it does something more useful besides: it works **through a pocket**. The
 * listener never has to look. That is the same property capture-by-arrival was chosen for
 * (ADR-0010), extended to the walk itself — and it is also, incidentally, how someone who
 * cannot see the screen at all navigates to an echo.
 *
 * Three things shape the design, and all three are about what a body can actually perceive
 * rather than what a device can technically emit.
 *
 * **Rhythm carries further than strength.** Through denim, at walking pace, the difference
 * between a 60% and an 80% buzz is close to imperceptible. The difference between a pulse
 * every two seconds and a pulse every half second is unmistakable. So distance is encoded
 * primarily as *pulse rate* — a metal detector, not a dimmer switch — with intensity as a
 * secondary cue.
 *
 * **The game is about change, not distance.** "Warmer" and "colder" are comparisons. A
 * cue that only reported absolute distance would tell you where you are; what a person
 * walking needs to know is whether the last ten steps helped.
 *
 * **Silence is most of the experience.** Continuous buzzing is maddening and expensive.
 * Nothing fires until the listener is genuinely near something, and nothing fires at all
 * once it is captured.
 */

import type { Echo } from "../types.js";

export type CueKind =
  /** Nothing near enough to be worth a buzz. The usual state. */
  | "none"
  /** Moving away. Sparse and dull — a nudge, not an alarm. */
  | "colder"
  /** Near, but not measurably closing. Steady heartbeat. */
  | "steady"
  /** Closing. Quicker and sharper the nearer it gets. */
  | "warmer"
  /** Almost on top of it. */
  | "close"
  /** Inside the radius — the echo is opening. */
  | "arrived";

/**
 * An abstract instruction for the platform layer to render.
 *
 * Deliberately not tied to any vibration API: Android, iOS Core Haptics and the web all
 * express this differently, and one of them cannot express it at all (see ADR-0011).
 */
export interface HapticCue {
  readonly kind: CueKind;
  /** 0–1. Secondary cue; see the note on rhythm above. */
  readonly intensity: number;
  /** Length of each pulse, ms. */
  readonly pulseMs: number;
  /** Gap between pulses, ms. `Infinity` means a single pulse, or none. */
  readonly intervalMs: number;
}

export const SILENT: HapticCue = {
  kind: "none",
  intensity: 0,
  pulseMs: 0,
  intervalMs: Number.POSITIVE_INFINITY,
};

export interface ProximityOptions {
  /**
   * How many trigger radii out the guidance begins. Beyond this, nothing buzzes.
   *
   * Six is roughly three hundred metres for a typical street-scale echo — far enough to
   * be led somewhere, close enough that it is not buzzing about a place two neighbourhoods
   * away.
   */
  readonly warmRadii?: number;
  /** Fastest pulse rate, ms. Below about 200ms pulses blur into a continuous buzz. */
  readonly minIntervalMs?: number;
  /** Slowest pulse rate, ms. */
  readonly maxIntervalMs?: number;
  /**
   * Distance change, in metres, below which movement is treated as noise rather than
   * progress. GPS jitter alone is easily ten metres while standing still.
   */
  readonly trendNoiseM?: number;
  /** Weight for the distance smoother, 0–1. Lower is smoother and laggier. */
  readonly smoothing?: number;
}

const DEFAULTS = {
  warmRadii: 6,
  minIntervalMs: 220,
  maxIntervalMs: 2400,
  trendNoiseM: 12,
  smoothing: 0.35,
} as const;

/**
 * Translate a distance into something to feel.
 *
 * Pure, so the mapping can be reasoned about and tested without a device.
 */
export function proximityCue(
  distanceKm: number,
  triggerRadiusKm: number,
  trend: "closer" | "further" | "steady",
  options: ProximityOptions = {},
): HapticCue {
  const warmRadii = options.warmRadii ?? DEFAULTS.warmRadii;
  const minIntervalMs = options.minIntervalMs ?? DEFAULTS.minIntervalMs;
  const maxIntervalMs = options.maxIntervalMs ?? DEFAULTS.maxIntervalMs;

  const radius = Math.max(triggerRadiusKm, 0.001);
  const ratio = distanceKm / radius;
  // The width of the approach, in radii. The `ratio > warmRadii` return above already
  // means this is only reached when the span is positive, so the floor is belt and braces
  // against a future reordering rather than a live division by zero — and the clamp on
  // `closeness` keeps the easing in range whatever a caller passes.
  const span = Math.max(1e-6, warmRadii - 1);

  if (ratio <= 1) {
    // Inside. One long, unmistakable confirmation rather than a rhythm — this is an
    // event, not guidance.
    return { kind: "arrived", intensity: 1, pulseMs: 400, intervalMs: Number.POSITIVE_INFINITY };
  }

  if (ratio > warmRadii) return SILENT;

  // Map the approach onto a pulse rate. Squared so the quickening is felt late and
  // strongly, the way a metal detector does, rather than creeping up linearly from the
  // edge of range where it would just be irritating.
  const closeness = Math.max(0, Math.min(1, 1 - (ratio - 1) / span));
  const eased = closeness ** 2;
  const intervalMs = Math.round(maxIntervalMs - (maxIntervalMs - minIntervalMs) * eased);

  if (ratio <= 2) {
    return { kind: "close", intensity: 1, pulseMs: 60, intervalMs };
  }

  switch (trend) {
    case "closer":
      return { kind: "warmer", intensity: 0.45 + 0.5 * eased, pulseMs: 45, intervalMs };
    case "further":
      // Longer, softer, slower: unmistakably different from warmth without demanding
      // attention. Going the wrong way should feel like a shrug, not a reprimand.
      return {
        kind: "colder",
        intensity: 0.25,
        pulseMs: 160,
        intervalMs: Math.round(Math.min(maxIntervalMs, intervalMs * 2.2)),
      };
    case "steady":
      return { kind: "steady", intensity: 0.35, pulseMs: 70, intervalMs };
  }
}

export interface Guidance {
  readonly echo: Echo;
  readonly distanceKm: number;
  readonly cue: HapticCue;
  readonly trend: "closer" | "further" | "steady";
}

/**
 * How long a verdict stands with nothing to confirm it.
 *
 * Eight seconds: long enough to survive a pause at a kerb, short enough that stopping to
 * look at something settles the cue back to a heartbeat rather than leaving it insisting
 * you are still getting warmer.
 */
const VERDICT_TTL_MS = 8000;

/**
 * Follows the nearest sealed echo and reports what the phone should do.
 *
 * Stateful because the whole point is the comparison with a moment ago, and because raw
 * GPS is far too noisy to compare directly: a phone standing still on a windowsill will
 * happily report ten metres of movement, which without smoothing would flip the cue
 * between warmer and colder several times a minute and destroy any sense that the feedback
 * means something.
 */
export class ProximityGuide {
  private readonly options: Required<ProximityOptions>;
  private smoothedKm: number | null = null;
  private targetId: string | null = null;

  /**
   * Net approach since the trend last had enough evidence to say anything, km.
   *
   * This exists because comparing one fix to the one before it does not work, and did not.
   * `trendNoiseM` is twelve metres because that is roughly what a phone standing still
   * drifts by — but a *walker* covers 0.35m between fixes at 4Hz, so a per-fix delta never
   * came close to the threshold and the cue was permanently "steady". The hot-and-cold
   * game, which the whole module exists for, silently never fired on a real device. It
   * passed its tests because the tests moved fifty metres per fix.
   *
   * Accumulating instead makes the threshold mean what it says — twelve metres of *net*
   * movement, however many fixes that took — so it behaves the same at 1Hz and at 10Hz.
   * It is hysteretic for free: a verdict stands until twelve metres of evidence the other
   * way, so the cue cannot flap.
   */
  private sinceVerdictKm = 0;
  private trend: Guidance["trend"] = "steady";
  /** When the last verdict landed, so one cannot outlive the walk it described. */
  private verdictAtMs: number | null = null;

  constructor(options: ProximityOptions = {}) {
    this.options = {
      warmRadii: options.warmRadii ?? DEFAULTS.warmRadii,
      minIntervalMs: options.minIntervalMs ?? DEFAULTS.minIntervalMs,
      maxIntervalMs: options.maxIntervalMs ?? DEFAULTS.maxIntervalMs,
      trendNoiseM: options.trendNoiseM ?? DEFAULTS.trendNoiseM,
      smoothing: options.smoothing ?? DEFAULTS.smoothing,
    };
  }

  /**
   * Report on the nearest target.
   *
   * Takes an already-filtered candidate — whoever calls this knows which echoes are still
   * sealed and eligible, and that is not this module's business.
   */
  update(
    target: { echo: Echo; distanceKm: number } | null,
    atMs?: number,
  ): Guidance | null {
    if (!target) {
      this.forget();
      return null;
    }

    // Switching targets resets the comparison; distance to a different echo is not a
    // continuation of the previous approach.
    if (this.targetId !== target.echo.id) {
      this.forget();
      this.targetId = target.echo.id;
      this.smoothedKm = target.distanceKm;
      return {
        echo: target.echo,
        distanceKm: target.distanceKm,
        trend: "steady",
        cue: proximityCue(
          target.distanceKm,
          target.echo.point.triggerRadiusKm,
          "steady",
          this.options,
        ),
      };
    }

    const previous = this.smoothedKm ?? target.distanceKm;
    const alpha = this.options.smoothing;
    const smoothed = previous * (1 - alpha) + target.distanceKm * alpha;
    this.smoothedKm = smoothed;

    // Positive is closing.
    this.sinceVerdictKm += previous - smoothed;
    const evidenceM = this.sinceVerdictKm * 1000;

    if (Math.abs(evidenceM) > this.options.trendNoiseM) {
      this.trend = evidenceM > 0 ? "closer" : "further";
      this.sinceVerdictKm = 0;
      if (atMs !== undefined) this.verdictAtMs = atMs;
    } else if (
      // A verdict that nothing has contradicted still goes stale. Somebody who walked
      // towards an echo and then stopped to read a plaque is not still approaching it, and
      // a cue that says otherwise for the rest of the walk is worse than no cue.
      atMs !== undefined &&
      this.verdictAtMs !== null &&
      atMs - this.verdictAtMs > VERDICT_TTL_MS
    ) {
      this.trend = "steady";
      this.verdictAtMs = null;
    }

    return {
      echo: target.echo,
      distanceKm: smoothed,
      trend: this.trend,
      cue: proximityCue(smoothed, target.echo.point.triggerRadiusKm, this.trend, this.options),
    };
  }

  /** Forget the current approach. Call when an echo is captured or the walk ends. */
  reset(): void {
    this.forget();
  }

  private forget(): void {
    this.smoothedKm = null;
    this.targetId = null;
    this.sinceVerdictKm = 0;
    this.trend = "steady";
    this.verdictAtMs = null;
  }
}
