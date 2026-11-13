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
 * topics as chips, each in its own colour and glyph so the box is still the key to the
 * map. It is the box flight mode always had, now everywhere. (A bottom sheet was tried
 * first; James preferred this: it opens where you tapped and leaves the map in view.)
 * Pick as many as you like; the map changes as you tap; a tap outside, the button again,
 * or Escape closes it. My Echoes uses this same button and box, with the count of what
 * it shows beside the name ("Ghosts · 2"), since there a tap changes a list you cannot see
 * behind the box.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { EchoCategory } from "@echofinders/core";
import { CATEGORY_ICON, CHIP_GROUPS, RARE_AFTER, RARE_ICON, type ChipGroup } from "./categories";

/** The Rare chip: a filter on rarity, combined with the topics (AND). */
export interface RareChip {
  readonly on: boolean;
  readonly onToggle: () => void;
}

interface KindProps {
  readonly on: ReadonlySet<EchoCategory>;
  readonly onToggle: (group: ChipGroup) => void;
  readonly onAll: () => void;
  /** The map's panel has Rare; My Echoes has its own Rare finds tile instead. */
  readonly rare?: RareChip;
}

const isAll = (on: ReadonlySet<EchoCategory>) =>
  CHIP_GROUPS.every((g) => g.categories.every((c) => on.has(c)));

/** The kinds picked, in the grid's order. Empty when everything is showing. */
const picked = (on: ReadonlySet<EchoCategory>) =>
  isAll(on) ? [] : CHIP_GROUPS.filter((g) => g.categories.some((c) => on.has(c)));

/**
 * All, then every topic, in two columns (the approved canvas, board "The 16 topics",
 * 2026-11-12). With everything showing, All is the one lit tile and the topics sit unlit:
 * fifteen lit tiles would read as fifteen things picked.
 *
 * Every topic, and Rare, wherever you are (James, 2026-11-13, amending ADR-0021). The
 * panel used to offer only the topics with three or more echoes in view, under a line
 * naming the area and a note saying the list changes as the map moves; both lines went
 * with that rule. Picking a topic here now takes the map out to every echo of it
 * (`topicBox`, App.tsx), so a topic with none nearby is still somewhere to go.
 */
export function KindGrid({ on, onToggle, onAll, rare }: KindProps) {
  const all = isAll(on);
  const shown = CHIP_GROUPS;
  const rareShown = !!rare;
  const topic = (group: ChipGroup) => {
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
  };
  // Rare after the first four of the panel's order, wherever those four are in what shows.
  const before = shown.filter((g) => CHIP_GROUPS.indexOf(g) < RARE_AFTER);
  const after = shown.filter((g) => CHIP_GROUPS.indexOf(g) >= RARE_AFTER);
  return (
    <div className="kind-panel">
      <div className="kind-chips" role="group" aria-label="Which echoes to show">
        <button className={`chip chip-all${all && !rare?.on ? " on" : ""}`} aria-pressed={all && !rare?.on} onClick={onAll}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12.5 L10 17.5 L19 7" />
          </svg>
          All
        </button>
        {before.map(topic)}
        {rareShown && (
          <button className={`chip cat-rare${rare.on ? " on" : ""}`} aria-pressed={rare.on} onClick={rare.onToggle}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {RARE_ICON}
            </svg>
            Rare
          </button>
        )}
        {after.map(topic)}
      </div>
    </div>
  );
}

interface PickerProps extends KindProps {
  /** How many echoes the pick shows, said on the button while a kind is picked (My echoes). */
  readonly count?: number;
  /** Open and close from outside, so a screen with two boxes keeps one open at a time. */
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}

export function KindPicker({ on, onToggle, onAll, rare, count, open: openIn, onOpenChange }: PickerProps) {
  const [openOwn, setOpenOwn] = useState(false);
  const open = openIn ?? openOwn;
  const setOpen = useCallback(
    (o: boolean) => {
      setOpenOwn(o);
      onOpenChange?.(o);
    },
    [onOpenChange],
  );
  const tap = useRef<HTMLButtonElement | null>(null);
  const box = useRef<HTMLDivElement | null>(null);

  const topics = picked(on);
  const rareOn = !!rare?.on;
  // Rare counts as one more thing picked, said after the topics: "History + Rare" reads
  // as "+1"; with no topic picked it is "Rare" alone.
  const names = [...topics.map((g) => g.label), ...(rareOn ? ["Rare"] : [])];
  const all = names.length === 0;
  const first = topics[0];
  const label = all ? "All echoes" : names.length === 1 ? names[0]! : `${names[0]} +${names.length - 1}`;

  /*
   * A tap anywhere else closes it, on the way down, so the tap that closes it does not also
   * select a pin underneath. Escape closes it and hands focus back (WCAG 2.1.2, 2.4.3).
   */
  const close = useCallback(() => setOpen(false), [setOpen]);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (box.current?.contains(t) || tap.current?.contains(t)) return;
      if ((e.target as Element).classList?.contains("menu-scrim")) return;
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
        aria-label={
          all
            ? "Echoes showing: all"
            : `Echoes showing: ${names.join(", ")}${count === undefined ? "" : `, ${count}`}`
        }
      >
        {/* Everything on says so in words, "All echoes", as the map board draws it. */}
        {!all && (
          <svg className={`kind-glyph cat-${first ? first.face : "rare"}`} viewBox="0 0 24 24" aria-hidden="true">
            {first ? CATEGORY_ICON[first.face] : RARE_ICON}
          </svg>
        )}
        <span className="kind-label">{label}</span>
        {!all && count !== undefined && <span className="kind-count">· {count}</span>}
        <svg className="kind-chev" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9.5l6 6 6-6" />
        </svg>
      </button>

      {open && <div className="menu-scrim" aria-hidden="true" onClick={close} />}
      {/* Below the whole map bar, its full width: one box, every kind in view. */}
      {open && (
        <div className="kind-box" id="kind-box" ref={box}>
          <KindGrid on={on} onToggle={onToggle} onAll={onAll} rare={rare} />
        </div>
      )}
    </>
  );
}
