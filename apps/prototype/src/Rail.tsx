/**
 * The controls, where a thumb can reach them.
 *
 * Everything on this rail already existed — theme, travel mode, category filter, saved —
 * and every one of them lived in the commentary column beside the phone, which is to say
 * on a desktop screen, which is to say nowhere at all once the app is opened on the device
 * it is for. A control you can only reach on a laptop is not a control in a walking app.
 *
 * A vertical rail rather than another bar, because the map is the one surface that must not
 * lose height: the sheet already takes half the screen and a horizontal strip would take
 * more of what is left. Down the side it costs 44 pixels of width, which the map has, and
 * none of the height, which it does not.
 *
 * Each button opens at most one small popover, and opening one closes the others — a rail
 * that can stack three panels over the map has given the map away by another route.
 */

import { useState } from "react";
import type { EchoCategory, Route, TravelMode } from "@echofinders/core";
import { CATEGORY_LABEL, CATEGORY_ORDER } from "./categories";

export interface RailProps {
  readonly theme: "dark" | "light";
  readonly onTheme: (theme: "dark" | "light") => void;
  readonly routes: readonly Route[];
  readonly route: Route;
  readonly onRoute: (route: Route) => void;
  readonly counts: Readonly<Record<string, number>>;
  readonly available: ReadonlySet<EchoCategory>;
  readonly on: ReadonlySet<EchoCategory>;
  readonly onToggle: (category: EchoCategory) => void;
  readonly onAll: () => void;
  readonly savedCount: number;
  readonly onSaved: () => void;
}

type Panel = "mode" | "filter" | null;

/** One representative route per mode, so the switch offers journeys rather than jargon. */
const MODE_ORDER: readonly TravelMode[] = ["walking", "driving", "flight"];
const MODE_LABEL: Record<string, string> = {
  walking: "Walk",
  driving: "Drive",
  flight: "Fly",
  rail: "Train",
  cycling: "Cycle",
};

export function Rail({
  theme,
  onTheme,
  routes,
  route,
  onRoute,
  counts,
  available,
  on,
  onToggle,
  onAll,
  savedCount,
  onSaved,
}: RailProps) {
  const [panel, setPanel] = useState<Panel>(null);
  const show = (next: Panel) => setPanel(panel === next ? null : next);
  const filtered = on.size < available.size;

  return (
    <div className="rail">
      {/* Mode. The richest route per mode, so switching lands somewhere worth being rather
          than on whichever one happens to sort first. */}
      <button
        className={panel === "mode" ? "rail-btn on" : "rail-btn"}
        onClick={() => show("mode")}
        aria-label="Travel mode"
        aria-expanded={panel === "mode"}
      >
        {MODE_ICON[route.mode] ?? MODE_ICON["walking"]}
      </button>

      <button
        className={panel === "filter" ? "rail-btn on" : filtered ? "rail-btn marked" : "rail-btn"}
        onClick={() => show("filter")}
        aria-label="Filter echoes"
        aria-expanded={panel === "filter"}
      >
        <svg viewBox="0 0 24 24">
          <path d="M3 5h18l-7 8v6l-4 2v-8z" />
        </svg>
      </button>

      <button className="rail-btn" onClick={onSaved} aria-label={`Saved (${savedCount})`}>
        <svg viewBox="0 0 24 24">
          <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
        {savedCount > 0 && <em>{savedCount}</em>}
      </button>

      <button
        className="rail-btn"
        onClick={() => onTheme(theme === "dark" ? "light" : "dark")}
        aria-label={theme === "dark" ? "Light mode" : "Dark mode"}
      >
        {theme === "dark" ? (
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="4.2" />
            <path d="M12 2v2.6M12 19.4V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.6M19.4 12H22M4.2 19.8L6 18M18 6l1.8-1.8" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24">
            <path d="M20 14.5A8.2 8.2 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
          </svg>
        )}
      </button>

      {panel === "mode" && (
        <div className="rail-pop">
          {MODE_ORDER.map((mode) => {
            // The richest route in this mode: switching to "Fly" should find the flight
            // with fifty echoes on it, not whichever one sorts first with two.
            const best = routes
              .filter((r) => r.mode === mode)
              .sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0))[0];
            if (!best) return null;
            return (
              <button
                key={mode}
                className={route.mode === mode ? "rail-item on" : "rail-item"}
                onClick={() => {
                  onRoute(best);
                  setPanel(null);
                }}
              >
                {MODE_ICON[mode]}
                <span>{MODE_LABEL[mode] ?? mode}</span>
                <em>{counts[best.id] ?? 0}</em>
              </button>
            );
          })}
        </div>
      )}

      {panel === "filter" && (
        <div className="rail-pop rail-pop-filter">
          <button className={!filtered ? "rail-item on" : "rail-item"} onClick={onAll}>
            <span>All echoes</span>
            <em>{available.size}</em>
          </button>
          {CATEGORY_ORDER.filter((c) => available.has(c)).map((category) => (
            <button
              key={category}
              className={on.has(category) ? "rail-item on" : "rail-item"}
              onClick={() => onToggle(category)}
            >
              <span className={`rail-dot cat-${category}`} />
              <span>{CATEGORY_LABEL[category]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const MODE_ICON: Record<string, JSX.Element> = {
  walking: (
    <svg viewBox="0 0 24 24">
      <circle cx="13" cy="4" r="2" />
      <path d="M12.5 22l-1-6-3-3 1.5-5 3 1.5 2.5 2.5M9.5 8L7 10.5M11.5 16l-3 6" />
    </svg>
  ),
  driving: (
    <svg viewBox="0 0 24 24">
      <path d="M4 16v-3.5L6 7h12l2 5.5V16M4 16h16M4 16v2.5M20 16v2.5" />
      <circle cx="7.5" cy="16" r="1.6" />
      <circle cx="16.5" cy="16" r="1.6" />
    </svg>
  ),
  flight: (
    <svg viewBox="0 0 24 24">
      <path d="M21 15.5l-8.5-2.5V6.2a1.7 1.7 0 0 0-3.4 0V13L3 15.5V17l6.1-1.6v3.4L7 20.4V22l3.8-1 3.8 1v-1.6l-2.1-1.6v-3.4L21 17z" />
    </svg>
  ),
};
