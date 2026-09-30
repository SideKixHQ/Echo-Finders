/**
 * A pile of pins, drawn as one thing you can tap.
 *
 * THE MEASUREMENT THAT MADE THIS NECESSARY. Driving the real app at 390x844 and asking
 * the page where the pins actually were: twenty six drawn on the Manhattan map, and
 * fifteen of them within one pixel of (317.7, 143.2). Seventeen of the twenty six had a
 * nearest neighbour at a distance of ZERO, and tapping zoom in twice did not change that,
 * because coincident points stay coincident however you scale them. Whatever happened to
 * be last in the DOM won every tap and fourteen stories were unreachable.
 *
 * WHAT THE DOT SAYS, and it is more than a number. A group is not anonymous: it takes the
 * colour of its best member and keeps that member's rarity halo, so the one singular echo
 * in a pile of fifteen still pulls the eye the way the whole map is built to make it. A
 * count alone would have hidden exactly the thing the screen exists to point at.
 */

import { memo } from "react";
import { rarityOf, type Echo } from "@echofinders/core";

/**
 * How close two pins have to be before they become one dot, in CSS pixels.
 *
 * 40 rather than 44. The thumb target is 44, so two pins exactly 44 apart are touching
 * and both hittable; grouping at 44 would take pins that are perfectly usable and hide
 * them behind a tap. 40 catches the piles and leaves a spaced-out street alone.
 */
export const GROUP_PX = 40;

/**
 * How far apart the members sit once the group is fanned open.
 *
 * A full 44, because this is the number the whole feature exists to guarantee: if fanning
 * a pile out leaves two of them twenty pixels apart it has moved the problem rather than
 * solved it. `fanOut` in the engine holds this as an invariant and there is a test that
 * checks every pair at every size from two to twenty six.
 */
export const FAN_GAP = 44;

export interface ClusterDotProps {
  readonly x: number;
  readonly y: number;
  readonly members: readonly Echo[];
  readonly onOpen: () => void;
}

const RANK = { singular: 0, rare: 1, uncommon: 2, common: 3 } as const;

function ClusterDotInner({ x, y, members, onOpen }: ClusterDotProps) {
  /*
   * The best one in the pile decides how the pile looks. Sorted rather than scanned for a
   * maximum because the label wants the same answer: "3 rare" is a different invitation
   * from "3".
   */
  const best = [...members].sort(
    (a, b) => (RANK[rarityOf(a) as keyof typeof RANK] ?? 9) - (RANK[rarityOf(b) as keyof typeof RANK] ?? 9),
  )[0]!;
  const rarity = rarityOf(best);
  const n = members.length;
  /*
   * Bigger for a bigger pile, and it stops growing. Area would be the honest encoding and
   * a group of fifteen would then be four times the width of a group of one, which is a
   * disc the size of a thumb sitting over the street it is meant to be marking.
   */
  const r = Math.min(26, 15 + Math.sqrt(n) * 2.4);

  return (
    <g
      /* `cat-*` rather than a colour prop: the stylesheet already owns the nine category
         colours and sets `color` from them, so the rings can use `currentColor` and there
         is no second copy of the palette to fall out of step. */
      className={`clus clus-${rarity} cat-${best.category}`}
      transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
      onClick={onOpen}
      role="button"
      /*
       * Said out loud, because a screen reader meeting a number in a circle learns
       * nothing. The count and what it is worth, then how to get at it.
       */
      aria-label={
        rarity === "singular" || rarity === "rare"
          ? `${n} echoes here, including a ${rarity} one. Tap to spread them out.`
          : `${n} echoes here. Tap to spread them out.`
      }
    >
      {/* The same invisible 44 every pin gets, so a group is never harder to hit than
          one of the things inside it. */}
      <circle className="pin-hit" r={Math.max(22, r)} />
      {(rarity === "singular" || rarity === "rare") && (
        <circle className={`pin-halo pin-halo-${rarity}`} r={rarity === "singular" ? 92 : 46} />
      )}
      {/* Two rings offset by a couple of pixels: a stack of cards rather than a bubble,
          which says "there is more than one of these" before the number is read. */}
      <circle className="clus-back" cx="3.5" cy="3.5" r={r} />
      <circle className="clus-body" r={r} />
      <text className="clus-n" y={r * 0.34} textAnchor="middle" style={{ fontSize: r * 0.92 }}>
        {n}
      </text>
    </g>
  );
}

export const ClusterDot = memo(ClusterDotInner);
