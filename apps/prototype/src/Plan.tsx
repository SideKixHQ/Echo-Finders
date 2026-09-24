/**
 * Choosing what to hear, before setting off.
 *
 * This was a swipe deck: one full-screen card per echo, scroll-snapped, teaser set at 21px.
 * The reasoning was that a checklist asks "which of these twelve", which nobody can hold in
 * their head, while a deck asks "this one?" twelve times, which is answerable.
 *
 * That reasoning is about the *decision*, and it ignored the screen. A card with a
 * `min-height` of 58% shows two at a time, so the twelve stories you are choosing between
 * are a thing you scroll past rather than a thing you see — and each card spent most of its
 * height on nothing, because a two-line teaser in a 480px box is a two-line teaser with 400
 * pixels of empty under it. What it produced was the opposite of considered: a screen with
 * almost no information on it and no way to compare anything with anything.
 *
 * So: a list, built from the design's own `.card` (`design/SPEC.md`) — the same component
 * the map sheet uses, at the same size, which means the thing you tapped on the map looks
 * like the thing you are ticking here. Every row now carries what the decision actually
 * needs and the deck never showed: which category, how long, where it is, and how far along
 * the route it falls. Six fit on a screen instead of two.
 *
 * The running total stays pinned at the bottom, because the question this screen really
 * answers is not "which ones" but "how much am I agreeing to" — twelve echoes is forty
 * minutes of narration, and switching on auto-play without knowing that is how a product
 * becomes something people turn off.
 */

import type { Echo, Upcoming } from "@echofinders/core";
import { CATEGORY_LABEL } from "./categories";

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
  const total = Math.round(items.reduce((t, i) => t + i.echo.durationS, 0) / 60);

  return (
    <div className="plan">
      <header className="plan-head">
        <span className="plan-kicker">Before you go</span>
        <h1>{route.name ?? route.id}</h1>
        {/*
          The two numbers that decide everything on this screen, in the sentence a person
          would say. "12 stories · 41 min" is what you are choosing from; the footer says
          what you have chosen.
        */}
        <p>
          {items.length} {items.length === 1 ? "story" : "stories"} along the way · {total} min
          in all
        </p>
        <div className="plan-chips">
          <button
            className={picked.length === items.length && items.length > 0 ? "chip on" : "chip"}
            onClick={onAll}
          >
            All
          </button>
          <button className={picked.length === 0 ? "chip on" : "chip"} onClick={onNone}>
            None
          </button>
        </div>
      </header>

      <div className="plan-list">
        {items.map((item, index) => {
          const on = chosen.has(item.echo.id);
          const echo = item.echo;
          return (
            <article key={echo.id} className={on ? "card card-on" : "card"}>
              {/*
                The whole row toggles, so nobody has to aim at a pill when the row is the
                thing they are thinking about. There is no second tick floating in the
                corner: it collided with the duration, and the Add button below already
                says, in words, which state the row is in.
              */}
              <button className="card-hit" onClick={() => onToggle(echo.id)} aria-pressed={on}>
                <div className="card-top">
                  <span className={`ecard-tag cat-${echo.category}`}>
                    <span className="ecard-dot" />
                    {CATEGORY_LABEL[echo.category]}
                  </span>
                  <span className="card-ord">{index + 1}</span>
                  <span className="dur">{Math.max(1, Math.round(echo.durationS / 60))} min</span>
                </div>

                <h4>{echo.title}</h4>
                <p>{echo.teaser ?? echo.summary}</p>

                <div className="ecard-place">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z" />
                    <circle cx="12" cy="10" r="2.4" />
                  </svg>
                  {echo.point.place}
                </div>

              </button>

              <div className="card-foot">
                <button
                  className={on ? "act act-on" : "act"}
                  onClick={() => onToggle(echo.id)}
                  aria-pressed={on}
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M5 12.5 L10 17.5 L19 7" />
                  </svg>
                  {on ? "In your journey" : "Add"}
                </button>
                <button className="act" onClick={() => onPlay(echo)}>
                  <svg viewBox="0 0 24 24" className="act-fill">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Hear it now
                </button>
              </div>
            </article>
          );
        })}

        {items.length === 0 && (
          <div className="empty">
            <b>Nothing on this route yet</b>
            This journey passes nothing in the categories you have switched on. Turn some back
            on from the chips above the map.
          </div>
        )}
      </div>

      {/*
        Pinned, because it only means anything once something has been chosen — and offering
        it first invites switching it on and finding out afterwards what was agreed to. The
        running total is right beside it for the same reason: this is an agreement about a
        known quantity.
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
