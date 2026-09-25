/**
 * The street, humming.
 *
 * On foot the map is the wrong object (`docs/05-walking.md`). A route map answers "where am
 * I along this", which is a passenger's question; a walker has a here, a few hundred metres
 * of there, and a head they can turn. So walking gets an interface made of sound: every echo
 * within reach emits a quiet tone, placed at its true bearing by a Web Audio panner. Turn,
 * and the tones move around your head. Walk towards one and it swells. It works with the
 * phone face down in a pocket, which is the only posture this product has ever wanted.
 *
 * Microsoft Soundscape shipped the core of this for five years: a rhythmic sound from the
 * direction of the target, higher pitched when you walk straight at it. Built for blind
 * users, and better for everyone walking down a street for the same reason. Three things
 * here are ours rather than theirs.
 *
 * **The neighbourhood is a chord.** Soundscape beacons one destination. This hums everything
 * in range at once, one note per category, and the notes are a pentatonic scale so that any
 * combination of them is consonant. That is the whole reason it is bearable: nine arbitrary
 * frequencies played together are a cluster, and nine notes of a pentatonic are a chord. A
 * corner with a ghost story on your left and a food story behind you does not sound like a
 * corner with two history plaques.
 *
 * **Sealed echoes sound sealed.** An echo you have not synced is heard through a low-pass
 * filter with a little noise under it: present, placed, but muffled, like something behind a
 * wall. Standing in the right place opens the filter and drops the noise away, over about a
 * second. That resolution *is* the sync. It is the Assassin's Creed idea done as sound
 * rather than as a progress ring: the mechanic is the fiction rather than a report on it.
 *
 * **Silence is a feature.** Nothing hums while an echo is playing. The hunt and the story
 * never compete, which is the mistake every location-audio app makes.
 *
 * **And one of them can be the beacon.** The chord tells you what is around; it does not get
 * you anywhere in particular, which is the half of Soundscape this originally left out. Pick
 * an echo and the rest fall to a whisper, and the one you picked rises in pitch as you turn
 * towards it and walk at it. That pitch is the steering: it is the difference between
 * knowing something is over there and being able to find the door.
 *
 * Deliberately not here: elevation. Open-ear and bone-conduction hardware localises the
 * vertical axis badly, which is why every system in the literature uses pitch for height and
 * why we do not try to place anything above or below you.
 */

import type { EchoCategory } from "@echofinders/core";

/** One thing to hum, as the view already knows it. */
export interface HumVoice {
  readonly id: string;
  readonly category: EchoCategory;
  /** Degrees clockwise from true north. */
  readonly bearingDeg: number;
  readonly distanceKm: number;
  /** Inside this, it is yours for the standing. Drives the pulse and the filter. */
  readonly reachKm: number;
  /** Not yet synced: muffled, with noise under it. */
  readonly sealed: boolean;
}

/**
 * A note per category, from a pentatonic scale.
 *
 * The scale is the entire reason this is listenable. Nine frequencies chosen for their own
 * sake are a cluster; nine notes of A minor pentatonic are a chord in any combination, which
 * is what lets us hum four at once without designing each pairing. Lower notes for the
 * heavier subjects, which is not science but is how everybody hears them.
 */
const NOTE: Record<EchoCategory, number> = {
  "true-crime": 110.0, // A2
  legend: 130.81, // C3
  history: 146.83, // D3
  built: 164.81, // E3
  land: 196.0, // G3
  people: 220.0, // A3
  arts: 261.63, // C4
  "food-drink": 293.66, // D4
  kids: 329.63, // E4
};

/**
 * And a waveform per category, because pitch alone is not identity.
 *
 * Two categories a fifth apart still sound like the same instrument, and the point is to
 * know what is on your left without looking. Sine for the quiet subjects, triangle for the
 * ones with an edge.
 */
const WAVE: Record<EchoCategory, OscillatorType> = {
  "true-crime": "triangle",
  legend: "triangle",
  history: "sine",
  built: "sine",
  land: "sine",
  people: "sine",
  arts: "triangle",
  "food-drink": "sine",
  kids: "triangle",
};

