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
   * How long the listener must remain inside the radius before it syncs.
   *
   * Short, and deliberately so. Twelve seconds was a ceremony: long enough that a listener
   * stood on the exact spot watching a ring fill, which is the phone holding their
   * attention at the precise moment the place should have it. Three is a settle — enough
   * to tell a stop from a stride — and the real filter against passing through is
   * `maxSyncKph` below, which asks whether they stopped at all rather than how patient
   * they were.
   */
  readonly dwellS?: number;
  /**
   * Fastest you can be moving and still sync something, kph.
   *
   * "Once you have stood there." This is the rule that separates arriving from passing,
   * and it does the job a timer cannot: a bus crossing a city fails it at every echo no
   * matter how long the ride, and somebody ambling past a plaque passes it without
   * breaking step. Set above walking pace rather than at zero, because the premise is a
   * phone in a pocket — requiring a dead stop would mean requiring people to notice, which
   * is the whole thing this product is arranged to avoid.
   *
   * Applies to every mode. On the carried ones `captureByArrival` has already said no.
   */
  readonly maxSyncKph?: number;
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
  /**
   * Whether standing still inside an echo's radius opens it.
   *
   * Defaults to the mode's `selfDirected`: true on foot, by car and by bike, false in the
   * air and on rail. Overridable because a test wants to say so explicitly, not because a
   * product ever should.
   */
  readonly captureByArrival?: boolean;
}

const DEFAULTS = {
  dwellS: 3,
  maxSyncKph: 8,
  /*
   * Tighter than it was. At half an echo's radius, GPS slack could put somebody a further
   * twenty-five metres out on a fifty-metre plaque and still count — which is across the
   * street, and "you have to be really close to the exact spot" is the point of the
   * mechanic. A quarter still absorbs ordinary drift without lending anybody a building.
   */
  maxSlackFraction: 0.25,
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
      maxSyncKph: options.maxSyncKph ?? DEFAULTS.maxSyncKph,
      requireAudio: options.requireAudio ?? false,
      captureByArrival:
        options.captureByArrival ?? presetFor(options.mode ?? "walking").selfDirected,
    };
  }

  /** Shorthand for the rule in `update`: can standing here open anything at all? */
  private get byArrival(): boolean {
    return this.options.captureByArrival;
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
    /*
     * Measured before `lastFix` is overwritten, which is the whole trick and the bug the
     * first version of this had: computed inside the loop below, the previous fix *is*
     * this one, elapsed time is zero, and the speed is unknowable — so a car doing a
     * hundred read as stationary and synced everything it drove past.
     */
    const tooFast = this.movingFasterThanSync(position);
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

      // Moving too fast to have stood anywhere. The settle cannot even begin.
      if (tooFast) {
        this.arrivingSince.delete(echo.id);
        continue;
      }

      /*
       * Being carried past something is not arriving at it.
       *
       * The dwell timer above is described as "a filter against passing through", and on
       * foot it is one: fifty metres at walking pace is a decision to stop. In the air it
       * is not even a speed bump. A flight corridor is eighty kilometres wide and a flight
       * echo carries a forty-kilometre trigger radius, so an aircraft sits inside one for
       * something like five minutes, clears a twelve-second dwell without anybody doing
       * anything, and lands with every echo on the route collected. That is a wall of
       * things you flew over, and it devalues the ones somebody walked to.
       *
       * No dwell length fixes it, because the problem is not duration. On a mode the
       * traveller cannot steer there is no such thing as going somewhere: the route was
       * decided at the gate. So arrival does not capture at all where `selfDirected` is
       * false, and an echo becomes yours the way it actually can on a flight — you
       * downloaded the journey, and you chose to play this one. `attempt()` below is
       * untouched, and it is the path a tap takes.
       */
      if (!this.byArrival) {
        arriving.push({ echo, distanceKm: km, progress: 0 });
        continue;
      }

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
  /** Speed over the ground since the last fix, kph, or null on the first one. */
  private groundSpeedKph(position: Position): number | null {
    const previous = this.lastFix;
    if (!previous) return null;
    const elapsedS = (position.timestamp - previous.timestamp) / 1000;
    if (elapsedS <= 0) return null;
    return (distanceKm(previous.at, position.at) / elapsedS) * 3600;
  }

  /** Call before `lastFix` is reassigned, or the answer is always "stationary". */
  private movingFasterThanSync(position: Position): boolean {
    const measured = this.groundSpeedKph(position);
    // A reported speed is used only when we could not measure one: a device that says it
    // is stationary while its coordinates move is describing a wish.
    const kph = measured ?? position.speedKph;
    return kph !== undefined && kph !== null && kph > this.options.maxSyncKph;
  }

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
