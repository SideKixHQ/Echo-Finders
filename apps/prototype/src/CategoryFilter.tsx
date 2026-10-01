/**
 * The nine chips, folded into one button.
 *
 * The chip row is a good control and it was costing 48 pixels of a 667 pixel phone on
 * every screen, forever, to answer a question most people ask twice a month. Measured off
 * a photograph of the real app: the journey chip plus the chip row came to 151 pixels of
 * top chrome, against a map that had about 130 pixels of band left to draw in.
 *
 * So the row is one tap away instead of always there, and the button carries the state it
 * used to take a row to show: "All echoes" when nothing is filtered, and the count when
 * something is. A filter that is on must always say so somewhere — a map quietly missing
 * two thirds of its pins with no visible cause is the worst bug this app could ship — and
 * a button that reads "4 of 9 kinds" says it in less space than the row ever did.
 *
 * The row itself is unchanged inside the panel. It is still the KEY to the map: every
 * category always present, each chip carrying its own colour and its own glyph, on or off.
 * Wrapped rather than scrolling, because a panel can be two lines tall and a strip cannot,
 * and a horizontal scroller in a popover is a way to hide half your options behind a
 * gesture nobody makes.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { EchoCategory } from "@echofinders/core";
import { CategoryChips } from "./CategoryChips";
import { CHIP_GROUPS, type ChipGroup } from "./categories";

export interface CategoryFilterProps {
  readonly available: ReadonlySet<EchoCategory>;
  readonly on: ReadonlySet<EchoCategory>;
  readonly onToggle: (group: ChipGroup) => void;
  readonly onAll: () => void;
}

export function CategoryFilter({ available, on, onToggle, onAll }: CategoryFilterProps) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement | null>(null);

  const lit = CHIP_GROUPS.filter((g) => g.categories.some((c) => on.has(c))).length;
  const all = lit === CHIP_GROUPS.length;

  /*
   * A tap anywhere else closes it.
   *
   * On the map that is nearly always the map itself, and a filter panel that has to be
   * dismissed by finding its own button again is a panel people leave open over the thing
   * they opened it to look at. `pointerdown` rather than `click`, so it closes on the way
   * down and the tap that closed it does not also select a pin underneath.
   */
  const close = useCallback((e: PointerEvent) => {
    if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
  }, []);
  useEffect(() => {
    if (!open) return;
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open, close]);

  return (
    <div className="catfilter" ref={wrap}>
      {/*
        IT ONLY SPELLS ITSELF OUT WHEN IT IS DOING SOMETHING.

        "All echoes" cost 131 pixels to say that nothing is filtered, which is its state
        almost always — and it was taking those pixels off the journey chip beside it,
        which needed them badly enough that its progress bar had gone to minus thirty-nine
        (see `RouteRibbon`). Three dots and a chevron say the same thing in 52, and the
        chip goes from 212 to 291, which is finally enough for a destination not to
        truncate.

        A switched-on filter takes its words back, because that is the asymmetry: a map
        quietly missing two thirds of its pins with no visible cause is the worst thing
        this screen could do, while a map showing everything needs no announcement at all.
        The accessible name says it in full either way, since a screen reader has no
        pixels to save.
      */}
      <button
        className={all ? "catfilter-tap" : "catfilter-tap is-filtered"}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={all ? "Filter by kind: everything is showing" : `Filter by kind: ${lit} of ${CHIP_GROUPS.length} showing`}
      >
        {/*
          Three dots in three colours rather than a funnel glyph. The row this stands for
          is a colour key, so the button is a scrap of the key: it says "this is about the
          coloured things on the map", which a funnel does not.
        */}
        <span className="catfilter-key" aria-hidden="true">
          <i className="cat-history" />
          <i className="cat-legend" />
          <i className="cat-food-drink" />
        </span>
        {/*
          IT SAYS WHAT IT IS AGAIN, because this is the control people actually use.
          
          It was collapsed to three dots on the argument that "All echoes" cost 131 pixels
          to say nothing was filtered. True about the pixels and wrong about the priority:
          you change your journey once a session and you change what you are looking for
          whenever the mood changes, so the tool got shrunk to make room for the label.
          This row now spends its width the other way round.
        */}
        <span className="catfilter-label">
          {all ? "All echoes" : `${lit} of ${CHIP_GROUPS.length} kinds`}
        </span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9.5l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="catpop" role="group" aria-label="Which kinds of echo to show">
          <CategoryChips available={available} on={on} onToggle={onToggle} onAll={onAll} />
        </div>
      )}
    </div>
  );
}
