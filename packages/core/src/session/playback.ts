/**
 * What plays, and what waits.
 *
 * Only one thing can be in somebody's ears at a time, and captures do not respect that.
 * Standing at Bowling Green there are two echoes within a few metres of each other — the
 * King George statue and the Charging Bull — and the dwell in that route exists precisely
 * so a listener can collect both. Without a queue the second capture calls `play()` over
 * the first, and four words into the statue the bull interrupts it.
 *
 * The resolution rests on a distinction the product already makes: **capturing and hearing
 * are different things.** A capture is permanent — it is in the collection, it is a place
 * the listener actually stood, and it can be played from there forever. Playback is only
 * the *immediate* telling. So this queue is free to give up on something without anybody
 * losing it, which is what makes the awkward cases tractable.
 *
 * Three rules follow:
 *
 * 1. **One at a time, and never interrupt.** A story cut off mid-sentence is worse than a
 *    story heard a minute late.
 * 2. **Waiting items expire by distance, not by time.** An echo that says "look at the tops
 *    of the posts" is worthless two streets later, and how long that took is beside the
 *    point — the same reasoning that made scheduling drift a distance (ADR-0014), and it
 *    uses the same tolerance.
 * 3. **The queue is short.** Beyond a couple of items the listener is no longer on a walk,
 *    they are working through a backlog, and everything in it is drifting out of place
 *    while they do.
 *
 * Nothing here decides *how* to play. It decides what should be playing, and the platform's
 * `AudioSink` does the rest.
 */

import type { AudioRender, Echo, LatLng, TravelMode } from "../types.js";
import { distanceKm } from "../geo/great-circle.js";
import { driftToleranceKm, presetFor, syncRadiusKm } from "../modes.js";

export interface QueuedEcho {
  readonly echo: Echo;
  readonly render: AudioRender;
  /** When it was captured. */
  readonly atMs: number;
}

/** Why something the listener captured never reached their ears. */
export type DeferralReason =
  /** They walked out of range of the place while it waited its turn. */
  | "out-of-range"
  /** More arrived than a queue can usefully hold. */
  | "queue-full";

export interface Deferred {
  readonly echo: Echo;
  readonly reason: DeferralReason;
}

export type PlaybackState =
  | { readonly kind: "idle" }
  | { readonly kind: "playing"; readonly item: QueuedEcho }
  | { readonly kind: "paused"; readonly item: QueuedEcho };

export interface PlaybackOptions {
  /**
   * How many may wait behind the one playing.
   *
   * Two, which is short on purpose. A deep queue sounds generous and is not: everything in
   * it is going stale while it waits, so a listener who "kept" six echoes mostly ends up
   * hearing six descriptions of places they can no longer see.
   */
  readonly maxWaiting?: number;
  /**
   * How far the listener may get from an echo's place before a waiting item gives up, km.
   * Defaults to the mode's own tolerance — the same number the scheduler plans against.
   */
  readonly maxDriftKm?: number;
}

const DEFAULT_MAX_WAITING = 2;

export class PlaybackQueue {
  private current: QueuedEcho | null = null;
  private isPaused = false;
  private readonly queue: QueuedEcho[] = [];
  private readonly maxWaiting: number;
  private readonly maxDriftKm: number;
  private readonly mode: TravelMode;
  /** Gives up on a waiting echo once it is passed (`waitingGivesUpOncePassed`). */
  private readonly givesUpOncePassed: boolean;
  /** How far each waiting echo was at the last fix, km, to tell passing from approaching. */
  private readonly lastKm = new Map<string, number>();

  constructor(mode: TravelMode, options: PlaybackOptions = {}) {
    const preset = presetFor(mode);
    this.mode = mode;
    this.givesUpOncePassed = preset.waitingGivesUpOncePassed ?? false;
    this.maxWaiting = options.maxWaiting ?? DEFAULT_MAX_WAITING;
    this.maxDriftKm =
      options.maxDriftKm ?? driftToleranceKm(preset.maxTimingDriftS, preset.speedKph);
  }

  get state(): PlaybackState {
    if (!this.current) return { kind: "idle" };
    return { kind: this.isPaused ? "paused" : "playing", item: this.current };
  }

  get nowPlaying(): QueuedEcho | null {
    return this.current;
  }

  get waiting(): readonly QueuedEcho[] {
    return this.queue;
  }

