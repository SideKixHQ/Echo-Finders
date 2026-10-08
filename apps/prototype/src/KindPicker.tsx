/**
 * Which kinds of echo to show: one button, and every kind at once behind it.
 *
 * James (2026-10-08), looking at the map's chip strip: "you should be able tap on it and
 * see all of them at that same time and select it from there." He was right, and the
 * screenshot showed why. On a phone the strip showed "All" and "History" and an arrow, so
 * it read as two choices; the other seven were behind a scroll nobody makes, and once a
 * picked kind scrolled out of view the strip no longer said what was on.
 *
 * So the strip becomes a button that SAYS what is on ("Echoes", "Ghosts", "History +1")
 * and drops a box straight below the map bar with all of them in it at once: All, then the
 * eight kinds as chips, each in its own colour and glyph so the box is still the key to the
 * map. It is the box flight mode always had, now everywhere. (A bottom sheet was tried
 * first; James preferred this: it opens where you tapped and leaves the map in view.)
 * Pick as many as you like; the map changes as you tap; a tap outside, the button again,
 * or Escape closes it. My Echoes' filter uses the same chips (`KindGrid`).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { EchoCategory } from "@echofinders/core";
import { CATEGORY_ICON, CHIP_GROUPS, type ChipGroup } from "./categories";

interface KindProps {
  readonly on: ReadonlySet<EchoCategory>;
  readonly onToggle: (group: ChipGroup) => void;
  readonly onAll: () => void;
}

const isAll = (on: ReadonlySet<EchoCategory>) =>
  CHIP_GROUPS.every((g) => g.categories.every((c) => on.has(c)));

/** The kinds picked, in the grid's order. Empty when everything is showing. */
const picked = (on: ReadonlySet<EchoCategory>) =>
  isAll(on) ? [] : CHIP_GROUPS.filter((g) => g.categories.some((c) => on.has(c)));

/**
 * All, then every kind, as chips that wrap: every option in view, none behind a scroll. With everything showing, All is the one lit tile and
 * the kinds sit unlit, as on the old strip: eight lit tiles would read as eight things
 * picked and invite a tap that narrows.
 */
export function KindGrid({ on, onToggle, onAll }: KindProps) {
  const all = isAll(on);
  return (
    <div className="kind-chips" role="group" aria-label="Which echoes to show">
      <button className={`chip chip-all${all ? " on" : ""}`} aria-pressed={all} onClick={onAll}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12.5 L10 17.5 L19 7" />
        </svg>
        All
      </button>
      {CHIP_GROUPS.map((group) => {
        const lit = !all && group.categories.some((c) => on.has(c));
        return (
          <button
            key={group.id}
            className={`chip cat-${group.face}${lit ? " on" : ""}`}
            aria-pressed={lit}
            onClick={() => onToggle(group)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {CATEGORY_ICON[group.face]}
            </svg>
            {group.label}
          </button>
        );
      })}
    </div>
  );
}

export function KindPicker({ on, onToggle, onAll }: KindProps) {
  const [open, setOpen] = useState(false);
  const tap = useRef<HTMLButtonElement | null>(null);
  const box = useRef<HTMLDivElement | null>(null);

  const chosen = picked(on);
  const all = chosen.length === 0;
  const first = chosen[0];
  const label = all ? "Echoes" : chosen.length === 1 ? first!.label : `${first!.label} +${chosen.length - 1}`;

  /*
   * A tap anywhere else closes it, on the way down, so the tap that closes it does not also
   * select a pin underneath. Escape closes it and hands focus back (WCAG 2.1.2, 2.4.3).
   */
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (box.current?.contains(t) || tap.current?.contains(t)) return;
      close();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close();
      tap.current?.focus();
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open, close]);

  return (
    <>
      <button
        ref={tap}
        className={`kind-tap${all ? "" : " is-filtered"}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="kind-box"
        aria-label={all ? "Echoes showing: all" : `Echoes showing: ${chosen.map((g) => g.label).join(", ")}`}
      >
        {all ? (
          <span className="kind-key" aria-hidden="true">
            <i className="cat-history" />
            <i className="cat-legend" />
            <i className="cat-food-drink" />
          </span>
        ) : (
          <svg className={`kind-glyph cat-${first!.face}`} viewBox="0 0 24 24" aria-hidden="true">
            {CATEGORY_ICON[first!.face]}
          </svg>
        )}
        <span className="kind-label">{label}</span>
        <svg className="kind-chev" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9.5l6 6 6-6" />
        </svg>
      </button>

      {/* Below the whole map bar, its full width: one box, every kind in view. */}
      {open && (
        <div className="kind-box" id="kind-box" ref={box}>
          <KindGrid on={on} onToggle={onToggle} onAll={onAll} />
        </div>
      )}
    </>
  );
}
