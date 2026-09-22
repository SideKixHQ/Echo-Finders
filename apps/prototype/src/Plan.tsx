/**
 * Choosing what to hear, before setting off.
 *
 * A separate moment from travelling, which is why it is a separate screen. You do this
 * sitting down — at the gate, in the car park, at the trailhead — looking at everything the
 * route passes and deciding which of it you actually want. Then you put the phone away.
 *
 * It exists because auto-play without it is an imposition. Twelve echoes on a walk is forty
 * minutes of narration; five on a flight is fifteen. Handing somebody all of it because
 * they once tapped a switch is how a product becomes something people turn off. Choosing
 * first turns the same switch into an agreement about a known quantity, which is why the
 * running total of listening time is at the top rather than buried.
 *
 * Nothing here affects *collecting*. Every echo on the route still opens as you reach it
 * and still goes into the collection — the choice is only about what talks on its own.
 */

import type { Echo, Upcoming } from "@echofinders/core";

export interface PlanProps {
  readonly route: { readonly name?: string; readonly id: string };
  /** Everything on this route, in the order it is reached. */
  readonly items: readonly Upcoming[];
  readonly chosen: ReadonlySet<string>;
  readonly onToggle: (echoId: string) => void;
  readonly onAll: () => void;
  readonly onNone: () => void;
  readonly autoPlay: boolean;
  readonly onAutoPlay: (on: boolean) => void;
  readonly onPlay: (echo: Echo) => void;
}

export function Plan({
  route,
  items,
  chosen,
  onToggle,
  onAll,
  onNone,
  autoPlay,
  onAutoPlay,
  onPlay,
}: PlanProps) {
  const picked = items.filter((item) => chosen.has(item.echo.id));
  const listeningS = picked.reduce((total, item) => total + item.echo.durationS, 0);

  return (
    <div className="screen-body plan">
      <header className="plan-head">
        <h2>Before you go</h2>
        <p>{route.name ?? route.id}</p>
      </header>

      <div className="plan-summary">
        <div>
          <strong>{picked.length}</strong> of {items.length} chosen
          <span className="plan-time">
            {listeningS === 0 ? "nothing to hear" : `${Math.round(listeningS / 60)} min of listening`}
          </span>
        </div>
        <div className="plan-bulk">
          <button onClick={onAll}>All</button>
          <button onClick={onNone}>None</button>
        </div>
      </div>

      {/*
        The switch sits under the list rather than over it, because it only means anything
        once something has been chosen — and putting it first invites turning it on and
        finding out afterwards what was agreed to.
      */}
      <label className={autoPlay ? "plan-auto plan-auto-on" : "plan-auto"}>
        <input
          type="checkbox"
          checked={autoPlay}
          onChange={(event) => onAutoPlay(event.target.checked)}
        />
        <span className="plan-auto-text">
          <strong>Play these as I reach them</strong>
          <small>
            One at a time, never interrupting. Everything else still opens and goes into your
            collection — it just waits for you.
          </small>
        </span>
      </label>

      <ul className="plan-list">
        {items.map((item) => {
          const on = chosen.has(item.echo.id);
          return (
            <li key={item.echo.id}>
              <button
                className={on ? "plan-row plan-row-on" : "plan-row"}
                onClick={() => onToggle(item.echo.id)}
                aria-pressed={on}
              >
                <span className="plan-tick" aria-hidden="true">
                  {on && (
                    <svg viewBox="0 0 24 24">
                      <path d="M5 12.5 L10 17.5 L19 7" />
                    </svg>
                  )}
                </span>
                <span className="plan-text">
                  <strong>{item.echo.title}</strong>
                  <small>
                    {item.echo.point.place} · {Math.round(item.echo.durationS / 60) || 1} min
                  </small>
                </span>
              </button>
              <button
                className="plan-preview"
                onClick={() => onPlay(item.echo)}
                aria-label={`Play ${item.echo.title} now`}
              >
                <svg viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </button>
            </li>
          );
        })}
        {items.length === 0 && (
          <li className="empty">This route passes nothing in your categories.</li>
        )}
      </ul>
    </div>
  );
}
