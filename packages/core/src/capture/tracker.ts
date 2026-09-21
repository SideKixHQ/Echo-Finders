/**
 * Turning a stream of position fixes into captures.
 *
 * This is the piece a phone drives: feed it every fix the device produces and it answers
 * what just opened. It holds the small amount of state that decision needs — who is
 * part-way through arriving somewhere, what has already been captured, and where the
 * listener last was — so nothing upstream has to.
 */

import type { Echo, ListenerProfile, Position, TravelMode } from "../types.js";
import { distanceKm } from "../geo/great-circle.js";
import { presetFor } from "../modes.js";
import { checkEligibility } from "../ranking/score.js";
import { rarityOf } from "./rarity.js";
import type {
  Arriving,
  CaptureEvent,
  CaptureRecord,
  CaptureRefusal,
  CaptureState,
} from "./types.js";

export interface CaptureOptions {
  readonly mode?: TravelMode;
  /**
   * How long the listener must remain inside the radius before it opens.
   *
   * Not a difficulty knob — a filter against passing through. Someone on a bus crossing a
   * city would otherwise sweep up every echo along the route without ever having been
   * anywhere, which devalues every capture including the earned ones. A few seconds is
   * enough to separate arriving from passing.
   */
  readonly dwellS?: number;
  /**
   * Largest share of an echo's own radius that GPS slack may add, 0–1.
   *
   * Proportional rather than a fixed distance, and deliberately **not** a per-mode
   * setting, because both inputs already carry the mode's scale: a walking echo has a
   * fifty-metre radius and a driving one has three kilometres, while the device reports
   * accuracy that already reflects whether it is under open sky or between tower blocks.
   * A mode table on top of that would be duplicating what we are told, and would go stale
   * the moment someone walks a route authored for a car.
   */
  readonly maxSlackFraction?: number;
  /**
   * Reject a fix whose accuracy exceeds this multiple of the echo's radius.
   *
   * Two, not three, because the two failure modes cost very differently. Refusing to open
   * an echo the listener is standing next to costs them a few more steps. Opening one they
   * are nowhere near makes the app a liar, and they will not trust the next capture.
   */
  readonly maxAccuracyRatio?: number;
  /** Multiple of the mode's speed beyond which movement is treated as impossible. */
  readonly maxSpeedFactor?: number;
  readonly requireAudio?: boolean;
}

const DEFAULTS = {
  dwellS: 12,
  maxSlackFraction: 0.5,
  maxAccuracyRatio: 2,
  // Generous: GPS jitter, a sprint for a bus, a tailwind on a bike. This is meant to catch
  // teleportation, not athleticism.
  maxSpeedFactor: 4,
} as const;

export interface CaptureAttempt {
  readonly captured: boolean;
  readonly refusal: CaptureRefusal | null;
  readonly record?: CaptureRecord;
}

export class CaptureTracker {
  private readonly listener: ListenerProfile;
  private readonly options: Required<CaptureOptions>;
  private readonly captured = new Map<string, CaptureRecord>();
  /** Echo id → epoch ms at which the listener first came into range on this approach. */
  private readonly arrivingSince = new Map<string, number>();
  private lastFix: Position | null = null;
  private arriving: Arriving[] = [];

  constructor(listener: ListenerProfile, options: CaptureOptions = {}) {
    this.listener = listener;
    this.options = {
      mode: options.mode ?? "walking",
      dwellS: options.dwellS ?? DEFAULTS.dwellS,
      maxSlackFraction: options.maxSlackFraction ?? DEFAULTS.maxSlackFraction,
      maxAccuracyRatio: options.maxAccuracyRatio ?? DEFAULTS.maxAccuracyRatio,
      maxSpeedFactor: options.maxSpeedFactor ?? DEFAULTS.maxSpeedFactor,
      requireAudio: options.requireAudio ?? false,
    };
  }

  /** Rebuild from persisted records, so a collection survives reinstalling the app. */
  static restore(
    listener: ListenerProfile,
    records: readonly CaptureRecord[],
    options: CaptureOptions = {},
  ): CaptureTracker {
    const tracker = new CaptureTracker(listener, options);
    for (const record of records) tracker.captured.set(record.echoId, record);
    return tracker;
  }

  /**
   * Feed one position fix. Returns whatever opened as a result.
   *
   * Usually empty, which is the point: most fixes are a person walking down a street where
   * nothing happened.
   */
  update(position: Position, library: readonly Echo[]): CaptureEvent[] {
    const events: CaptureEvent[] = [];
    const arriving: Arriving[] = [];

    const teleported = this.isImplausible(position);
    this.lastFix = position;

    for (const echo of library) {
      if (this.captured.has(echo.id)) continue;

      const km = distanceKm(position.at, echo.point.at);
      const reach = this.reachFor(echo, position);

      if (km > reach) {
        // Left the radius before the dwell completed — the next approach starts over.
        this.arrivingSince.delete(echo.id);
        continue;
      }

      if (!this.isEligible(echo, position.timestamp)) continue;

      // Position is inside the radius but too vague to be believed at this scale.
      if (this.fixTooVague(echo, position)) continue;

      if (teleported) continue;

      const since = this.arrivingSince.get(echo.id) ?? position.timestamp;
      this.arrivingSince.set(echo.id, since);

      const elapsedS = (position.timestamp - since) / 1000;
      if (elapsedS < this.options.dwellS) {
        arriving.push({
          echo,
          distanceKm: km,
          progress: Math.min(1, elapsedS / this.options.dwellS),
        });
        continue;
      }

      const record: CaptureRecord = {
        echoId: echo.id,
        capturedAt: new Date(position.timestamp).toISOString(),
        stoodAt: position.at,
        distanceKm: km,
      };
      this.captured.set(echo.id, record);
      this.arrivingSince.delete(echo.id);
      events.push({ echo, record, rarity: rarityOf(echo) });
    }

    this.arriving = arriving;
    return events;
  }

