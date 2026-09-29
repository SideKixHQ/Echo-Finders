/**
 * The echo, as a creature.
 *
 * An echo is a thing that wants to be heard, and this is what it looks like: a warm orb
 * with two bright slits for eyes. It is the only character in the product and it is spent
 * carefully — see `characterFor` below for who gets one and who stays a mark.
 *
 * THE EYES ARE A PAUSE BUTTON, and that is the whole idea rather than a coincidence I
 * noticed afterwards. Two vertical bars side by side is the pause glyph, so an echo
 * sitting sealed at a street corner is a story that has been PAUSED there, in some cases
 * for a century. Walking to it and syncing swings those two bars together into a play
 * triangle. You are not opening a file. You are pressing play on something that stopped.
 *
 * Which means the states are not a set of pictures, they are one shape in four positions:
 *
 *   sealed   two bars, dim      the story, paused, waiting
 *   calling  two bars, lit      close enough that it has noticed you
 *   armed    a play triangle    synced; press it
 *   playing  two bars again     it is talking, and this pauses it
 *
 * `heard` is the fifth and the only one that is not the same shape: the eyes close into
 * two small arcs and the body goes cold. It has nothing left to say.
 *
 * Everything is one `<path>` per eye with the same command count, so the browser can
 * interpolate between them. Nothing here cross-fades: a cross-dissolve between a face and
 * an icon reads as a control changing state, and a morph reads as something alive making
 * a decision. That difference is the entire reason to build this.
 */

import { memo } from "react";

/** What the creature is doing. See the file comment: four of these are one shape. */
export type EchoFace = "sealed" | "calling" | "armed" | "playing" | "heard";

export interface EchoCharacterProps {
  readonly face: EchoFace;
  /** Radius of the body in user units. The eyes scale with it. */
  readonly r: number;
  /**
   * A stable id for this instance's gradients.
   *
   * SVG gradient ids are document-global, so two creatures on one screen with the same id
   * silently share a fill — and the second one gets the first one's geometry when the
   * gradients are `userSpaceOnUse`. The map draws up to two of these at once.
   */
  readonly uid: string;
  /** Degrees to swing the gaze, positive clockwise. The creature looks at things. */
  readonly gazeDeg?: number;
}

/**
 * The eyes, as two paths that can be tweened into a triangle.
 *
 * Both eye paths in every state have the same number of commands in the same order
 * (M, C, C, Z — a rounded bar drawn as two curves), so a CSS or Web Animations tween
 * between any two of them interpolates point by point instead of jumping. The triangle is
 * the same four commands with its right-hand pair collapsed onto a single point, which is
 * why the morph lands as one shape closing rather than two shapes being swapped.
 *
 * Coordinates are in a 100-unit box centred on the origin, scaled by `r` at the call site,
 * so one set of numbers serves a 17px pin and a 96px sync orb.
 */
const EYES: Record<EchoFace, readonly [string, string]> = {
  /*
   * PAUSE, dim. Two upright bars. Narrower than `calling` because a sealed echo is holding
   * itself in rather than reaching out, and because at 17px on a map a fat bar closes up.
   */
  sealed: [
    "M-30 -34 C -30 -34, -14 -34, -14 -34 C -14 -34, -14 34, -30 34 Z",
    "M14 -34 C 14 -34, 30 -34, 30 -34 C 30 -34, 30 34, 14 34 Z",
  ],
  // PAUSE, lit and open. The same bars, wider and taller: it has noticed you.
  calling: [
    "M-34 -42 C -34 -42, -12 -42, -12 -42 C -12 -42, -12 42, -34 42 Z",
    "M12 -42 C 12 -42, 34 -42, 34 -42 C 34 -42, 34 42, 12 42 Z",
  ],
  /*
   * PLAY. The left bar became the flat edge; the right bar's four corners collapsed onto
   * the apex. Drawn as two halves of one triangle so the tween from `calling` moves the
   * right-hand eye's corners inward and together rather than fading it out.
   */
  armed: [
    "M-34 -46 C -34 -46, -34 -46, -34 -46 C -34 -46, -34 46, -34 46 Z",
    "M-34 -46 C -6 -30, 22 -14, 46 0 C 22 14, -6 30, -34 46 Z",
  ],
  // PAUSE again, and this one stops the voice. Same bars as `calling`, slightly tighter.
  playing: [
    "M-32 -40 C -32 -40, -12 -40, -12 -40 C -12 -40, -12 40, -32 40 Z",
    "M12 -40 C 12 -40, 32 -40, 32 -40 C 32 -40, 32 40, 12 40 Z",
  ],
  /*
   * Closed, content. The one state that is NOT the same shape, because it is not the same
   * message: there is nothing here to press any more.
   */
  heard: [
    "M-34 6 C -28 -10, -14 -10, -8 6 C -8 6, -8 6, -8 6 Z",
    "M8 6 C 14 -10, 28 -10, 34 6 C 34 6, 34 6, 34 6 Z",
  ],
};