/** Beyond this nothing hums. Past it a tone is not guidance, it is a rumour. */
const RANGE_KM = 1.2;
/** Four at most. Everything beyond that is noise rather than a chord. */
const MAX_VOICES = 4;
/** Pulses per second at the near and far ends. The hot-and-cold rhythm, as sound. */
const PULSE_NEAR = 3.1;
const PULSE_FAR = 0.65;
/** Where the low-pass sits when an echo is sealed, and when it has resolved. */
const MUFFLED_HZ = 420;
const OPEN_HZ = 7800;
/** The whole bed, kept well under the narration it plays beneath. */
const MASTER_GAIN = 0.16;
/**
 * How far the beacon's pitch rises when you are walking straight at it, in cents.
 *
 * Seven semitones, which is a fifth: far enough to hear without a reference note, and a
 * consonant interval so a beacon sweeping up through it does not fight the others on its way.
 * Soundscape uses "higher pitched when on course" and this is that, made continuous, because
 * a threshold tells you when you are right and a slope tells you which way to turn.
 */
const BEACON_CENTS = 700;
/** What the rest of the chord drops to while a beacon is set. Present, but out of the way. */
const BACKGROUND = 0.12;

interface Voice {
  readonly osc: OscillatorNode;
  readonly noise: AudioBufferSourceNode;
  readonly noiseGain: GainNode;
  readonly filter: BiquadFilterNode;
  readonly amp: GainNode;
  readonly lfo: OscillatorNode;
  readonly lfoDepth: GainNode;
  readonly panner: PannerNode;
  sealed: boolean;
}

export class Hum {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private readonly voices = new Map<string, Voice>();
  private muted = true;
  private headingDeg: number | null = null;
  private wanted: readonly HumVoice[] = [];
  private beaconId: string | null = null;

  /**
   * Browsers refuse audio until somebody has tapped the page, so nothing is built until the
   * hum is actually switched on. A refusal is not worth breaking anything over: this is a
   * secondary channel and the rose says the same thing on screen.
   */
  private context(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = MASTER_GAIN;
        this.master.connect(this.ctx.destination);
        // The listener never moves or turns. Rotating the *world* around a fixed listener
        // is the same geometry and avoids the orientation-vector maths entirely, which is
        // the part every Web Audio spatialisation gets wrong at least once.
        const listener = this.ctx.listener;
        if (listener.forwardZ) {
          listener.positionX.value = 0;
          listener.positionY.value = 0;
          listener.positionZ.value = 0;
          listener.forwardX.value = 0;
          listener.forwardY.value = 0;
          listener.forwardZ.value = -1;
          listener.upX.value = 0;
          listener.upY.value = 1;
          listener.upZ.value = 0;
        }
      } catch {
        return null;
      }
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  setMuted(muted: boolean) {
    if (muted === this.muted) return;
    this.muted = muted;
    if (muted) this.stop();
    else this.apply();
  }

  /**
   * The one you are going to, or null for the ambient chord.
   *
   * A beacon is always heard, even from outside the range everything else obeys and even
   * when four nearer things would otherwise have taken every voice: you asked for it, so it
   * is no longer competing for a slot.
   */
  setBeacon(echoId: string | null) {
    if (echoId === this.beaconId) return;
    this.beaconId = echoId;
    this.apply();
  }

  /** Which way the phone is pointing. Null means no compass, and the hum goes mono. */
  setHeading(deg: number | null) {
    this.headingDeg = deg;
    this.place();
  }

  /**
   * What is around you now.
   *
   * Called on every position fix, so it has to be cheap and it has to be stable: a voice
   * that already exists is updated rather than rebuilt, because rebuilding an oscillator
   * every quarter of a second is a click track.
   */
  setVoices(all: readonly HumVoice[]) {
    this.wanted = pick(all, this.beaconId);
    this.apply();
  }