  /**
   * Try to open one echo immediately, on an explicit tap.
   *
   * A tap is a statement of intent, so it skips the dwell timer — the listener has
   * demonstrably stopped and looked. Everything else still applies: range, eligibility,
   * accuracy and plausibility are not things a tap can override.
   */
  attempt(echo: Echo, position: Position): CaptureAttempt {
    if (this.captured.has(echo.id)) {
      return { captured: false, refusal: "already-captured" };
    }
    if (!this.isEligible(echo, position.timestamp)) {
      return { captured: false, refusal: "not-eligible" };
    }

    const km = distanceKm(position.at, echo.point.at);
    if (km > this.reachFor(echo, position)) {
      return { captured: false, refusal: "out-of-range" };
    }
    if (this.fixTooVague(echo, position)) {
      return { captured: false, refusal: "fix-too-vague" };
    }
    if (this.isImplausible(position)) {
      return { captured: false, refusal: "implausible-movement" };
    }

    const record: CaptureRecord = {
      echoId: echo.id,
      capturedAt: new Date(position.timestamp).toISOString(),
      stoodAt: position.at,
      distanceKm: km,
    };
    this.captured.set(echo.id, record);
    this.arrivingSince.delete(echo.id);
    this.lastFix = position;
    return { captured: true, refusal: null, record };
  }

  /** Echoes currently opening. Drives the progress ring. */
  get opening(): readonly Arriving[] {
    return this.arriving;
  }

  get records(): readonly CaptureRecord[] {
    return [...this.captured.values()];
  }

  stateOf(echoId: string): CaptureState {
    const record = this.captured.get(echoId);
    if (!record) return "sealed";
    return record.heardAt ? "heard" : "captured";
  }

  /** Mark an echo as listened to. Separate from capture, and it may happen much later. */
  markHeard(echoId: string, atMs: number = Date.now()): boolean {
    const record = this.captured.get(echoId);
    if (!record || record.heardAt) return false;
    this.captured.set(echoId, { ...record, heardAt: new Date(atMs).toISOString() });
    return true;
  }

  // --- internals ---------------------------------------------------------------------

  /**
   * Trigger radius plus a bounded allowance for how vague the fix is.
   *
   * Two ceilings, and both are needed. The reported accuracy caps the slack, so a precise
   * fix grants almost none — there is no reason to be generous when the device is sure.
   * The radius fraction caps it again, so a vague fix cannot inflate a doorway into a
   * neighbourhood. In practice on the ground the reported accuracy binds, and the fraction
   * only catches the pathological cases.
   */
  private reachFor(echo: Echo, position: Position): number {
    const radiusKm = echo.point.triggerRadiusKm;
    const accuracyKm = Math.min(
      (position.accuracyM ?? 0) / 1000,
      radiusKm * this.options.maxSlackFraction,
    );
    return radiusKm + accuracyKm;
  }

  /**
   * A fix whose uncertainty dwarfs the target is not evidence of being there.
   *
   * Without this, a device reporting a 200m accuracy circle would open a 50m doorway echo
   * from the far side of a block — and the listener would rightly feel the app was making
   * things up.
   */
  private fixTooVague(echo: Echo, position: Position): boolean {
    const accuracyKm = (position.accuracyM ?? 0) / 1000;
    return accuracyKm > echo.point.triggerRadiusKm * this.options.maxAccuracyRatio;
  }

  private isEligible(echo: Echo, atMs: number): boolean {
    return checkEligibility(echo, {
      profile: this.listener,
      playAtMs: atMs,
      requireAudio: this.options.requireAudio,
    }).eligible;
  }

  /**
   * Could the listener actually have got here from their last fix?
   *
   * The honest answer to spoofing is not this check — it is that there are no leaderboards
   * and nothing to win, so faking a capture only cheats the person doing it. This exists
   * so a collection stays a truthful record of where someone has been, which is the thing
   * that makes it worth keeping at all.
   */
  private isImplausible(position: Position): boolean {
    const previous = this.lastFix;
    if (!previous) return false;

    const elapsedS = (position.timestamp - previous.timestamp) / 1000;
    if (elapsedS <= 0) return false;

    const km = distanceKm(previous.at, position.at);
    const impliedKph = (km / elapsedS) * 3600;
    const ceiling = presetFor(this.options.mode).speedKph * this.options.maxSpeedFactor;

    return impliedKph > ceiling;
  }
}
