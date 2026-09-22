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
          // The colour class goes on the chip only when it is on, so the *label* greys out
          // with the rest of the row. The dot carries its category's colour either way.
          className={`chip${on.has(category) ? ` cat-${category} on` : ""}`}
          onClick={() => onToggle(category)}
        >
          <span className={`chip-dot cat-${category}`} />
          {CATEGORY_LABEL[category]}
        </button>
      ))}
    </div>
  );
}
