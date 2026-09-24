/**
 * The category filter, as a scrolling row of chips.
 *
 * Straight from the design: an "All" chip pinned to the left behind a divider, then one
 * chip per category carrying its own colour as a dot.
 *
 * Nine categories, nine colours, and a chip wears its own when it is on. Off, the label
 * goes muted but the dot keeps its colour, which is what makes the row a key rather than a
 * set of buttons: greying the dot out with the label left anybody who does not already know
 * the palette staring at nine identical grey circles.
 *
 * What is lit is what is on the map. There is no second filter and no hidden state: the set
 * of lit chips is the set passed to the map, the sheet and the nearby list.
 *
 * **Every category, always.** The design renders the whole of its `CATS` table on every
 * screen and never narrows it (`design/SPEC.md`), and matching that is a correction rather
 * than a preference. This row used to show only the categories the current route passes,
 * on the argument that offering "Ghosts" on a flight with none is a promise the library
 * cannot keep. That argument is about the *pins*; this is the *key*. What it produced was a
 * legend whose contents changed underneath you — chips disappearing when you switched from
 * the walk to the flight, and again when kids mode narrowed the library — so the one
 * control that exists to explain the colours on the map was itself unstable.
 *
 * A category with nothing on this route filters to an empty map, which is legible and one
 * tap from undone. A category that is not on screen at all cannot be reasoned about.
 */

import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { EchoCategory } from "@echofinders/core";
import type { ChipGroup } from "./categories";
import { CHIP_GROUPS } from "./categories";

export interface CategoryChipsProps {
  /**
   * What this route passes.
   *
   * Accepted and deliberately unused in the rendering. Narrowing the row to it lost the
   * key; dimming the rest made five chips of nine look switched off. Every chip is drawn
   * at full strength, on or off. Kept on the interface because the caller has it and a
   * later pass may find an honest use for it — a count, perhaps, never an opacity.
   */
  readonly available: ReadonlySet<EchoCategory>;
  readonly on: ReadonlySet<EchoCategory>;
  readonly onToggle: (group: ChipGroup) => void;
  readonly onAll: () => void;
}

function CategoryChipsInner({ on, onToggle, onAll }: CategoryChipsProps) {
  const all = CHIP_GROUPS.every((g) => g.categories.every((c) => on.has(c)));

  /*
   * Whether there is more row in each direction. Measured rather than assumed, because
   * "nine chips overflow a phone" stops being true on a wide screen and becomes true
   * sooner at large text sizes, and an arrow promising more where there is none is worse
   * than no arrow.
   */
  const strip = useRef<HTMLDivElement | null>(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  const measure = useCallback(() => {
    const el = strip.current;
    if (!el) return;
    setEdge({
      left: el.scrollLeft > 8,
      right: el.scrollWidth - el.scrollLeft - el.clientWidth > 8,
    });
  }, []);
  useEffect(() => {
    measure();
    const el = strip.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  /**
   * The arrow moves the row.
   *
   * It was a pseudo-element with `pointer-events: none`: a picture of a control. An arrow
   * that looks pressable and does nothing when pressed is worse than a plain fade, because
   * the fade never claimed anything. Now it is a button, it scrolls about two thirds of a
   * screenful so a chip is never cut in half at the new edge, and it appears on both sides
   * so the row can be walked back as well as forward.
   */
  const nudge = useCallback((direction: -1 | 1) => {
    const el = strip.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.66, behavior: "smooth" });
  }, []);

  return (
    <div className="chipwrap">
      {edge.left && (
        <button className="chip-nudge chip-nudge-l" onClick={() => nudge(-1)} aria-label="Earlier categories">
          <svg viewBox="0 0 24 24">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
      )}
      {edge.right && (
        <button className="chip-nudge chip-nudge-r" onClick={() => nudge(1)} aria-label="More categories">
          <svg viewBox="0 0 24 24">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
      <div className="chips" ref={strip} onScroll={measure}>
      <button className={all ? "chip chip-all on" : "chip chip-all"} onClick={onAll} aria-pressed={all}>
        All
      </button>
      {CHIP_GROUPS.map((group) => {
          // A group is on when any of its categories is. Toggling sets them together, so
          // a chip standing for two can never land half lit.
          const lit = group.categories.some((c) => on.has(c));
          return (
            <button
              key={group.id}
              // The colour class goes on the chip only when it is on, so the *label* greys
              // out with the rest of the row. The dot carries its colour either way.
              className={`chip${lit ? ` cat-${group.face} on` : ""}`}
              /* A lit chip and a dark one are the same word to a screen reader without
                 this. The colour is the whole state on this row. */
              aria-pressed={lit}
              onClick={() => onToggle(group)}
            >
              <span className={`chip-dot cat-${group.face}`} />
              {group.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/*
 * Memoised. Nothing on this component depends on where the listener is, and the app
 * re-renders on every position fix — four times a second, for the life of a walk. Its
 * callbacks are stable in `App`, which is what makes the comparison actually succeed.
 */
export const CategoryChips = memo(CategoryChipsInner);
