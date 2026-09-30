/**
 * The echo, as a creature.
 *
 * An echo is a thing that wants to be heard, and this is what it looks like. It is the
 * only character in the product and it is spent carefully — see `characterFor` for who
 * gets one and who stays a mark.
 *
 * THIS IS MEASURED FROM THE REFERENCE, NOT REMEMBERED FROM IT. The first version was
 * drawn from a description of the picture and the report back was "doesn't really morph
 * at all and doesn't look like the graphics i provided". Both halves were true. So the
 * image was opened and measured, pixel by pixel, and every number below is a reading off
 * it rather than a judgement about it. In units of the body radius R, origin at the
 * centre of the sphere, y down:
 *
 *   body radius        R = 238px in a 1254px image, centred at (637, 647)
 *   radial ramp        INVERTED — #BE4704 at 0.30R out to #FAD042 at 0.99R. The sphere
 *                      is DARKEST IN THE MIDDLE and lit at the edge, which is the single
 *                      biggest thing the first version got backwards: it had a top-left
 *                      highlight falling off to a dark rim, which is a billiard ball.
 *                      This is a glass bead with a light behind it.
 *   rim                pale yellow over the top arc (#FFF96C at 270deg) turning orange at
 *                      the bottom (#F1971D at 90deg)
 *   outer glow         alpha 198 at 1.01R, 76 at 1.04R, 25 at 1.08R. Tight, not a haze.
 *   left eye           centre (-0.099, +0.142)  semi-axes (0.142, 0.271)  tilt -14deg
 *   right eye          centre (+0.654, -0.073)  semi-axes (0.103, 0.254)  tilt -12deg
 *   highlight          (+0.403, -0.713) semi (0.088, 0.050) at +23deg, with a thin
 *                      sliver above it at (+0.426, -0.874) semi (0.118, 0.018)
 *   speckle            one speck per ~24 body pixels, mean #F19E3E, sub-pixel
 *   satellites         FIVE, not six. Cream cores (#FEF9E0) inside yellow rings
 *                      (#FDF5A8), each with a glow about 1.8x the core:
 *                        (+0.996, -1.235) core 0.084R    (-1.261, -0.479) core 0.055R
 *                        (+1.050, +1.084) core 0.050R    (-1.340, +0.361) core 0.046R
 *                        (-0.849, -1.197) core 0.013R
 *
 * The eyes are not vertical bars. They are soft ellipses, and the pair is pushed hard to
 * the right with the right one narrower and higher — which is not a mistake in the
 * artwork and was read as one the first time round. It is a sphere turned in three
 * quarter view: the far eye is foreshortened and carried up by the curve. That is why
 * copying the offset without the sphere made it look broken, and it is why this file
 * treats `sealed` as the turned pose and every other face as the creature having
 * turned to look at you.
 *
 * THE EYES ARE STILL A PAUSE BUTTON. Two soft uprights side by side is the pause glyph,
 * so an echo sitting sealed at a street corner is a story that has been PAUSED there, in
 * some cases for a century. Syncing swings the two together into a play triangle. You
 * are not opening a file, you are pressing play on something that stopped.
 *
 *   sealed   two ellipses, turned away, dim     the story, paused, waiting
 *   calling  the same pair, turned to you, lit  close enough that it has noticed you
 *   armed    a play triangle                    synced; press it
 *   playing  two uprights again                 it is talking, and this pauses it
 *   heard    two closed lids, cold              nothing left to say
 *
 * AND THE MORPH IS DRIVEN FROM JAVASCRIPT, WHICH IS THE OTHER HALF OF THE REPORT.
 *
 * It used to be `transition: d` in the stylesheet. Measured in Chromium, that genuinely
 * works — the computed `d` interpolates frame by frame. It is still the wrong mechanism
 * for this product, for two reasons that took a browser to find:
 *
 *   `d` as a CSS property is a Chromium feature. Firefox does not have it, and this
 *   sandbox cannot install WebKit to check Safari (the download is blocked), which means
 *   the morph on the one browser this app is mostly opened in — iOS Safari — is a thing
 *   nobody here can test. A visual effect that cannot be verified on the target device
 *   is not an effect, it is a hope.
 *
 *   And even where it ran, it was invisible. `sealed` and `calling` differed by four
 *   units in a hundred-unit box, scaled onto a 13px map pin: half a pixel of travel over
 *   320ms. The states now differ by a turn of the head, which is a change you can see at
 *   pin size.
 *
 * So every face is 26 numbers — one closed path of four cubic segments, the same four
 * commands in the same order — and the tween is an ordinary rAF lerp between two arrays.
 * It runs everywhere, it can be sampled in a test, and it respects reduced motion by
 * jumping straight to the target.
 */