/** Body fills per state. Sealed and heard are the same ember, banked right down. */
const BODY: Record<EchoFace, readonly [string, string, string]> = {
  sealed: ["#8A5A12", "#6B4409", "#402700"],
  calling: ["#FFD77A", "#FFA81E", "#B85A00"],
  armed: ["#FFF6DC", "#FFC848", "#C96A00"],
  playing: ["#FFF0C4", "#FFC040", "#C96A00"],
  heard: ["#9A6A22", "#7A4E10", "#4E3005"],
};

function EchoCharacterInner({ face, r, uid, gazeDeg = 0 }: EchoCharacterProps) {
  const [a, b, c] = BODY[face];
  const [left, right] = EYES[face];
  /*
   * The 100-unit design box down onto the body, and the divisor is the whole difference
   * between a face and a sticker.
   *
   * At r/50 the design box IS the body, so the play triangle ran from rim to rim and the
   * ball read as a circle with a triangle stuck on it rather than a creature with a
   * feature. Rendered, that was obvious and unarguable. r/100 puts the pause bars at
   * about a third of the radius either side of centre and the triangle at roughly 40
   * percent of it, which leaves enough ball around them to still be a face.
   */
  const k = r / 100;
  /*
   * The gaze swings the eyes, not the body.
   *
   * Clamped hard. Past about 18 degrees the bars slide off the curve of the face and it
   * stops looking like it is looking and starts looking broken, which is the same lesson
   * the misaligned eyes taught: an offset only reads as direction when the sphere sells
   * the turn, and a flat vector sphere sells very little of it.
   */
  const swing = Math.max(-18, Math.min(18, gazeDeg));

  return (
    <g className={`echo-char echo-char-${face}`}>
      <defs>
        <radialGradient id={`echoBody-${uid}`} cx="38%" cy="28%" r="78%">
          <stop offset="0%" stopColor={a} />
          <stop offset="38%" stopColor={b} />
          <stop offset="100%" stopColor={c} />
        </radialGradient>
      </defs>
      <circle className="echo-char-body" r={r} fill={`url(#echoBody-${uid})`} />
      {/*
        The highlight. Small, high and to the right, and it is doing more work than it
        looks: it is the only thing telling you this is a sphere rather than a disc, and
        without it the eyes read as stuck on rather than set in.
      */}
      <ellipse
        className="echo-char-shine"
        cx={r * 0.46}
        cy={-r * 0.58}
        rx={r * 0.24}
        ry={r * 0.13}
        transform={`rotate(-24 ${(r * 0.46).toFixed(2)} ${(-r * 0.58).toFixed(2)})`}
      />
      <g
        className="echo-char-eyes"
        transform={`scale(${k.toFixed(4)}) rotate(${swing.toFixed(1)})`}
      >
        <path d={left} />
        <path d={right} />
      </g>
    </g>
  );
}

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
  if (state === "sealed") return "sealed";
  if (state === "opening") return "calling";
  return null;
}
