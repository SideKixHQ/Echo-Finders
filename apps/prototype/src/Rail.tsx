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

import { memo, useState } from "react";
import type { EchoCategory, Route, TravelMode } from "@echofinders/core";
import { CATEGORY_LABEL, CATEGORY_ORDER } from "./categories";
import { MODE_ICON, MODE_LABEL } from "./travel";

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
  /** Kids mode, for the whole app. An age the engine gates on, not a filter. */
  readonly kids: boolean;
  readonly onKids: (on: boolean) => void;
  /** Showing the whole journey rather than following the listener. */
  readonly overview: boolean;
  readonly onOverview: (overview: boolean) => void;
  /** Back to the package screen: which journey, and how big it is to carry. */
  readonly onDownload: () => void;
  /** Whether the journey is already on the device. */
  readonly downloaded: boolean;
}

type Panel = "mode" | "filter" | null;

/** One representative route per mode, so the switch offers journeys rather than jargon. */
const MODE_ORDER: readonly TravelMode[] = ["walking", "driving", "flight"];

function RailInner({
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
  kids,
  onKids,
  overview,
  onOverview,
  onDownload,
  downloaded,
}: RailProps) {
  const [panel, setPanel] = useState<Panel>(null);
  const show = (next: Panel) => setPanel(panel === next ? null : next);
  const filtered = on.size < available.size;

  return (
    <div className="rail">
      {/*
        Recentre, first, because it is the only button here that puts right what the others
        can break. Tapping a pin, dragging the sheet up, switching mode — any of them can
        leave a walker looking at a piece of map they are not standing on, and the way back
        should not be a guess.

        It is a toggle rather than a one-way button: the two states answer different
        questions — *where am I* and *what is this walk* — and both are worth asking. Marked
        rather than lit while in overview, because overview is a departure from the normal
        state of the map, not a mode you are meant to settle in.
      */}
      <button
        className={overview ? "rail-btn marked" : "rail-btn"}
        onClick={() => onOverview(!overview)}
        aria-pressed={overview}
        aria-label={overview ? "Follow me" : "Whole journey"}
      >
        {overview ? (
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="6.4" />
            <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
            <path d="M12 2.2v3.1M12 18.7v3.1M2.2 12h3.1M18.7 12h3.1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24">
            <path d="M3 8.2l6-2.7 6 2.7 6-2.7v10.3l-6 2.7-6-2.7-6 2.7z" />
            <path d="M9 5.5v13M15 8.2v13" />
          </svg>
        )}
      </button>

      {/*
        The package. An aircraft has no signal and a foreign city has no data plan worth
        using, so carrying the journey is not a power-user feature — it is the difference
        between the app working and not (ADR-0003). That earns a permanent button rather
        than a screen you can only reach by starting over.
      */}
      <button
        className={downloaded ? "rail-btn ready" : "rail-btn marked"}
        onClick={onDownload}
        aria-label={downloaded ? "Journey downloaded" : "Download this journey"}
      >
        {downloaded ? (
          <svg viewBox="0 0 24 24">
            <path d="M12 3.2a8.8 8.8 0 1 1-6.2 2.6" />
            <path d="M8.2 11.8l3 3 5.6-6.4" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24">
            <path d="M12 3.2v10.6M8 10l4 3.8 4-3.8" />
            <path d="M4.2 16.4v2.9a1.5 1.5 0 0 0 1.5 1.5h12.6a1.5 1.5 0 0 0 1.5-1.5v-2.9" />
          </svg>
        )}
      </button>

      {/* Mode. The richest route per mode, so switching lands somewhere worth being rather
          than on whichever one happens to sort first. */}
      <button
        className={panel === "mode" ? "rail-btn on" : "rail-btn"}
        onClick={() => show("mode")}
        aria-label="Travel mode"
        aria-expanded={panel === "mode"}
      >
        <svg viewBox="0 0 24 24">{MODE_ICON[route.mode] ?? MODE_ICON.walking}</svg>
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

      {/*
        Kids mode. First on the rail because it is the only one of these that changes what
        the app *is* rather than what it shows — the others are views over the same library,
        and this one narrows the library itself.
      */}
      <button
        className={kids ? "rail-btn kids-on" : "rail-btn"}
        onClick={() => onKids(!kids)}
        aria-pressed={kids}
        aria-label="Kids mode"
      >
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" />
          <circle cx="9" cy="10" r="0.9" fill="currentColor" />
          <circle cx="15" cy="10" r="0.9" fill="currentColor" />
        </svg>
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
        <div className="rail-pop rail-pop-mode">
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
                <svg viewBox="0 0 24 24">{MODE_ICON[mode]}</svg>
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

/*
 * Memoised. Nothing on this component depends on where the listener is, and the app
 * re-renders on every position fix — four times a second, for the life of a walk. Its
 * callbacks are stable in `App`, which is what makes the comparison actually succeed.
 */
export const Rail = memo(RailInner);
