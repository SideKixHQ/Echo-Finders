/**
 * The category filter, as a scrolling row of chips.
 *
 * Straight from the design: an "All" chip pinned to the left behind a divider, then one
 * chip per category carrying its own colour as a dot.
 *
 * The dot keeps its colour whether or not the chip is on — only its opacity changes — which
 * is what makes the row a *key* rather than a set of buttons. Greying the dot out with the
 * label, as an earlier pass did, left somebody who does not already know the palette staring
 * at nine identical grey circles.
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
import { CATEGORY_LABEL, CATEGORY_ORDER } from "./categories";

export interface CategoryChipsProps {
  /** What this route passes. Quietens the rest of the row; never removes it. */
  readonly available: ReadonlySet<EchoCategory>;
  readonly on: ReadonlySet<EchoCategory>;
  readonly onToggle: (category: EchoCategory) => void;
  readonly onAll: () => void;
}

function CategoryChipsInner({ available, on, onToggle, onAll }: CategoryChipsProps) {
  const all = CATEGORY_ORDER.every((c) => on.has(c));

  /*
   * Whether there is more row to the right. Measured rather than assumed, because "nine
   * chips overflow a phone" stops being true on a wide screen and at large text sizes it
   * becomes true sooner — and a fade promising more where there is none is worse than no
   * fade at all.
   */
  const strip = useRef<HTMLDivElement | null>(null);
  const [more, setMore] = useState(false);
  const measure = useCallback(() => {
    const el = strip.current;
    if (!el) return;
    setMore(el.scrollWidth - el.scrollLeft - el.clientWidth > 8);
  }, []);
  useEffect(() => {
    measure();
    const el = strip.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <div className="chipwrap" data-more={more ? 1 : 0}>
    <div className="chips" ref={strip} onScroll={measure}>
      <button className={all ? "chip chip-all on" : "chip chip-all"} onClick={onAll}>
        All
      </button>
      {CATEGORY_ORDER.map((category) => (
        <button
          key={category}
          // The colour class goes on the chip only when it is on, so the *label* greys out
          // with the rest of the row. The dot carries its category's colour either way.
          className={`chip${on.has(category) ? ` cat-${category} on` : ""}${
            available.has(category) ? "" : " chip-none"
          }`}
          onClick={() => onToggle(category)}
          /*
            Quieter, not disabled: filtering to an empty map is a legitimate thing to do,
            and a disabled control cannot be focused or read out. The dimming says it, so
            there is no `title` — a native tooltip is a grey box that appears half a second
            late, covers the thing next to it, and on a phone never appears at all. Where a
            control needs a name it has `aria-label`, which reaches a screen reader without
            showing anybody a tooltip.
          */
        >
          <span className={`chip-dot cat-${category}`} />
          {CATEGORY_LABEL[category]}
        </button>
      ))}
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
