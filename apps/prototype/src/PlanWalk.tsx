/**
 * Plan a walk: how long you have, which echoes, in what order, then go.
 *
 * James (2026-10-11): "pw a route, map it out and go." The app suggests the best walk
 * that fits the time (`planWalk` in the engine), and the listener edits it: take one out,
 * add one in. The map behind the sheet draws the way round as it changes, numbered, so the
 * plan is something you can see before you commit to it.
 */

import type { Echo } from "@echofinders/core";
import { CATEGORY_LABEL } from "./categories";
import { walkDistance, walkTime } from "./directions";

export const BUDGETS = [
  { s: 30 * 60, label: "30 min" },
  { s: 60 * 60, label: "1 hour" },
  { s: 120 * 60, label: "2 hours" },
] as const;

interface Props {
  readonly budgetS: number;
  readonly onBudget: (s: number) => void;
  readonly loop: boolean;
  readonly onLoop: (loop: boolean) => void;
  /** In walking order. */
  readonly stops: readonly Echo[];
  /** Nearby echoes not in the walk, nearest first, for adding. */
  readonly others: readonly { readonly echo: Echo; readonly distanceKm: number }[];
  readonly onRemove: (id: string) => void;
  readonly onAdd: (id: string) => void;
  /** The walk as drawn on the streets, once worked out. */
  readonly walk: { readonly metres: number; readonly seconds: number } | null;
  readonly onStart: () => void;
  readonly onCancel: () => void;
}

export function PlanWalk(p: Props) {
  const listenS = p.stops.reduce((s, e) => s + e.durationS, 0);
  return (
    <div className="pw" role="dialog" aria-label="Plan a walk">
      <div className="pw-head">
        <h2>Plan a walk</h2>
        <button className="pw-close" onClick={p.onCancel} aria-label="Close the planner">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="pw-time" role="group" aria-label="How long you have">
        {BUDGETS.map((b) => (
          <button
            key={b.s}
            className={p.budgetS === b.s ? "pw-chip on" : "pw-chip"}
            aria-pressed={p.budgetS === b.s}
            onClick={() => p.onBudget(b.s)}
          >
            {b.label}
          </button>
        ))}
        <button
          className={p.loop ? "pw-chip on" : "pw-chip"}
          aria-pressed={p.loop}
          onClick={() => p.onLoop(!p.loop)}
        >
          Back to the start
        </button>
      </div>

      <p className="pw-sum">
        {p.stops.length === 0
          ? "Nothing fits in that time from here. Try longer, or add one below."
          : `${p.stops.length} ${p.stops.length === 1 ? "echo" : "echoes"} · ${
              p.walk ? `${walkTime(p.walk.seconds)} walking · ${walkDistance(p.walk.metres)}` : "working out the way…"
            } · ${walkTime(listenS)} listening`}
      </p>

      <ol className="pw-stops">
        {p.stops.map((e, i) => (
          <li key={e.id} className="pw-stop">
            <span className={`pw-n cat-${e.category}`} aria-hidden="true">{i + 1}</span>
            <span className="pw-what">
              <span className={`pw-kind cat-${e.category}`}>{CATEGORY_LABEL[e.category]}</span>
              <span className="pw-title">{e.title}</span>
            </span>
            <button className="pw-x" onClick={() => p.onRemove(e.id)} aria-label={`Take out: ${e.title}`}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </li>
        ))}
      </ol>

      {p.others.length > 0 && (
        <>
          <p className="pw-label">Add one</p>
          <ul className="pw-others">
            {p.others.slice(0, 8).map(({ echo: e, distanceKm }) => (
              <li key={e.id}>
                <button className="pw-add" onClick={() => p.onAdd(e.id)} aria-label={`Add: ${e.title}`}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 6v12M6 12h12" />
                  </svg>
                  <span className="pw-title">{e.title}</span>
                  <span className="pw-far">{walkDistance(distanceKm * 1000)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="pw-acts">
        <button className="pw-go" onClick={p.onStart} disabled={p.stops.length === 0}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
          Start the walk
        </button>
      </div>
    </div>
  );
}
