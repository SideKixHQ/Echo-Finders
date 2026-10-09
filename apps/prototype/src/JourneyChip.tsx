/**
 * The journey at the top of the map, and the one place to change it.
 *
 * On foot and driving it is a small chip (how you are travelling, and either "Exploring"
 * or the time left on a route) so the category chips get the rest of the row: on a walk
 * they are what you change as you go, and board 2 of the canvas draws them as a row. On
 * a flight it wraps the origin-to-destination ribbon, because a passenger cannot look out
 * of the window and the line is the orientation.
 *
 * TAP opens a small trip sheet under it: a visible Walk / Drive / Fly row, then the
 * choices for that mode — "Around here, no route" or one of its routes — and a link to the
 * full journey screen. Every comparable app keeps travel mode one visible tap away (Google
 * and Apple Maps' mode row, Strava's sport icon); none hides it behind a long press, and
 * Apple's guidelines say a gesture must never be the only way to an important action. So
 * there is no press-and-hold here.
 *
 * NOTHING COMMITS UNTIL A CONCRETE CHOICE IS MADE. Switching the Walk / Drive / Fly row only
 * changes what the sheet lists; the journey changes when you pick "Around here" or a route.
 * That is what stops "Flying" leaving the app half-switched — flying with a walking route
 * still selected — when you change your mind before picking a flight.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Echo, Route } from "@echofinders/core";
import { MODE_ICON } from "./travel";
import { loadZips, searchPlaces, type PlaceHit } from "./place-search";

export type Travel = "walking" | "driving" | "flight";

export interface JourneyChipProps {
  /** How you are travelling now. */
  readonly travel: Travel;
  readonly roaming: boolean;
  readonly route: Route;
  readonly routes: readonly Route[];
  /** Echoes along each route, by id. */
  readonly counts: Readonly<Record<string, number>>;
  /** The journey is on this device, so it plays with no signal. */
  readonly kept: boolean;
  /** Short text on the chip: "Exploring", or the time left on a route. */
  readonly label: string;
  /** 0–1 along the route, drawn as the chip's fill. Null while roaming. */
  readonly progress: number | null;
  /** The accessible name, which says in full what the chip says in a word. */
  readonly name: string;
  /** The flight ribbon, drawn inside the button instead of the chip's own face. */
  readonly children?: ReactNode;
  readonly onRoam: (mode: "walking" | "driving") => void;
  readonly onRoute: (route: Route) => void;
  /** The full journey screen, opened on the mode the sheet was showing. */
  readonly onDetails: (mode: Travel) => void;
  /** Everything there is, for finding a place by name. */
  readonly library?: readonly Echo[];
  /** Look at somewhere else: a ZIP code or a place (`place-search.ts`). */
  readonly onLook?: (hit: PlaceHit, mode: "walking" | "driving") => void;
}

const MODES: readonly { readonly id: Travel; readonly label: string }[] = [
  { id: "walking", label: "Walk" },
  { id: "driving", label: "Drive" },
  { id: "flight", label: "Fly" },
];

/** The area before the colon is the route's name; what follows belongs on the journey screen. */
const routeName = (r: Route) => (r.name ?? r.destination.name).split(":")[0]!.trim();