import { memo, useEffect, useRef, useState } from "react";

/** What the creature is doing. See the file comment: four of these are one shape. */
export type EchoFace = "sealed" | "calling" | "armed" | "playing" | "heard";

export interface EchoCharacterProps {
  readonly face: EchoFace;
  /** Radius of the body in user units. Everything else is a fraction of it. */
  readonly r: number;
  /**
   * A stable id for this instance's gradients.
   *
   * SVG gradient ids are document-global, so two creatures on one screen with the same id
   * silently share a fill. The map draws up to two of these at once.
   */
  readonly uid: string;
  /** Degrees to swing the gaze, positive clockwise. The creature looks at things. */
  readonly gazeDeg?: number;
  /**
   * Speckle, satellites and the second highlight.
   *
   * Off by default below 30 units, because at a 13px map pin the speckle is smaller than
   * a pixel and the satellites are five grey dots making the pin look dirty. They earn
   * their place on the sync orb and nowhere else.
   */
  readonly detail?: boolean;
}

/* ── shapes ──────────────────────────────────────────────────────────────────
 *
 * Every face is a pair of closed four-segment cubics, in a box where the body radius is
 * 100. One M, four Cs, one Z — 26 numbers — so any two of them tween point for point.
 */

/** Circle-to-bezier constant. Four segments of this approximate an ellipse to ~0.02%. */
const KAPPA = 0.5522847498307933;

type Shape = readonly number[];

/** An ellipse as four cubic segments, starting at the top and going clockwise. */
function ellipse(cx: number, cy: number, rx: number, ry: number, rotDeg: number): Shape {
  const kx = KAPPA * rx;
  const ky = KAPPA * ry;
  const flat: number[] = [
    0, -ry,
    kx, -ry, rx, -ky, rx, 0,
    rx, ky, kx, ry, 0, ry,
    -kx, ry, -rx, ky, -rx, 0,
    -rx, -ky, -kx, -ry, 0, -ry,
  ];
  const a = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const out: number[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    const x = flat[i]!;
    const y = flat[i + 1]!;
    out.push(cx + x * cos - y * sin, cy + x * sin + y * cos);
  }
  return out;
}

/**
 * Four corners joined by straight lines, written as cubics.
 *
 * Straight lines drawn as curves rather than as `L`, because a tween can only interpolate
 * between paths with the same commands, and half the faces here are round.
 */
function corners(pts: readonly (readonly [number, number])[]): Shape {
  const out: number[] = [pts[0]![0], pts[0]![1]];
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = pts[i]!;
    const [bx, by] = pts[(i + 1) % 4]!;
    out.push(
      ax + (bx - ax) / 3, ay + (by - ay) / 3,
      ax + ((bx - ax) * 2) / 3, ay + ((by - ay) * 2) / 3,
      bx, by,
    );
  }
  return out;
}

/*
 * THE PLAY TRIANGLE, as two halves that meet on the centre line.
 *
 * Both eyes have to end up somewhere, and the two obvious answers are both wrong: fading
 * one out is a cross-dissolve, and collapsing one onto a point makes the left eye look
 * like it was eaten. Giving each eye half of the triangle means both of them visibly
 * become part of it, and because they share a fill and a two-unit overlap on the seam
 * they land as one solid shape.
 *
 * The apex sits at +56 rather than at the rim. The first version ran the triangle from
 * edge to edge, and rendered, the ball read as a circle with a triangle stuck on it
 * rather than as a creature with a feature.
 */
