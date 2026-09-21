/**
 * A walk.
 *
 * Owns everything that has to happen between a position fix arriving and a person hearing
 * a story: which echoes are near, which one they are heading towards, how hard the phone
 * should buzz, and what has just opened.
 *
 * It exists so that a platform build is wiring rather than logic. An iOS app hands this a
 * location source and a way to vibrate, subscribes to events, and is done — it never
 * decides when to capture, how to smooth GPS noise, or whether a buzz is warranted. Those
 * are engine decisions, tested here without a device, and they stay the same on every
 * platform because there is only one copy of them.
 */

import { renderFor } from "../types.js";
import type { Echo, ListenerProfile, Position, TravelMode } from "../types.js";
import { CaptureTracker, type CaptureEvent, type CaptureOptions } from "../capture/index.js";
import { rarityOf } from "../capture/rarity.js";
import type { Arriving, CaptureRecord } from "../capture/types.js";
import { ProximityGuide, type Guidance, type ProximityOptions } from "../proximity/haptics.js";
import { findEchoesNearby, type NearbyEcho } from "../ranking/nearby.js";
import { PRIVACY_DEFAULTS, redactRecord, type PrivacySettings } from "../privacy/settings.js";
import type { AudioSink, HapticsSink, LocationSource, Unsubscribe } from "./adapters.js";

export type WalkEvent =
  | { readonly type: "position"; readonly position: Position }
  /** What is around the listener, best first. Drives the map and the nearby list. */
  | { readonly type: "nearby"; readonly echoes: readonly NearbyEcho[] }
  /** Hot-and-cold guidance towards the nearest sealed echo. Null when nothing is near. */
  | { readonly type: "guidance"; readonly guidance: Guidance | null }
  /** Echoes part-way through opening. Drives the progress ring. */
  | { readonly type: "opening"; readonly arriving: readonly Arriving[] }
  | { readonly type: "captured"; readonly capture: CaptureEvent }
  | { readonly type: "error"; readonly error: Error };

export interface WalkSessionDeps {
  readonly location: LocationSource;
  /** Optional: absent on iOS Safari, and on any device that cannot vibrate. */
  readonly haptics?: HapticsSink;
  /** Optional: a caller may prefer to drive audio from its own UI state. */
  readonly audio?: AudioSink;
}

export interface WalkSessionOptions {
  readonly mode?: TravelMode;
  readonly capture?: CaptureOptions;
  readonly proximity?: ProximityOptions;
  /** How far to look for the nearby list, km. */
  readonly nearbyRadiusKm?: number;
  /** Most entries in the nearby list. */
  readonly nearbyLimit?: number;
  /**
   * Begin playing a captured echo immediately.
   *
   * The hands-free case: phone in a pocket, screen off, walking. Off by default, because
   * starting audio unbidden is the right behaviour only when someone has asked for it.
   */
  readonly autoPlay?: boolean;
  /** Which narrator to play. Falls back to whatever render exists. */
  readonly voiceId?: string;
  /** Restore a previous collection, so echoes already found stay found. */
  readonly captured?: readonly CaptureRecord[];
  /**
   * What the listener has agreed to have remembered. Defaults to the cautious settings.
   *
   * Applied when a record is written, not when it is read: data never stored cannot leak,
   * cannot be subpoenaed and cannot be overlooked in a backup.
   */
  readonly privacy?: PrivacySettings;
}

export class WalkSession {
  readonly tracker: CaptureTracker;

  private readonly library: readonly Echo[];
  private readonly listener: ListenerProfile;
  private readonly deps: WalkSessionDeps;
  private readonly options: WalkSessionOptions;
  private readonly guide: ProximityGuide;
  private readonly handlers = new Set<(event: WalkEvent) => void>();

  private readonly privacy: PrivacySettings;
  private unwatch: Unsubscribe | null = null;
  /** The cue currently being rendered, so we do not restate it on every fix. */
  private activeCue: string | null = null;

