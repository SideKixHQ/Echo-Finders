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
import type {
  AudioSink,
  CollectionStore,
  HapticsSink,
  LocationSource,
  TonesSink,
  Unsubscribe,
} from "./adapters.js";
import { toneFor } from "../proximity/tone.js";
import { presetFor } from "../modes.js";
import {
  PlaybackQueue,
  type Deferred,
  type PlaybackOptions,
  type PlaybackState,
  type QueuedEcho,
} from "./playback.js";

export type WalkEvent =
  | { readonly type: "position"; readonly position: Position }
  /** What is around the listener, best first. Drives the map and the nearby list. */
  | { readonly type: "nearby"; readonly echoes: readonly NearbyEcho[] }
  /** Hot-and-cold guidance towards the nearest sealed echo. Null when nothing is near. */
  | { readonly type: "guidance"; readonly guidance: Guidance | null }
  /** Echoes part-way through opening. Drives the progress ring. */
  | { readonly type: "opening"; readonly arriving: readonly Arriving[] }
  | { readonly type: "captured"; readonly capture: CaptureEvent }
  /** What is in the listener's ears, and what is waiting behind it. */
  | {
      readonly type: "playback";
      readonly state: PlaybackState;
      readonly waiting: readonly QueuedEcho[];
    }
  /**
   * Captured, but never heard.
   *
   * Emitted rather than swallowed because it is the one moment where the collection and the
   * listening diverge, and a UI that never mentioned it would leave someone wondering why a
   * pin went solid in silence.
   */
  | { readonly type: "deferred"; readonly deferred: Deferred }
  | { readonly type: "error"; readonly error: Error };

export interface WalkSessionDeps {
  readonly location: LocationSource;
  /** Optional: absent on iOS Safari, and on any device that cannot vibrate. */
  readonly haptics?: HapticsSink;
  /** Makes the proximity sound. Optional, like haptics — and the fallback when they are absent. */
  readonly tones?: TonesSink;
  /** Optional: a caller may prefer to drive audio from its own UI state. */
  readonly audio?: AudioSink;
  /**
   * Optional: where the collection is kept between sessions.
   *
   * Given one, the engine writes after every capture and every privacy change, so a
   * platform build gets persistence without reimplementing *when* to save — which is the
   * part that is easy to get subtly wrong, and invisible when you do.
   */
  readonly collection?: CollectionStore;
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
   * Start a captured echo without being asked, one after another.
   *
   * Off by default, because starting audio unbidden is right only when someone has asked
   * for it. Deliberately *not* the same switch as `PrivacySettings.handsFree`: that one
   * buys background location so echoes open with the screen off, and a listener can very
   * reasonably want their phone to keep collecting in a pocket while still choosing what
   * they hear. Two settings, because they are two questions.
   *
   * Nothing ever interrupts: the queue starts the next only when the current one is done.
   */
  readonly autoPlay?: boolean;

  /**
   * Restrict auto-play to echoes the listener picked in advance.
   *
   * The pre-departure case, and the one that makes auto-play tolerable on a long journey:
   * sit down before take-off, look at the twelve things the route passes, choose four.
   * Those four play themselves as they come up; the rest still open and still go into the
   * collection, they simply do not talk.
   *
   * Undefined means no restriction — everything on the route is fair game. An empty list is
   * not the same thing and is honoured literally: it means "I chose nothing", which is how
   * a listener switches auto-play off without switching it off.
   */
  readonly autoPlayOnly?: readonly string[];
  /** Which narrator to play. Falls back to whatever render exists. */
  readonly voiceId?: string;
  /** How many echoes may wait to be heard, and how far they may travel while waiting. */
  readonly playback?: PlaybackOptions;
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

  /** Resolved once, because three separate `?? "walking"` defaults is three chances to disagree. */
  private readonly mode: TravelMode;
  private readonly playback: PlaybackQueue;
  private stopAudio: Unsubscribe | null = null;
  private unwatch: Unsubscribe | null = null;
  /** The cue currently being rendered, so we do not restate it on every fix. */
  private activeCue: string | null = null;

  /**
   * Auto-play and the pre-chosen list, held separately because they change mid-journey.
   *
   * Everything else in `options` is fixed for the life of a session — the mode, the
   * capture rules, what the listener agreed to have remembered — but these two are
   * settings a person reaches for while walking. Leaving them in the constructor forced
   * the caller to build a new `WalkSession` to change one, and a new session is a new
   * `CaptureTracker`: ticking one box in the plan silently binned an hour's collection.
   */
  private autoPlay: boolean;
  private autoPlayOnly: readonly string[] | undefined;

