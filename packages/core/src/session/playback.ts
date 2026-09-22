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
import { driftToleranceKm, presetFor } from "../modes.js";

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

  constructor(mode: TravelMode, options: PlaybackOptions = {}) {
    const preset = presetFor(mode);
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
      if (distanceKm(at, item.echo.point.at) > item.echo.point.triggerRadiusKm + this.maxDriftKm) {
        this.queue.splice(i, 1);
        gone.push({ echo: item.echo, reason: "out-of-range" });
      }
    }
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
   * Returns whatever had to be given up to make room, for the same reason `offer` does:
   * an echo that quietly stopped being on its way to the listener's ears is the one event
   * a UI cannot reconstruct for itself.
   */
  playNow(item: QueuedEcho): Deferred | null {
    // Pressing play on what is already playing restarts it — it does not clone it.
    //
    // The old version pushed the current item back onto the queue unconditionally, so
    // tapping Listen on the card that already said "Playing" left a second copy waiting
    // behind it, and the echo played straight through twice. The same happened to anything
    // already queued: promoting it to current left the duplicate in place.
    if (this.current?.echo.id === item.echo.id) {
      this.current = item;
      this.isPaused = false;
      return null;
    }

    this.drop(item.echo.id);
    if (this.current) this.queue.unshift(this.current);
    this.current = item;
    this.isPaused = false;

    // Over capacity: drop the weakest and say so, exactly as `offer` does. Popping the tail
    // silently threw away whatever had arrived most recently, which is both the wrong item
    // and an event the listener never heard about.
    return this.queue.length > this.maxWaiting ? this.evictWeakest() : null;
  }

  clear(): void {
    this.current = null;
    this.isPaused = false;
    this.queue.length = 0;
  }
}
