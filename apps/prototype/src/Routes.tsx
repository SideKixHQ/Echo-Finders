/**
 * Routes, under My Echoes: the listener's own walks, kept to start later.
 *
 * James (2026-10-13): "you can see your plan routes? create routes? delete them, start
 * them all from that screen?" Each route is a card with its stops in walking order and how
 * long it takes, and the three things you do with one: start it, change it, delete it.
 * Stops are added from an echo's card on the map ("Add to route"), or here from the saved
 * list while editing.
 */

import { useEffect, useState } from "react";
import { orderStops, type Echo } from "@echofinders/core";
import { CATEGORY_LABEL } from "./categories";
import { walkTime } from "./directions";
import type { SavedRoute } from "./routes-store";

interface Props {
  readonly routes: readonly SavedRoute[];
  readonly echoOf: (id: string) => Echo | undefined;
  /** Synced or heard already: a stop the walk will skip. */
  readonly isDone: (id: string) => boolean;
  /** Saved echoes, offered while editing a route. */
  readonly saved: readonly Echo[];
  /** Why Start cannot work right now, or null when it can. */
  readonly startBlock: string | null;
  readonly onStart: (route: SavedRoute) => void;
  readonly onCreate: () => string;
  readonly onRename: (id: string, name: string) => void;
  readonly onRemoveStop: (id: string, echoId: string) => void;
  readonly onAddStop: (id: string, echoId: string) => void;
  readonly onDelete: (id: string) => void;
  readonly onUndoDelete: () => void;
  /** The route just deleted, while it can still be brought back. */
  readonly deleted: SavedRoute | null;
}

/** Walking and listening time, from the first stop, the way the planner estimates it. */
function timing(stops: readonly Echo[]): string | null {
  if (stops.length === 0) return null;
  const walk = orderStops(
    stops[0]!.point.at,
    stops.map((e) => ({ id: e.id, at: e.point.at, listenS: e.durationS, score: 0.5 })),
  );
  return `about ${walkTime(walk.walkS + walk.listenS)} with listening`;
}

export function Routes(p: Props) {
  const [editing, setEditing] = useState<string | null>(null);

  // The undo offer goes after a few seconds; the route goes with it.
  const { deleted, onUndoDelete } = p;
  const [undoVisible, setUndoVisible] = useState(false);
  useEffect(() => {
    if (!deleted) return;
    setUndoVisible(true);
    const t = setTimeout(() => setUndoVisible(false), 6000);
    return () => clearTimeout(t);
  }, [deleted]);

  const create = () => setEditing(p.onCreate());

  return (
    <div className="routes">
      {p.routes.length === 0 ? (
        <div className="empty routes-empty">
          <b>No routes yet</b>
          <span>
            Tap an echo on the map and choose Add to route, or make one here and add your saved echoes to
            it.
          </span>
        </div>
      ) : (
        p.routes.map((r) => {
          const stops = r.stops.flatMap((id) => p.echoOf(id) ?? []);
          const left = stops.filter((e) => !p.isDone(e.id)).length;
          const time = timing(stops);
          const isEditing = editing === r.id;
          const addable = p.saved.filter((e) => !r.stops.includes(e.id));
          return (
            <article key={r.id} className={isEditing ? "rt editing" : "rt"} aria-label={r.name}>
              {isEditing ? (
                <input
                  className="rt-name-input"
                  defaultValue={r.name}
                  aria-label="Route name"
                  maxLength={40}
                  onBlur={(e) => p.onRename(r.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                />
              ) : (
                <h3 className="rt-name">{r.name}</h3>
              )}
              <p className="rt-meta">
                {stops.length === 0
                  ? "No stops yet"
                  : `${stops.length} ${stops.length === 1 ? "stop" : "stops"}${time ? ` · ${time}` : ""}`}
                {stops.length > 0 && left < stops.length && (
                  <span className="rt-left"> · {left === 0 ? "all heard" : `${left} to go`}</span>
                )}
              </p>

              {stops.length > 0 && (
                <ol className="rt-stops">
                  {stops.map((e, i) => (
                    <li key={e.id} className={p.isDone(e.id) ? "rt-stop done" : "rt-stop"}>
                      <span className={`pw-n cat-${e.category}`} aria-hidden="true">
                        {i + 1}
                      </span>
                      <span className="pw-what">
                        <span className={`pw-kind cat-${e.category}`}>{CATEGORY_LABEL[e.category]}</span>
                        <span className="pw-title">{e.title}</span>
                      </span>
                      {isEditing && (
                        <button
                          className="pw-x"
                          onClick={() => p.onRemoveStop(r.id, e.id)}
                          aria-label={`Take out: ${e.title}`}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M6 6l12 12M18 6L6 18" />
                          </svg>
                        </button>
                      )}
                    </li>
                  ))}
                </ol>
              )}

              {isEditing && addable.length > 0 && (
                <>
                  <p className="pw-label">Add from saved</p>
                  <ul className="pw-others">
                    {addable.map((e) => (
                      <li key={e.id}>
                        <button className="pw-add" onClick={() => p.onAddStop(r.id, e.id)} aria-label={`Add: ${e.title}`}>
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 6v12M6 12h12" />
                          </svg>
                          <span className="pw-title">{e.title}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {isEditing && addable.length === 0 && stops.length === 0 && (
                <p className="rt-hint">Tap an echo on the map and choose Add to route.</p>
              )}

              <div className="rt-acts">
                {isEditing ? (
                  <button className="rt-btn rt-primary" onClick={() => setEditing(null)}>
                    Done
                  </button>
                ) : (
                  <>
                    <button
                      className="rt-btn rt-primary"
                      onClick={() => p.onStart(r)}
                      disabled={left === 0 || p.startBlock !== null}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      Start
                    </button>
                    <button className="rt-btn" onClick={() => setEditing(r.id)}>
                      Edit
                    </button>
                    <button className="rt-btn rt-del" onClick={() => p.onDelete(r.id)} aria-label={`Delete ${r.name}`}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
              {!isEditing && left > 0 && p.startBlock && <p className="rt-hint">{p.startBlock}</p>}
            </article>
          );
        })
      )}

      <button className="rt-new" onClick={create}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 6v12M6 12h12" />
        </svg>
        New route
      </button>

      {deleted && undoVisible && (
        <div className="rt-undo" role="status">
          <span>Deleted {deleted.name}</span>
          <button onClick={onUndoDelete}>Undo</button>
        </div>
      )}
    </div>
  );
}
