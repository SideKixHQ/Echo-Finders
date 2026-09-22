/**
 * Choosing how you are travelling.
 *
 * This is the first thing the product asks, because it is the question everything else
 * hangs off: mode decides how wide the corridor is, how far an echo may play from its
 * place, how much of the journey is narration, where position comes from, and how big the
 * offline package may be. Those are not presentation differences — a walking tour and a
 * flight are the same engine with a different table of numbers (MODE_PRESETS), and getting
 * the table right is the whole of multi-modal support.
 *
 * Three are offered because three are what a person recognises. Rail and cycling are
 * supported by the engine and have presets ready; they appear here when there is content
 * on a route that uses them, rather than as empty options.
 */

import type { Route, TravelMode } from "@echofinders/core";

const LABELS: Partial<Record<TravelMode, { name: string; hint: string }>> = {
  flight: { name: "Air", hint: "80km corridor · 10 min tolerance" },
  driving: { name: "Car", hint: "5km corridor · 3 min tolerance" },
  walking: { name: "Walking", hint: "300m corridor · 90 sec tolerance" },
  rail: { name: "Rail", hint: "12km corridor · 5 min tolerance" },
  cycling: { name: "Cycling", hint: "1km corridor · 2 min tolerance" },
};

export interface ModePickerProps {
  readonly routes: readonly Route[];
  readonly selected: Route;
  readonly onSelect: (route: Route) => void;
  /** How many echoes each route's corridor actually contains, by route id. */
  readonly counts: Readonly<Record<string, number>>;
}

export function ModePicker({ routes, selected, onSelect, counts }: ModePickerProps) {
  // Modes in the order a person would think of them, not the order the routes happen to
  // be filed in.
  const order: TravelMode[] = ["flight", "driving", "walking", "rail", "cycling"];
  const modes = order.filter((mode) => routes.some((route) => route.mode === mode));
  const inMode = routes.filter((route) => route.mode === selected.mode);

  return (
    <div className="modepicker">
      <div className="modes">
        {modes.map((mode) => {
          const label = LABELS[mode];
          // The richest route in the mode, not the first one filed under it. Landing on a
          // two-echo route when a twelve-echo one exists makes the mode look empty.
          const best = routes
            .filter((route) => route.mode === mode)
            .reduce((a, b) => ((counts[b.id] ?? 0) > (counts[a.id] ?? 0) ? b : a));
          return (
            <button
              key={mode}
              className={mode === selected.mode ? "mode on" : "mode"}
              onClick={() => onSelect(best)}
              title={label?.hint}
            >
              {label?.name ?? mode}
            </button>
          );
        })}
      </div>

      {inMode.length > 1 && (
        <div className="routes">
          {inMode.map((route) => (
            <button
              key={route.id}
              className={route.id === selected.id ? "route on" : "route"}
              onClick={() => onSelect(route)}
            >
              {route.name ?? route.id}
              <span className="count">{counts[route.id] ?? 0}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