export function JourneyChip(props: JourneyChipProps) {
  const { travel, roaming, route, routes, counts, label, progress, name, children } = props;
  const [open, setOpen] = useState(false);
  /** The mode the sheet is showing, which is not a commitment. */
  const [tab, setTab] = useState<Travel>(travel);
  const wrap = useRef<HTMLDivElement | null>(null);
  const chip = useRef<HTMLButtonElement | null>(null);
  const current = useRef<HTMLButtonElement | null>(null);

  // Opening always starts on how you are travelling now.
  useEffect(() => {
    if (open) setTab(travel);
  }, [open, travel]);

  /*
   * Focus goes into the sheet when it opens and back to the chip when it closes, so a
   * keyboard or screen-reader user is never dropped at the top of the page when the
   * sheet they were in disappears (WCAG 2.4.3).
   */
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) chip.current?.focus();
  };
  useEffect(() => {
    if (open) current.current?.focus();
  }, [open]);

  // A tap anywhere else, or Escape, closes it.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const done = (fn: () => void) => () => {
    close(true);
    fn();
  };

  const forTab = routes.filter((r) => r.mode === tab);
  const pct = progress === null ? null : Math.max(0, Math.min(1, progress)) * 100;

  return (
    <div className={children ? "jchip-wrap jchip-wrap-wide" : "jchip-wrap"} ref={wrap}>
      <button
        ref={chip}
        className={children ? "journey-tap" : "jchip"}
        aria-label={name}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {children ?? (
          <>
            {pct !== null && <span className="jchip-fill" style={{ width: `${pct}%` }} aria-hidden="true" />}
            <svg className="jchip-mode" viewBox="0 0 24 24" aria-hidden="true">
              {MODE_ICON[travel]}
            </svg>
            <span className="jchip-label">{label}</span>
            {/* The ▾: this opens something. */}
            <svg className="jchip-caret" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 9.5l6 6 6-6" />
            </svg>
          </>
        )}
      </button>

      {open && (
        <div className="jmenu" role="dialog" aria-label="Your trip">
          <div className="jmenu-modes" role="group" aria-label="How are you travelling?">
            {MODES.map((m) => (
              <button
                key={m.id}
                ref={m.id === travel ? current : undefined}
                className={tab === m.id ? "jmenu-mode on" : "jmenu-mode"}
                aria-pressed={tab === m.id}
                onClick={() => setTab(m.id)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  {MODE_ICON[m.id]}
                </svg>
                {m.label}
              </button>
            ))}
          </div>

          {/* Roaming exists on the ground only: a flight is somebody else's route. */}
          {tab !== "flight" && (
            <button
              className={roaming && travel === tab ? "jmenu-item on" : "jmenu-item"}
              aria-current={roaming && travel === tab ? "true" : undefined}
              onClick={done(() => props.onRoam(tab as "walking" | "driving"))}
            >
              <span>
                Around here
                <small>No route. Finds what is near you as you go.</small>
              </span>
              {roaming && travel === tab && <Tick />}
            </button>
          )}
          {tab !== "flight" && props.onLook && (
            <LookSomewhere
              library={props.library ?? []}
              onPick={(hit) => done(() => props.onLook!(hit, tab as "walking" | "driving"))()}
            />
          )}
          {forTab.map((r) => {
            const on = !roaming && r.id === route.id;
            return (
              <button
                key={r.id}
                className={on ? "jmenu-item on" : "jmenu-item"}
                aria-current={on ? "true" : undefined}
                onClick={done(() => props.onRoute(r))}
              >
                <span>
                  {routeName(r)}
                  <small>
                    {counts[r.id] ?? 0} {(counts[r.id] ?? 0) === 1 ? "echo" : "echoes"}
                    {r.mode === "flight" && r.origin.code && r.destination.code
                      ? ` · ${r.origin.code} to ${r.destination.code}`
                      : ""}
                  </small>
                </span>
                {on && <Tick />}
              </button>
            );
          })}
          {tab === "flight" && forTab.length === 0 && (
            <p className="jmenu-empty">No flights with echoes yet.</p>
          )}

          <button className="jmenu-item jmenu-more" onClick={done(() => props.onDetails(tab))}>
            {tab === "flight" ? (
              "Find a flight by airport…"
            ) : (
              <span>
                Journey details…
                {props.kept && <small>On this device, plays with no signal</small>}
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

const Tick = () => (
  <svg className="jmenu-tick" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 12.5 L10 17.5 L19 7" />
  </svg>
);

/**
 * A ZIP code or a place, typed: the map goes and looks there.
 *
 * Under "Around here" because it is the same kind of choice: where the map is looking, with
 * no route. The ZIP list is fetched the first time this box is used, not before.
 */
function LookSomewhere({ library, onPick }: { readonly library: readonly Echo[]; readonly onPick: (hit: PlaceHit) => void }) {
  const [query, setQuery] = useState("");
  const [table, setTable] = useState<ReadonlyMap<string, { lat: number; lng: number }> | null>(null);
  const hits = query.trim().length >= 2 ? searchPlaces(query, table ?? new Map(), library) : [];
  const waiting = /^\d{2,5}$/.test(query.trim()) && table === null;
  return (
    <div className="jmenu-look">
      <label className="jmenu-look-field">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4.5 4.5" />
        </svg>
        <input
          type="search"
          inputMode="search"
          autoComplete="off"
          placeholder="Look somewhere else: ZIP or place"
          aria-label="Look somewhere else: a ZIP code or a place"
          value={query}
          onFocus={() => {
            if (!table) void loadZips().then(setTable);
          }}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && hits[0]) onPick(hits[0]);
          }}
        />
      </label>
      {waiting && <p className="jmenu-empty">Finding ZIP codes…</p>}
      {!waiting && query.trim().length >= 2 && hits.length === 0 && (
        <p className="jmenu-empty">Nothing by that name or ZIP code yet.</p>
      )}
      {hits.map((hit) => (
        <button key={hit.label + hit.at.lat} className="jmenu-item jmenu-hit" onClick={() => onPick(hit)}>
          <span>
            {hit.label}
            {hit.detail && <small>{hit.detail}</small>}
          </span>
        </button>
      ))}
    </div>
  );
}