  /**
   * What the listener has agreed to have remembered.
   *
   * Mutable for the same reason auto-play is: it is a setting somebody reaches for while
   * walking, and it decides what gets written to disk. Constructor-only, it would have
   * meant persisting under whatever the defaults were rather than under what they chose —
   * which is the one mistake in this area that cannot be undone after the fact.
   */
  private privacy: PrivacySettings;

  /**
   * Serialises writes, so two captures a few metres apart cannot race and leave the older
   * set on disk. Chained rather than queued: each save begins after the last has settled.
   */
  private saving: Promise<void> = Promise.resolve();

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
    this.mode = options.mode ?? "walking";
    this.autoPlay = options.autoPlay ?? false;
    this.autoPlayOnly = options.autoPlayOnly;
    this.playback = new PlaybackQueue(this.mode, options.playback ?? {});
    this.privacy = options.privacy ?? PRIVACY_DEFAULTS;
    this.guide = new ProximityGuide(options.proximity);

    const captureOptions: CaptureOptions = {
      mode: this.mode,
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
    // Subscribed once, not per item: the platform owns one player, and re-subscribing on
    // every track would leak a handler per echo over a walk.
    this.stopAudio ??= this.deps.audio?.ended(() => this.advance()) ?? null;
    this.unwatch = this.deps.location.watch(
      (position) => this.onFix(position),
      (error) => this.emit({ type: "error", error }),
    );
  }

  stop(): void {
    this.unwatch?.();
    this.unwatch = null;
    this.stopAudio?.();
    this.stopAudio = null;
    this.guide.reset();
    this.silenceGuidance();
    this.deps.audio?.stop();
    this.playback.clear();
  }

  // --- Playback -----------------------------------------------------------------------

  /** What is in the listener's ears right now. */
  get nowPlaying(): QueuedEcho | null {
    return this.playback.nowPlaying;
  }

  /** Play something on demand — tapped on the map, or picked out of the collection. */
  play(echo: Echo): void {
    const render = renderFor(echo.renders, this.options.voiceId);
    if (!render) return;
    const deferred = this.playback.playNow({ echo, render, atMs: Date.now() });
    if (deferred) this.emit({ type: "deferred", deferred });
    this.startCurrent();
  }

  pause(): void {
    this.playback.pause();
    this.deps.audio?.pause();
    this.emitPlayback();
  }

  resume(): void {
    this.playback.resume();
    this.deps.audio?.resume();
    this.emitPlayback();
  }

  /** Give up on the current item and take the next. */
  skip(): void {
    this.playback.skip();
    this.startCurrent();
  }

  /**
   * Start captured echoes without being asked. Changeable mid-journey, and nothing else
   * about the session changes with it — the collection, the queue and the position stream
   * all carry on.
   */
  setAutoPlay(on: boolean): void {
    this.autoPlay = on;
  }

  /**
   * Narrow auto-play to a chosen few. Undefined lifts the restriction; an empty list is
   * honoured literally and means "I chose nothing".
   */
  setAutoPlayOnly(echoIds: readonly string[] | undefined): void {
    this.autoPlayOnly = echoIds;
  }

  /**
   * Change what may be remembered, and rewrite storage to match immediately.
   *
   * Turning a setting *off* has to take effect on what is already stored, not just on what
   * is stored next — otherwise "stop recording where I was standing" leaves every previous
   * standing position sitting on disk, which is the opposite of what was asked.
   */
  setPrivacy(privacy: PrivacySettings): void {
    this.privacy = privacy;
    this.persist();
  }

  /** Did the listener pick this one, back when they were choosing? */
  private mayAutoPlay(echoId: string): boolean {
    const chosen = this.autoPlayOnly;
    return chosen === undefined || chosen.includes(echoId);
  }

  /** The current item ran out. Take the next, if there is one. */
  private advance(): void {
    this.playback.finished();
    this.startCurrent();
  }

  private startCurrent(): void {
    const item = this.playback.nowPlaying;
    if (item) this.deps.audio?.play(item.render.audioKey);
    else this.deps.audio?.stop();
    this.emitPlayback();
  }