  private apply() {
    const ctx = this.context();
    if (!ctx || !this.master) return;

    const keep = new Set(this.wanted.map((v) => v.id));
    for (const [id, voice] of this.voices) {
      if (!keep.has(id)) {
        this.release(voice);
        this.voices.delete(id);
      }
    }
    for (const want of this.wanted) {
      const existing = this.voices.get(want.id);
      if (existing) this.update(existing, want, ctx);
      else this.voices.set(want.id, this.build(want, ctx));
    }
    this.place();
  }

  private build(want: HumVoice, ctx: AudioContext): Voice {
    const osc = ctx.createOscillator();
    osc.type = WAVE[want.category];
    osc.frequency.value = NOTE[want.category];

    const noise = ctx.createBufferSource();
    noise.buffer = this.noise(ctx);
    noise.loop = true;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = want.sealed ? MUFFLED_HZ : OPEN_HZ;
    filter.Q.value = 0.8;

    // The pulse, as amplitude modulation rather than scheduled envelopes. One oscillator
    // beats a `setInterval` that drifts against the audio clock and clicks when it slips.
    const amp = ctx.createGain();
    amp.gain.value = 0.45;
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.42;
    lfo.connect(lfoDepth).connect(amp.gain);

    const panner = ctx.createPanner();
    panner.panningModel = "HRTF";
    // Direction only. Distance is loudness, and loudness is ours to curve rather than the
    // panner's to model, so every voice sits on the same small sphere.
    panner.distanceModel = "linear";
    panner.refDistance = 1;
    panner.maxDistance = 2;
    panner.rolloffFactor = 0;

    osc.connect(filter);
    noise.connect(noiseGain).connect(filter);
    filter.connect(amp).connect(panner).connect(this.master!);

    const voice: Voice = {
      osc,
      noise,
      noiseGain,
      filter,
      amp,
      lfo,
      lfoDepth,
      panner,
      sealed: want.sealed,
    };
    this.update(voice, want, ctx);
    osc.start();
    noise.start();
    lfo.start();
    return voice;
  }

  private update(voice: Voice, want: HumVoice, ctx: AudioContext) {
    const now = ctx.currentTime;
    const near = nearness(want);
    const isBeacon = want.id === this.beaconId;

    // Loudness by distance, on a curve rather than a line: the last fifty metres should feel
    // like arriving, and a linear ramp feels like nothing at all.
    //
    // With a beacon set the rest of the chord falls back rather than stopping. Cutting them
    // would make picking one thing feel like turning the app off, and they are still the
    // answer to "what else is here" while you walk.
    const loudness = 0.16 + 0.5 * near * near;
    const ducked = this.beaconId !== null && !isBeacon ? loudness * BACKGROUND : loudness;
    voice.amp.gain.setTargetAtTime(ducked, now, 0.25);
    voice.lfo.frequency.setTargetAtTime(PULSE_FAR + (PULSE_NEAR - PULSE_FAR) * near, now, 0.4);

    /*
     * The resolution.
     *
     * Ramped over a second rather than switched, because this is the moment the product is
     * about. A filter that snaps open is a state change; one that opens is a memory coming
     * into focus. The noise under a sealed tone is what makes "muffled" read as *behind
     * something* rather than as "quiet".
     */
    const resolving = voice.sealed && !want.sealed;
    const glide = resolving ? 0.4 : 0.2;
    voice.filter.frequency.setTargetAtTime(want.sealed ? MUFFLED_HZ : OPEN_HZ, now, glide);
    voice.noiseGain.gain.setTargetAtTime(want.sealed ? 0.055 * (0.4 + near) : 0, now, glide);
    voice.sealed = want.sealed;
  }

