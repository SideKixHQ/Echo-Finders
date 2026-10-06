/**
 * The journey, shrunk to what a walker needs from it, with the travel modes behind a hold.
 *
 * On foot the long destination pill was spending most of the top row on the name of the
 * walk you already chose, while the category chips — the thing you actually change as you
 * go — were folded behind three dots. Board 2 of the design canvas ("FIND IT") draws the
 * chips as a visible row, and on foot they matter more than the journey's name. So the
 * journey becomes a small chip (how you are travelling, and how long is left) and the
 * chips get the rest of the row.
 *
 * TAP does what it always did: opens the journey screen.
 * PRESS AND HOLD opens a menu to switch walking, driving and flying without leaving the
 * map. A hold is invisible unless something says it is there, so three things do:
 *   · while you hold, a ring fills round the chip, so the press visibly does something
 *     before the menu arrives;
 *   · a small grip of dots on the chip's edge, the usual "there is more here" mark;
 *   · the first few times the map opens, a hint under the chip says "Hold to switch
 *     walking, driving, flying", until you have used the hold once.
 * Right-click, the context-menu key and Shift+F10 open the same menu, so it is not a
 * touch-only feature, and the journey screen still has the same choice for anyone who
 * never finds the hold.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { TravelMode } from "@echofinders/core";
import { MODE_ICON } from "./travel";

export type Travel = "walking" | "driving" | "flight";

export interface JourneyChipProps {
  /** How you are travelling now. */
  readonly travel: Travel;
  /** The mode drawn on the chip. Differs from `travel` only mid-switch. */
  readonly mode: TravelMode;
  /** Short text beside the icon: time left on a route, "Here" while roaming. */
  readonly label: string;
  /** 0–1 along the route, drawn as the chip's fill. Null while roaming. */
  readonly progress: number | null;
  /** The accessible name, which says in full what the chip says in a word. */
  readonly name: string;
  readonly onOpen: () => void;
  readonly onTravel: (next: Travel) => void;
}

const HOLD_MS = 450;
const HINT_KEY = "ef-hold-hint";
/** How many times the hint shows before it assumes you have read it. */
const HINT_SHOWS = 3;

const MODES: readonly { readonly id: Travel; readonly label: string; readonly hint: string }[] = [
  { id: "walking", label: "Walking", hint: "Echoes within a few streets" },
  { id: "driving", label: "Driving", hint: "Echoes along the road" },
  { id: "flight", label: "Flying", hint: "Pick a flight next" },
];

/** Storage can throw or come back empty (private windows, previews): never trust it. */
function readHint(): number {
  try {
    return Number(localStorage.getItem(HINT_KEY) ?? "0") || 0;
  } catch {
    return HINT_SHOWS;
  }
}
function writeHint(n: number) {
  try {
    localStorage.setItem(HINT_KEY, String(n));
  } catch {
    /* A hint that shows again next time is the worst case. */
  }
}

export function JourneyChip({ travel, mode, label, progress, name, onOpen, onTravel }: JourneyChipProps) {
  const [menu, setMenu] = useState(false);
  const [holding, setHolding] = useState(false);
  const [hint, setHint] = useState(false);
  const timer = useRef<number | null>(null);
  /** Set when a hold opened the menu, so the click that ends the press does not also tap. */
  const held = useRef(false);
  const wrap = useRef<HTMLDivElement | null>(null);
  const first = useRef<HTMLButtonElement | null>(null);

  // The hint: shown on the first few visits, and for six seconds each, then gone.
  useEffect(() => {
    const seen = readHint();
    if (seen >= HINT_SHOWS) return;
    writeHint(seen + 1);
    setHint(true);
    const t = window.setTimeout(() => setHint(false), 6000);
    return () => window.clearTimeout(t);
  }, []);

  const open = useCallback(() => {
    setMenu(true);
    setHint(false);
    // Found it: never explain it again.
    writeHint(HINT_SHOWS);
  }, []);

  const cancel = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  }, []);

  const down = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    held.current = false;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      held.current = true;
      setHolding(false);
      // A short buzz where the platform has one: the hold landed.
      navigator.vibrate?.(12);
      open();
    }, HOLD_MS);
  };

  // A tap anywhere else, or Escape, closes the menu.
  useEffect(() => {
    if (!menu) return;
    const away = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setMenu(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    first.current?.focus();
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [menu]);

  useEffect(() => cancel, [cancel]);

  const pct = progress === null ? null : Math.max(0, Math.min(1, progress)) * 100;

  return (
    <div className="jchip-wrap" ref={wrap}>
      <button
        className={holding ? "jchip is-holding" : "jchip"}
        aria-label={name}
        aria-description="Press and hold to switch between walking, driving and flying"
        aria-haspopup="menu"
        aria-expanded={menu}
        onPointerDown={down}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onContextMenu={(e) => {
          // Right-click on a desktop, and the long-press event Android also fires.
          e.preventDefault();
          cancel();
          held.current = true;
          open();
        }}
        onKeyDown={(e) => {
          if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
            e.preventDefault();
            open();
          }
        }}
        onClick={() => {
          if (held.current) {
            held.current = false;
            return;
          }
          onOpen();
        }}
      >
        {pct !== null && <span className="jchip-fill" style={{ width: `${pct}%` }} aria-hidden="true" />}
        <svg className="jchip-mode" viewBox="0 0 24 24" aria-hidden="true">
          {MODE_ICON[mode]}
        </svg>
        <span className="jchip-label">{label}</span>
        {/* The grip: two dots, the usual mark for "there is more here if you hold". */}
        <span className="jchip-grip" aria-hidden="true">
          <i />
          <i />
        </span>
      </button>

      {hint && !menu && (
        <p className="jchip-hint" role="status">
          Hold to switch walking, driving, flying
        </p>
      )}

      {menu && (
        <div className="jmenu" role="menu" aria-label="How are you travelling?">
          <p className="jmenu-head" aria-hidden="true">
            How are you travelling?
          </p>
          {MODES.map((m, i) => (
            <button
              key={m.id}
              ref={i === 0 ? first : undefined}
              role="menuitemradio"
              aria-checked={travel === m.id}
              className={travel === m.id ? "jmenu-item on" : "jmenu-item"}
              onClick={() => {
                setMenu(false);
                onTravel(m.id);
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {MODE_ICON[m.id]}
              </svg>
              <span>
                {m.label}
                <small>{m.hint}</small>
              </span>
              {travel === m.id && (
                <svg className="jmenu-tick" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 12.5 L10 17.5 L19 7" />
                </svg>
              )}
            </button>
          ))}
          <button
            role="menuitem"
            className="jmenu-item jmenu-more"
            onClick={() => {
              setMenu(false);
              onOpen();
            }}
          >
            Change journey…
          </button>
        </div>
      )}
    </div>
  );
}