  /**
   * Hand over a captured echo.
   *
   * Returns what became of it, so the caller knows whether to start the platform player —
   * and so a deferral can be reported rather than happening silently.
   */
  offer(item: QueuedEcho): { readonly started: boolean; readonly deferred: Deferred | null } {
    // Already in hand. Capture is idempotent upstream, but auto-play and a tap can both
    // reach here for the same echo, and queueing a second copy means hearing it twice.
    if (this.holds(item.echo.id)) return { started: false, deferred: null };

    if (!this.current) {
      this.current = item;
      this.isPaused = false;
      return { started: true, deferred: null };
    }

    this.queue.push(item);
    if (this.queue.length <= this.maxWaiting) return { started: false, deferred: null };

    return { started: false, deferred: this.evictWeakest() };
  }

  /** Is this echo already playing or already waiting? */
  private holds(echoId: string): boolean {
    return this.current?.echo.id === echoId || this.queue.some((q) => q.echo.id === echoId);
  }

  /** Remove a waiting copy of this echo, if there is one. */
  private drop(echoId: string): void {
    const at = this.queue.findIndex((q) => q.echo.id === echoId);
    if (at >= 0) this.queue.splice(at, 1);
  }

  /**
   * Make room by giving up the *weakest* waiting item, not the newest.
   *
   * Arriving last is not a reason to be dropped, and the listener keeps every one of them
   * in the collection either way — which is the whole reason this queue is allowed to give
   * up on things at all.
   */
  private evictWeakest(): Deferred {
    let worstAt = 0;
    for (let i = 1; i < this.queue.length; i++) {
      if (this.queue[i]!.echo.quality < this.queue[worstAt]!.echo.quality) worstAt = i;
    }
    const dropped = this.queue.splice(worstAt, 1)[0]!;
    return { echo: dropped.echo, reason: "queue-full" };
  }

  /**
   * The listener moved. Give up on anything they are now too far from.
   *
   * Only ever applies to items still *waiting*. Something already playing is allowed to
   * finish wherever the listener has got to — stopping a story mid-sentence because they
   * rounded a corner would be a bizarre thing for a product to do.
   */
  moved(at: LatLng): readonly Deferred[] {
    const gone: Deferred[] = [];
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const item = this.queue[i]!;
      const km = distanceKm(at, item.echo.point.at);
      const before = this.lastKm.get(item.echo.id);
      this.lastKm.set(item.echo.id, km);
      /*
       * On a drive, gone past: out of the radius it synced in, and further away than at the
       * last fix. A car that has left a place behind is not coming back to it, and the
       * drift tolerance (four and a half kilometres at ninety) kept it waiting long after.
       */
      const passed =
        this.givesUpOncePassed &&
        before !== undefined &&
        km > before &&
        km > syncRadiusKm(item.echo.point.triggerRadiusKm, this.mode);
      if (passed || km > item.echo.point.triggerRadiusKm + this.maxDriftKm) {
        this.queue.splice(i, 1);
        gone.push({ echo: item.echo, reason: "out-of-range" });
      }
    }
    for (const id of this.lastKm.keys()) if (!this.queue.some((q) => q.echo.id === id)) this.lastKm.delete(id);
    return gone.reverse();
  }

  /** The platform reports the current item has run out. Advance. */
  finished(): QueuedEcho | null {
    this.current = this.queue.shift() ?? null;
    this.isPaused = false;
    return this.current;
  }

  /** Give up on the current item and take the next — the listener pressed skip. */
  skip(): QueuedEcho | null {
    return this.finished();
  }

  pause(): void {
    if (this.current) this.isPaused = true;
  }

  resume(): void {
    if (this.current) this.isPaused = false;
  }

  /**
   * Play something on demand, from the collection or the map. Jumps the queue.
   *
   * What was playing stops for good. It used to go back to the front of the queue, so
   * starting a second echo partway through the first meant the first started over from the
   * beginning the moment the second ended, then the one before that, and so on, with no
   * card on screen to pause or skip them from (James, 2026-11-12). Picking an echo is the
   * listener saying what they want to hear now; the one they left is still in the
   * collection if they want it back. Echoes that arrived on their own and are still waiting
   * keep their place.
   *
   * Nothing is ever given up to make room, because the queue never grows here, so this
   * always returns null. The return stays so callers that report deferrals need no change.
   */
  playNow(item: QueuedEcho): Deferred | null {
    this.drop(item.echo.id);
    this.current = item;
    this.isPaused = false;
    return null;
  }

  clear(): void {
    this.current = null;
    this.isPaused = false;
    this.queue.length = 0;
  }
}