  /** Put every voice where it actually is, given which way you are facing. */
  private place() {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const want of this.wanted) {
      const voice = this.voices.get(want.id);
      if (!voice) continue;
      /*
       * No compass, no direction. A bearing relative to a heading we do not have is a
       * guess, and a guess placed in somebody's left ear is worse than the centre: they
       * will turn towards it. Mono until the compass is granted, and the rose says so.
       */
      const relative =
        this.headingDeg === null ? 0 : ((want.bearingDeg - this.headingDeg) * Math.PI) / 180;
      const radius = 1.2;
      voice.panner.positionX.setTargetAtTime(Math.sin(relative) * radius, now, 0.08);
      voice.panner.positionY.setTargetAtTime(0, now, 0.08);
      // Web Audio's listener faces −Z, so "ahead" is negative and "behind" is positive.
      voice.panner.positionZ.setTargetAtTime(-Math.cos(relative) * radius, now, 0.08);

      /*
       * The steering.
       *
       * The beacon rises in pitch as you turn towards it, from nothing when it is behind you
       * to a full fifth when you are walking straight at it. Continuous rather than a
       * threshold, deliberately: "you are on course" tells you when you are already right,
       * and a slope tells you which way to turn, which is the thing you actually need while
       * turning. Panning alone cannot do this, because front and back sound nearly identical
       * over headphones and walking away from something is the one mistake worth preventing.
       *
       * Nothing to steer by without a compass, so the detune stays at zero and the beacon is
       * simply the loud one.
       */
      if (want.id === this.beaconId) {
        const onCourse = this.headingDeg === null ? 0 : Math.max(0, Math.cos(relative));
        voice.osc.detune.setTargetAtTime(onCourse * onCourse * BEACON_CENTS, now, 0.12);
      } else if (voice.osc.detune.value !== 0) {
        voice.osc.detune.setTargetAtTime(0, now, 0.2);
      }
    }
  }

  /** White noise, one second of it, made once and shared by every voice. */
  private noise(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer;
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;
    return buffer;
  }

  private release(voice: Voice) {
    const ctx = this.ctx;
    if (!ctx) return;
    // Faded rather than cut. A tone that stops dead is a click, and a click from an echo
    // that merely went out of range reads as a fault.
    voice.amp.gain.setTargetAtTime(0, ctx.currentTime, 0.12);
    const stopAt = ctx.currentTime + 0.6;
    try {
      voice.osc.stop(stopAt);
      voice.noise.stop(stopAt);
      voice.lfo.stop(stopAt);
    } catch {
      /* Already stopped. Nothing to do and nothing worth reporting. */
    }
  }

  stop() {
    for (const [id, voice] of this.voices) {
      this.release(voice);
      this.voices.delete(id);
    }
  }

  /** Let go of the audio hardware entirely. */
  close() {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
  }
}

/**
 * Which four.
 *
 * Nearest first, and never two of the same category at once: two history plaques a street
 * apart are the same note twice, which is a beat frequency rather than a chord and is the
 * one combination that genuinely sounds broken.
 */
function pick(all: readonly HumVoice[], beaconId: string | null): HumVoice[] {
  const chosen: HumVoice[] = [];
  const heard = new Set<EchoCategory>();

  // The beacon first and unconditionally. It ignores the range and the one-per-category
  // rule, both of which exist to keep an *ambient* chord legible and neither of which should
  // be able to silence the thing somebody is walking towards.
  const beacon = beaconId ? all.find((v) => v.id === beaconId) : undefined;
  if (beacon) {
    chosen.push(beacon);
    heard.add(beacon.category);
  }

  const inRange = all
    .filter((v) => v.distanceKm <= RANGE_KM && v.id !== beaconId)
    .slice()
    .sort((a, b) => a.distanceKm - b.distanceKm);
  for (const voice of inRange) {
    if (chosen.length >= MAX_VOICES) break;
    if (heard.has(voice.category)) continue;
    heard.add(voice.category);
    chosen.push(voice);
  }
  return chosen;
}

/** 0 at the edge of range, 1 once you are inside the echo's own radius. */
function nearness(voice: HumVoice): number {
  if (voice.distanceKm <= voice.reachKm) return 1;
  const span = Math.max(RANGE_KM - voice.reachKm, 0.001);
  return Math.max(0, Math.min(1, 1 - (voice.distanceKm - voice.reachKm) / span));
}