/*
 * The starting corner of each half matters, and is not arbitrary.
 *
 * A tween walks point one to point one, point two to point two. Both eye ellipses start
 * at their top, so each half of the triangle starts at whichever of its corners is
 * nearest that eye's top — otherwise the path rotates as it morphs and the shape pinches
 * halfway through. Rendered at t=0.4 with the lower half starting at its left edge, there
 * was a visible notch; starting it at the apex there is not.
 */
const TRI_UPPER = corners([[-32, -46], [12, -24], [56, 0], [-32, 1]]);
const TRI_LOWER = corners([[56, 0], [12, 24], [-32, 46], [-32, -1]]);

/**
 * The faces.
 *
 * `sealed` is the reference photograph, to three decimal places: the turned head, the far
 * eye foreshortened and lifted. Everything else is the creature having turned to look at
 * you, which is why the pair goes symmetric the moment it notices you — and why the morph
 * is now something you can see at map-pin size.
 */
const EYES: Record<EchoFace, readonly [Shape, Shape]> = {
  // Measured: (-0.099, +0.142) r(0.142, 0.271) -14deg, and (+0.654, -0.073) r(0.103, 0.254) -12deg.
  sealed: [
    ellipse(-9.9, 14.2, 14.2, 27.1, -14),
    ellipse(65.4, -7.3, 10.3, 25.4, -12),
  ],
  // Turned to you, and opened. The same two shapes, square on and a little larger.
  calling: [
    ellipse(-23, 0, 14.6, 29.5, -5),
    ellipse(23, 0, 14.6, 29.5, 5),
  ],
  armed: [TRI_UPPER, TRI_LOWER],
  // Pause again, and this one stops the voice. Slightly tighter than `calling`.
  playing: [
    ellipse(-21, 0, 13, 27, -4),
    ellipse(21, 0, 13, 27, 4),
  ],
  /*
   * Closed, content. Still two ellipses rather than a pair of arcs, because a lid that
   * closes by flattening is one tween from the open eye, and an arc is a different shape
   * that can only be swapped in.
   */
  heard: [
    ellipse(-22, 8, 15.5, 3.6, -6),
    ellipse(22, 8, 15.5, 3.6, 6),
  ],
};

/* ── skin ────────────────────────────────────────────────────────────────── */

interface Skin {
  /**
   * The body, as five stops at 0, 46, 74, 92 and 100 percent of the radius.
   *
   * A ramp rather than three named colours, because the reference is a continuous one
   * and the first attempt at this held the core colour flat to a third of the radius,
   * which put a visible dark disc in the middle of the ball. The percentages are where
   * the measured samples fall: 0.50R is #C45308, 0.75R is #D46F17, 0.90R is #F09C27.
   */
  readonly ramp: readonly [string, string, string, string, string];
  /**
   * The lit edge, sampled off the reference at 270, 0/180 and 90 degrees.
   *
   * Three colours rather than two, because a straight blend from the pale top to the
   * warm bottom runs too yellow across the sides: measured, the middle stop came out 42
   * adrift at the left edge and 46 at the right. The sides are their own reading.
   */
  readonly rimTop: string;
  readonly rimMid: string;
  readonly rimBot: string;
  readonly glow: string;
  readonly eye: string;
  readonly speck: string;
  /** How lit the whole thing is, 0 to 1. Drives the glow and the highlight. */
  readonly lit: number;
}