  private emitPlayback(): void {
    this.emit({
      type: "playback",
      state: this.playback.state,
      waiting: this.playback.waiting,
    });
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
      mode: this.mode,
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
      position.timestamp,
    );
    // Rendered *before* the event goes out. The other way round, any consumer that reads
    // the haptics sink when the event arrives — which is exactly how a UI shows the buzz it
    // cannot feel — is looking at the previous fix's cue, one whole second behind the
    // guidance it is drawn next to.
    this.renderGuidance(guidance);
    this.emit({ type: "guidance", guidance });

    // Anything still waiting that the listener has now walked away from gives up. Only
    // waiting items — whatever is already playing finishes wherever they have got to.
    const gone = this.playback.moved(position.at);
    if (gone.length > 0) {
      for (const deferred of gone) this.emit({ type: "deferred", deferred });
      this.emitPlayback();
    }
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

    // Offered to the queue rather than played: a second capture arriving while the first is
    // still talking used to call `play()` straight over it, and at a stop where two echoes
    // sit a few metres apart that is the normal case, not the edge one.
    if (this.autoPlay && this.mayAutoPlay(capture.echo.id)) {
      const render = renderFor(capture.echo.renders, this.options.voiceId);
      if (render) {
        const wasIdle = this.playback.nowPlaying === null;
        const outcome = this.playback.offer({ echo: capture.echo, render, atMs: Date.now() });
        if (outcome.deferred) this.emit({ type: "deferred", deferred: outcome.deferred });
        if (outcome.started && wasIdle) this.deps.audio?.play(render.audioKey);
        this.emitPlayback();
      }
    }
    // A captured echo is no longer a destination; drop any approach in progress so the
    // next fix starts guiding towards something else.
    this.guide.reset();
    this.emit({ type: "captured", capture });
    this.persist();
  }

  /**
   * Write the collection as it now stands.
   *
   * A failed write is reported and then let go. The capture itself already happened — the
   * listener stood there, the echo opened — and throwing that away because a disk was full
   * would turn a storage problem into a lie about where somebody has been.
   */
  private persist(): void {
    const store = this.deps.collection;
    if (!store) return;
    const records = this.collection;
    this.saving = this.saving
      .then(() => store.save(records))
      .catch((cause: unknown) => {
        this.emit({
          type: "error",
          error: new Error("Could not save your collection", { cause }),
        });
      });
  }

  /**
   * Pass the cue to the device, but only when it has actually changed.
   *
   * A fix can arrive every second; restating an identical pattern that often would cut it
   * off mid-pulse and turn a rhythm into a stutter. Comparing kind and rate is enough —
   * those are what a body notices, and the sound is derived from the same cue so the two
   * channels change together or not at all.
   *
   * Nothing is rendered at all unless the mode is self-directed. Guidance answers "which
   * way should I go", and a passenger on an aircraft has no answer to give: buzzing at
   * them about a landmark eighty kilometres off the track describes a choice they do not
   * have. The engine still *computes* guidance in every mode — proximity is proximity, and
   * the map still wants it — it simply stops telling the body about it.
   */
  private renderGuidance(guidance: Guidance | null): void {
    if (!presetFor(this.mode).selfDirected) return;

    const haptics = this.deps.haptics;
    const tones = this.deps.tones;
    if (!haptics && !tones) return;

    if (!guidance || guidance.cue.kind === "none") {
      this.silenceGuidance();
      return;
    }

    const signature = `${guidance.cue.kind}:${guidance.cue.intervalMs}`;
    if (signature === this.activeCue) return;

    this.activeCue = signature;
    haptics?.play(guidance.cue);

    /*
      Sound only while something is actually changing.
      
      A sonar pings because a contact is moving relative to you. Standing on a corner
      reading the screen is not that, and a cue that keeps scanning while somebody browses
      is noise they did not ask for — which is exactly how it felt: tap an echo, hear a
      ping, for no reason connected to the tap.
      
      "Steady" is precisely the state of not closing on anything, so it is the state that
      should be silent. The haptic still fires through it, because a buzz in a pocket is
      addressed to one person and a sound in a street is addressed to everyone nearby.
    */
    if (guidance.cue.kind === "steady") tones?.stop();
    else tones?.play(toneFor(guidance.cue));
  }

  private silenceGuidance(): void {
    if (this.activeCue === null) return;
    this.activeCue = null;
    this.deps.haptics?.stop();
    this.deps.tones?.stop();
  }

  private emit(event: WalkEvent): void {
    for (const handler of this.handlers) handler(event);
  }
}