  constructor(
    library: readonly Echo[],
    listener: ListenerProfile,
    deps: WalkSessionDeps,
    options: WalkSessionOptions = {},
  ) {
    this.library = library;
    this.listener = listener;
    this.deps = deps;
    this.options = options;
    this.privacy = options.privacy ?? PRIVACY_DEFAULTS;
    this.guide = new ProximityGuide(options.proximity);

    const captureOptions: CaptureOptions = {
      mode: options.mode ?? "walking",
      ...options.capture,
    };
    this.tracker = options.captured
      ? CaptureTracker.restore(listener, options.captured, captureOptions)
      : new CaptureTracker(listener, captureOptions);
  }

  subscribe(handler: (event: WalkEvent) => void): Unsubscribe {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  start(): void {
    if (this.unwatch) return;
    this.unwatch = this.deps.location.watch(
      (position) => this.onFix(position),
      (error) => this.emit({ type: "error", error }),
    );
  }

  stop(): void {
    this.unwatch?.();
    this.unwatch = null;
    this.guide.reset();
    this.silenceHaptics();
  }

  /** Capture on an explicit tap, which skips the dwell timer. */
  captureNow(echo: Echo, position: Position): CaptureEvent | null {
    const result = this.tracker.attempt(echo, position);
    if (!result.captured || !result.record) return null;

    const capture: CaptureEvent = {
      echo,
      record: result.record,
      rarity: rarityOf(echo),
    };
    this.announce(capture);
    return capture;
  }

  // --- internals ---------------------------------------------------------------------

  private onFix(position: Position): void {
    this.emit({ type: "position", position });

    const captures = this.tracker.update(position, this.library);
    for (const capture of captures) this.announce(capture);

    const nearby = findEchoesNearby(position.at, this.library, this.listener, {
      mode: this.options.mode ?? "walking",
      atMs: position.timestamp,
      ...(this.options.nearbyRadiusKm !== undefined
        ? { radiusKm: this.options.nearbyRadiusKm }
        : {}),
      ...(this.options.nearbyLimit !== undefined ? { limit: this.options.nearbyLimit } : {}),
    });
    this.emit({ type: "nearby", echoes: nearby });
    this.emit({ type: "opening", arriving: this.tracker.opening });

    // Guide towards the nearest echo not yet collected. Something already captured is not
    // a destination, and continuing to buzz about it would be maddening.
    const target = nearby.find((n) => this.tracker.stateOf(n.echo.id) === "sealed");
    const guidance = this.guide.update(
      target ? { echo: target.echo, distanceKm: target.distanceKm } : null,
    );
    this.emit({ type: "guidance", guidance });
    this.renderHaptics(guidance);
  }

  /**
   * The collection as it should be persisted.
   *
   * The tracker keeps full records in memory because it needs the standing position to
   * work — plausibility checks compare one against the next. What reaches storage is
   * whatever the listener agreed to, which is often less.
   */
  get collection(): readonly CaptureRecord[] {
    return this.tracker.records
      .map((record) => redactRecord(record, this.privacy))
      .filter((record): record is CaptureRecord => record !== null);
  }

  private announce(capture: CaptureEvent): void {
    this.deps.audio?.chime();
    if (this.options.autoPlay) {
      const render = renderFor(capture.echo.renders, this.options.voiceId);
      if (render) this.deps.audio?.play(render.audioKey);
    }
    // A captured echo is no longer a destination; drop any approach in progress so the
    // next fix starts guiding towards something else.
    this.guide.reset();
    this.emit({ type: "captured", capture });
  }

  /**
   * Pass the cue to the device, but only when it has actually changed.
   *
   * A fix can arrive every second; restating an identical pattern that often would cut it
   * off mid-pulse and turn a rhythm into a stutter. Comparing kind and rate is enough —
   * those are what a body notices.
   */
  private renderHaptics(guidance: Guidance | null): void {
    const haptics = this.deps.haptics;
    if (!haptics) return;

    if (!guidance || guidance.cue.kind === "none") {
      this.silenceHaptics();
      return;
    }

    const signature = `${guidance.cue.kind}:${guidance.cue.intervalMs}`;
    if (signature === this.activeCue) return;

    this.activeCue = signature;
    haptics.play(guidance.cue);
  }

  private silenceHaptics(): void {
    if (this.activeCue === null) return;
    this.activeCue = null;
    this.deps.haptics?.stop();
  }

  private emit(event: WalkEvent): void {
    for (const handler of this.handlers) handler(event);
  }
}