const SKIN: Record<EchoFace, Skin> = {
  /*
   * SEALED IS THE REFERENCE, exactly, because sealed is the state the artwork is a
   * picture of and the state a person spends nearly all their time looking at.
   *
   * The first version banked this right down to near black, on the reasoning that a
   * sealed echo is a story paused in the dark. Two things wrong with that. Rendered at
   * 15px on the map it was a brown smudge. And it meant the one face anybody actually
   * sees was the one furthest from the picture that was handed over, which is most of
   * what "doesn't look like the graphics i provided" was pointing at.
   *
   * Asleep is now carried by the eyes and by how the thing behaves, not by turning the
   * light off: every other face is brighter than this one rather than this one being
   * darker than the artwork.
   */
  sealed: {
    ramp: ["#A83B02", "#C45308", "#D4701A", "#F1A32C", "#FAD042"],
    rimTop: "#FFF96C", rimMid: "#F8C024", rimBot: "#F1971D",
    glow: "#FF9E12", eye: "#FDF8E1", speck: "#F19E3E", lit: 0.85,
  },
  // It has noticed you: turned square on, and a stop hotter than resting.
  calling: {
    ramp: ["#B94405", "#D66110", "#E68428", "#FCB93C", "#FFE070"],
    rimTop: "#FFFDA8", rimMid: "#FFD44A", rimBot: "#FBA82A",
    glow: "#FFAE28", eye: "#FEFBEE", speck: "#F8B054", lit: 1,
  },
  // Synced, and hot. The one state brighter than the artwork, because it is the one
  // moment the creature is being pressed.
  armed: {
    ramp: ["#C95004", "#E97214", "#F89A30", "#FFCA5C", "#FFF4B4"],
    rimTop: "#FFFFDC", rimMid: "#FFE886", rimBot: "#FFC44E",
    glow: "#FFC848", eye: "#FFFDF2", speck: "#FFC873", lit: 1,
  },
  playing: {
    ramp: ["#B24204", "#D45E0C", "#E8831F", "#F9B23A", "#FDDB68"],
    rimTop: "#FFF8A0", rimMid: "#FCCB40", rimBot: "#F6A62A",
    glow: "#FFB02A", eye: "#FEFAEA", speck: "#F6AC4A", lit: 0.92,
  },
  // The ember gone cold. Same sphere, no light left behind it, and still legible at
  // 15px, which a near-black version is not.
  heard: {
    ramp: ["#4A2409", "#5E3410", "#74491E", "#8C6430", "#A67F46"],
    rimTop: "#A8925C", rimMid: "#917A44", rimBot: "#7A5A2E",
    glow: "#7A4E10", eye: "#CDBC94", speck: "#8A6534", lit: 0.3,
  },
};

/** Where the five body stops sit, as a percentage of the radius. See `Skin.ramp`. */
const RAMP_AT = [0, 46, 74, 92, 100] as const;

/**
 * The satellites, measured off the reference: five, not six, and all different sizes.
 *
 * Centre and core radius are both in units of the body radius. The glow around each is
 * about 1.8x its core, which is the ratio the image holds across all five.
 */
const SATELLITES: readonly { readonly x: number; readonly y: number; readonly r: number }[] = [
  { x: 0.996, y: -1.235, r: 0.084 },
  { x: -1.261, y: -0.479, r: 0.055 },
  { x: 1.050, y: 1.084, r: 0.050 },
  { x: -1.340, y: 0.361, r: 0.046 },
  { x: -0.849, y: -1.197, r: 0.013 },
];

/**
 * The speckle, as a fixed set of points rather than a random one.
 *
 * Random would re-scatter on every render and make the creature fizz. This is a cheap
 * integer hash walked once at module load, so every echo on every device has the same
 * dust in the same places, which is what a texture is. Density is the measured one: about
 * one speck per 24 body pixels, thinned here because these are drawn at a visible size
 * rather than at the reference's sub-pixel scale.
 */
const SPECKS: readonly (readonly [number, number, number])[] = (() => {
  const out: [number, number, number][] = [];
  let h = 0x2f6e2b1;
  const next = () => {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    return h / 0x7fffffff;
  };
  while (out.length < 110) {
    // Uniform over the disc: sqrt on the radius, or everything piles up in the middle.
    const a = next() * Math.PI * 2;
    const d = Math.sqrt(next()) * 0.93;
    out.push([Math.cos(a) * d, Math.sin(a) * d, 0.004 + next() * 0.007]);
  }
  return out;
})();

/* ── the tween ───────────────────────────────────────────────────────────── */

/** Slight overshoot, so the triangle LANDS rather than arrives. */
const easeOutBack = (t: number) => {
  const c = 1.7;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
};

const MORPH_MS = 340;

/**
 * Tween between two equal-length point arrays with requestAnimationFrame.
 *
 * Deliberately not `transition: d`. That is a Chromium-only CSS property, the one browser
 * that matters most here is Safari, and this sandbox cannot install WebKit to find out
 * whether it works there. Thirty lines of arithmetic run everywhere and can be sampled by
 * a test, which is worth more than a stylesheet one-liner that might be doing nothing on
 * half the phones.
 *
 * It keeps the CURRENT values as the start of the next tween, so a face that changes
 * mid-flight continues from where it actually is rather than snapping back.
 */
