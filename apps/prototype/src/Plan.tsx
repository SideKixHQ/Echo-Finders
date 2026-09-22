/**
 * Choosing what to hear, before setting off.
 *
 * A deck, not a list. The first version of this was twelve checkbox rows, which is a
 * settings screen wearing a product's clothes — you scan it, you tick, you feel nothing,
 * and the thing you are actually choosing between (twelve *stories*) is reduced to twelve
 * lines of grey text.
 *
 * So it borrows the design's own `.reel` pattern: one card at a time, scroll-snapped, each
 * showing a single echo at a size where its teaser can do the work it was written to do.
 * Choosing is the whole card, not a 20px target. The next card peeks in below, which is
 * what tells anybody it moves without a word of instruction.
 *
 * That is also the right shape for the decision. A checklist asks "which of these twelve",
 * which nobody can hold in their head; a deck asks "this one?" twelve times, which is a
 * question a person can actually answer.
 */

import type { Echo, Upcoming } from "@echofinders/core";

export interface PlanProps {
  readonly route: { readonly name?: string; readonly id: string };
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
  const minutes = Math.round(picked.reduce((t, i) => t + i.echo.durationS, 0) / 60);

  return (
    <div className="plan">
      <header className="plan-bar">
        <div className="plan-bar-text">
          <span className="plan-kicker">Before you go</span>
          <strong>{route.name ?? route.id}</strong>
        </div>
        <div className="plan-chips">
          <button className={picked.length === items.length ? "chip on" : "chip"} onClick={onAll}>
            All
          </button>
          <button className={picked.length === 0 ? "chip on" : "chip"} onClick={onNone}>
            None
          </button>
        </div>
      </header>

      <div className="plan-deck">
        {items.map((item, index) => {
          const on = chosen.has(item.echo.id);
          return (
            <article key={item.echo.id} className={on ? "card card-on" : "card"}>
              <div className="card-index">
                {index + 1} / {items.length}
              </div>

              <button className="card-hit" onClick={() => onToggle(item.echo.id)} aria-pressed={on}>
                {/* The teaser, at the size it was written for. This is the thing being chosen. */}
                <p className="card-teaser">{item.echo.teaser ?? item.echo.summary}</p>
                <div className="card-meta">
                  <span>{item.echo.point.place}</span>
                  <span className="card-dot">·</span>
                  <span>{Math.max(1, Math.round(item.echo.durationS / 60))} min</span>
                </div>
              </button>

              <div className="card-foot">
                <button
                  className={on ? "card-add card-add-on" : "card-add"}
                  onClick={() => onToggle(item.echo.id)}
                >
                  <span className="card-tick" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M5 12.5 L10 17.5 L19 7" />
                    </svg>
                  </span>
                  {on ? "In your journey" : "Add to journey"}
                </button>
                <button
                  className="card-hear"
                  onClick={() => onPlay(item.echo)}
                  aria-label="Hear it now"
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </button>
              </div>
            </article>
          );
        })}
        {items.length === 0 && (
          <article className="card card-empty">
            <p className="card-teaser">This route passes nothing in your categories.</p>
          </article>
        )}
      </div>

      {/*
        Sits at the bottom, under the deck, because it only means anything once something
        has been chosen — and offering it first invites switching it on and finding out
        afterwards what was agreed to. The running total is right beside it for the same
        reason: this is an agreement about a known quantity.
      */}
      <footer className={autoPlay ? "plan-auto plan-auto-on" : "plan-auto"}>
        <button
          className="plan-auto-hit"
          onClick={() => onAutoPlay(!autoPlay)}
          aria-pressed={autoPlay}
        >
          <span className="plan-switch" aria-hidden="true">
            <span />
          </span>
          <span className="plan-auto-text">
            <strong>Play these as I reach them</strong>
            <small>
              {picked.length === 0
                ? "Nothing chosen yet"
                : `${picked.length} chosen · ${minutes} min of listening`}
            </small>
          </span>
        </button>
      </footer>
    </div>
  );
}
