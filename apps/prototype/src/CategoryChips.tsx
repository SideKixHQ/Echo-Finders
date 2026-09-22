/**
 * The category filter, as a scrolling row of chips.
 *
 * Straight from the design: an "All" chip pinned to the left behind a divider, then one
 * chip per category carrying its own colour as a dot. Selected chips light their colour;
 * unselected ones keep the dot at low opacity, so the palette is legible even when nothing
 * is on and the row reads as a key rather than a set of buttons.
 *
 * Only categories the route actually passes appear. A filter offering "Ghosts" on a flight
 * with no ghost stories on it is a promise the library cannot keep.
 */

import type { EchoCategory } from "@echofinders/core";
import { CATEGORY_LABEL, CATEGORY_ORDER } from "./categories";

export interface CategoryChipsProps {
  readonly available: ReadonlySet<EchoCategory>;
  readonly on: ReadonlySet<EchoCategory>;
  readonly onToggle: (category: EchoCategory) => void;
  readonly onAll: () => void;
}

export function CategoryChips({ available, on, onToggle, onAll }: CategoryChipsProps) {
  const shown = CATEGORY_ORDER.filter((c) => available.has(c));
  if (shown.length < 2) return null;
  const all = shown.every((c) => on.has(c));

  return (
    <div className="chips">
      <button className={all ? "chip chip-all on" : "chip chip-all"} onClick={onAll}>
        All
      </button>
      {shown.map((category) => (
        <button
          key={category}
          className={`chip cat-${category}${on.has(category) ? " on" : ""}`}
          onClick={() => onToggle(category)}
        >
          <span className="chip-dot" />
          {CATEGORY_LABEL[category]}
        </button>
      ))}
    </div>
  );
}