function useMorph(target: readonly [Shape, Shape]): readonly [Shape, Shape] {
  const cur = useRef(target);
  const from = useRef(target);
  const to = useRef(target);
  const start = useRef(0);
  const frame = useRef(0);
  const [, redraw] = useState(0);

  useEffect(() => {
    if (to.current === target) return;
    from.current = cur.current;
    to.current = target;

    const reduced =
      typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      cur.current = target;
      redraw((n) => n + 1);
      return;
    }

    start.current = performance.now();
    cancelAnimationFrame(frame.current);
    const step = (now: number) => {
      const t = Math.min(1, (now - start.current) / MORPH_MS);
      const e = easeOutBack(t);
      const [fa, fb] = from.current;
      const [ta, tb] = to.current;
      cur.current = [lerp(fa, ta, e), lerp(fb, tb, e)];
      redraw((n) => n + 1);
      if (t < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [target]);

  return cur.current;
}

function lerp(a: Shape, b: Shape, t: number): Shape {
  const out: number[] = [];
  for (let i = 0; i < a.length; i++) out.push(a[i]! + ((b[i] ?? a[i]!) - a[i]!) * t);
  return out;
}

/** 26 numbers back into one closed path of four cubic segments. */
function toPath(s: Shape): string {
  let d = `M${r2(s[0])} ${r2(s[1])}`;
  for (let i = 2; i < 26; i += 6) {
    d += `C${r2(s[i])} ${r2(s[i + 1])} ${r2(s[i + 2])} ${r2(s[i + 3])} ${r2(s[i + 4])} ${r2(s[i + 5])}`;
  }
  return `${d}Z`;
}
const r2 = (n: number | undefined) => (n ?? 0).toFixed(2);

/* ── the creature ────────────────────────────────────────────────────────── */

function EchoCharacterInner({ face, r, uid, gazeDeg = 0, detail }: EchoCharacterProps) {
  const skin = SKIN[face];
  const [left, right] = useMorph(EYES[face]);
  const rich = detail ?? r >= 30;

  // The 100-unit design box down onto this body.
  const k = r / 100;

  /*
   * The gaze slides the eyes across the face rather than rotating them.
   *
   * Rotating the pair was the first attempt and it slid the shapes off the curve of the
   * sphere: past about 18 degrees it stopped looking like looking and started looking
   * broken. A sphere turning shifts its features sideways and squashes the far one, which
   * is exactly what the reference's own three quarter pose does, so the gaze now does a
   * small version of the same thing.
   */
  const swing = Math.max(-1, Math.min(1, gazeDeg / 30));
  const shift = swing * 16;
  const squash = 1 - Math.abs(swing) * 0.12;

  return (
    <g className={`echo-char echo-char-${face}`}>
      <defs>
        {/*
          INVERTED. Dark in the middle, lit at the rim, with the dark focus a little below
          centre because the reference's darkest reading is at +0.6R rather than at 0.
          This is the single correction that makes it read as the artwork: the old one was
          a top-left highlight falling off to a dark edge, which is a snooker ball.
        */}
        <radialGradient id={`ecBody-${uid}`} cx="50%" cy="56%" r="50%">
          {RAMP_AT.map((at, i) => (
            <stop key={at} offset={`${at}%`} stopColor={skin.ramp[i]} />
          ))}
        </radialGradient>
        {/* The lit edge, pale over the top arc and warm underneath. Measured. */}
        {/*
          Opaque all the way round, which it was not.

          The middle stop used to be the pale top colour at 0.55 alpha, so the left and
          right of the rim were a half transparent near-white laid over the body. Measured
          against the reference that was 138 out of 255 adrift on the left edge: mine
          #FFDFB0 against the artwork's #F5C526. Four solid stops, sampled off the
          reference at 0, 45, 90 and 180 degrees, land within about 10.
        */}
        <linearGradient id={`ecRim-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={skin.rimTop} />
          <stop offset="22%" stopColor={skin.rimTop} />
          {/* The sides are at 50 percent of the bounding box, so the side colour goes
              there. At 60 the blend was still two thirds of the way from the pale top
              and the left edge came out 22 adrift. */}
          <stop offset="50%" stopColor={skin.rimMid} />
          <stop offset="100%" stopColor={skin.rimBot} />
        </linearGradient>
        {/*
          The outer glow. Tight: alpha 198 at 1.01R and 25 at 1.08R in the reference, so
          this is a narrow bright collar rather than the soft haze it is tempting to draw.
          On the near-black map that collar is the whole reason the creature sits on the
          field instead of in a hole.
        */}
        <radialGradient id={`ecGlow-${uid}`}>
          <stop offset="70%" stopColor={skin.glow} stopOpacity="0" />
          <stop offset="74%" stopColor={skin.glow} stopOpacity={0.55 * skin.lit} />
          <stop offset="80%" stopColor={skin.glow} stopOpacity={0.16 * skin.lit} />
          <stop offset="100%" stopColor={skin.glow} stopOpacity="0" />
        </radialGradient>
        {/* Each eye sits in its own pool of light, which the reference has and which is
            what stops them reading as two holes punched in the ball. */}
        <radialGradient id={`ecEye-${uid}`}>
          <stop offset="0%" stopColor={skin.eye} stopOpacity={0.5 * skin.lit} />
          <stop offset="48%" stopColor={skin.rimBot} stopOpacity={0.3 * skin.lit} />
          <stop offset="100%" stopColor={skin.rimBot} stopOpacity="0" />
        </radialGradient>
        {/* The gloss is a soft patch, not a cut-out. The measured ellipse is the
            saturated core of it; the falloff around that is most of what the eye reads
            as "wet", and a hard-edged white oval reads as a sticker. */}
        <filter id={`ecSoft-${uid}`} x="-60%" y="-160%" width="220%" height="420%">
          {/* 0.018R, not 0.035R. The measured highlight is 21x12 pixels at reference
              scale and an 8px blur on that is not a soft edge, it is the whole shape
              gone. Rendered side by side, the gloss had disappeared. */}
          <feGaussianBlur stdDeviation={r * 0.018} />
        </filter>
        <clipPath id={`ecClip-${uid}`}>
          <circle r={r * 0.985} />
        </clipPath>
      </defs>

      <circle className="echo-char-glow" r={r * 1.4} fill={`url(#ecGlow-${uid})`} />
      <circle className="echo-char-body" r={r} fill={`url(#ecBody-${uid})`} />

      {/* Dust inside the glass. Fixed positions, so the texture does not fizz. */}
      {rich && (
        <g className="echo-char-speck" clipPath={`url(#ecClip-${uid})`} fill={skin.speck}>
          {SPECKS.map(([sx, sy, sr], i) => (
            <circle key={i} cx={sx * r} cy={sy * r} r={sr * r} />
          ))}
        </g>
      )}

      {/*
        The rim, as a stroke rather than as the last stop of the body gradient, because
        the reference's rim is not the same colour all the way round: pale yellow across
        the top, orange underneath. A radial gradient cannot say that and a stroked circle
        with a vertical gradient says it exactly.
      */}
      <circle
        className="echo-char-rim"
        r={r * 0.972}
        fill="none"
        stroke={`url(#ecRim-${uid})`}
        strokeWidth={r * 0.034}
      />

      {/*
        The highlight, at the measured place: (+0.403, -0.713), tilted 23 degrees. It is
        the only thing telling you this is a sphere and not a disc. The thin sliver above
        it is in the reference too and only earns its keep at size.
      */}
      <g clipPath={`url(#ecClip-${uid})`} opacity={0.35 + 0.65 * skin.lit} filter={`url(#ecSoft-${uid})`}>
        <ellipse
          className="echo-char-shine"
          cx={r * 0.403} cy={-r * 0.713} rx={r * 0.099} ry={r * 0.057}
          transform={`rotate(23 ${(r * 0.403).toFixed(2)} ${(-r * 0.713).toFixed(2)})`}
        />
        {rich && (
          <ellipse
            className="echo-char-shine echo-char-shine-2"
            cx={r * 0.426} cy={-r * 0.874} rx={r * 0.118} ry={r * 0.018}
            transform={`rotate(26 ${(r * 0.426).toFixed(2)} ${(-r * 0.874).toFixed(2)})`}
          />
        )}
      </g>

      <g
        className="echo-char-eyes"
        transform={`translate(${(shift * k).toFixed(2)} 0) scale(${(k * squash).toFixed(4)} ${k.toFixed(4)})`}
      >
        {/* The pool of light each eye sits in, behind the eye itself. */}
        {/*
          Tight. These were 46 and 42 units on a 100-unit body, so each pool reached most
          of the way across the sphere and lifted the whole middle: measured against the
          reference at 0.35R the body came out #DB8F4F against the artwork's #C14D08, 71
          out of 255 too pale. The reference's eye glow stops at about a quarter of the
          radius, and so does this.
        */}
        <circle cx={centreX(left)} cy={centreY(left)} r={31} fill={`url(#ecEye-${uid})`} />
        <circle cx={centreX(right)} cy={centreY(right)} r={29} fill={`url(#ecEye-${uid})`} />
        <path d={toPath(left)} fill={skin.eye} />
        <path d={toPath(right)} fill={skin.eye} />
      </g>

      {/*
        The five satellites. Sizes and positions are the reference's, and they are all
        different on purpose — evenly spaced dots of one size read as a loading spinner.
      */}
      {rich &&
        SATELLITES.map((s, i) => (
          <g key={i} className="echo-char-sat" style={{ animationDelay: `${-i * 1.4}s` }}>
            {/* Glow, ring, core — the three the reference has, in its own colours:
                #FEF9E0 cores inside #FDF5A8 rings, which is warmer and creamier than
                borrowing the rim's yellow the way this used to. */}
            <circle cx={s.x * r} cy={s.y * r} r={s.r * r * 1.8} fill={skin.glow} opacity={0.34 * skin.lit} />
            <circle cx={s.x * r} cy={s.y * r} r={s.r * r * 1.3} fill="#FDF5A8" opacity={0.85 * skin.lit} />
            <circle cx={s.x * r} cy={s.y * r} r={s.r * r * 0.82} fill="#FEF9E0" opacity={skin.lit} />
          </g>
        ))}
    </g>
  );
}

/** Where a shape sits, for placing the light behind it. The four anchors, averaged. */
const centreX = (s: Shape) => ((s[0] ?? 0) + (s[6] ?? 0) + (s[12] ?? 0) + (s[18] ?? 0)) / 4;
const centreY = (s: Shape) => ((s[1] ?? 0) + (s[7] ?? 0) + (s[13] ?? 0) + (s[19] ?? 0)) / 4;

export const EchoCharacter = memo(EchoCharacterInner);

/**
 * Who gets a face.
 *
 * Only the two rarities worth crossing a road for, and only while they still have
 * something to offer. Everything else stays a ring with its category glyph inside, which
 * is the arrangement board 2 draws and the reason it works: nine faces on one map is a
 * crowd, and a crowd has no standout. A face cannot carry a category either — there is no
 * drawing of a sphere that means "food and drink" — so the glyph is doing a job the
 * creature cannot take over.
 */
export function characterFor(rarity: string, state: string): EchoFace | null {
  if (rarity !== "rare" && rarity !== "singular") return null;
  /*
   * ALL FOUR PIN STATES, not two.
   *
   * This used to answer for `sealed` and `opening` and hand everything else back to the
   * category glyph, which meant a rare echo you had synced or heard silently stopped
   * being a creature and turned into a ring with a symbol in it. Two costs to that. The
   * lifecycle the whole pin system exists to show — sealed, opening, captured, heard —
   * was being told by the creature for half of its length and by something else for the
   * other half. And the morph, which is the reason this component exists, only ever had
   * two nearly identical shapes to travel between.
   *
   * Now the pin itself carries the story: it is paused, it notices you, it becomes a
   * play button when you sync it, and it closes its eyes when you have heard it. The
   * play triangle on a synced pin is not a coincidence either — it means exactly what it
   * looks like it means.
   */
  if (state === "sealed") return "sealed";
  if (state === "opening") return "calling";
  if (state === "captured") return "armed";
  if (state === "heard") return "heard";
  return null;
}

/** Exported so a probe can render the tween frozen at fixed points and look at it. */
export const __shapes = { EYES, lerp, toPath, MORPH_MS };
