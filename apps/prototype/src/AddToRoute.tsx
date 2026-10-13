/**
 * Add to route: which of your routes this echo goes on.
 *
 * Opened from the echo's card. A tick per route, because an echo can sit on more than one
 * (a Saturday walk and a with-the-kids walk can share a stop), and a new route made from
 * here starts with this echo already on it.
 */

import { useState } from "react";
import type { Echo } from "@echofinders/core";
import { nextRouteName, type SavedRoute } from "./routes-store";

interface Props {
  readonly echo: Echo;
  readonly routes: readonly SavedRoute[];
  readonly onToggle: (routeId: string) => void;
  readonly onCreate: (name: string) => void;
  readonly onClose: () => void;
}

export function AddToRoute({ echo, routes, onToggle, onCreate, onClose }: Props) {
  // No routes yet means the only thing to do is make one, so the name box is already open.
  const [naming, setNaming] = useState(routes.length === 0);
  const [name, setName] = useState("");
  const create = () => {
    onCreate(name.trim() || nextRouteName(routes));
    setName("");
    setNaming(false);
  };
  return (
    <div className="atr" role="dialog" aria-label={`Add to route: ${echo.title}`}>
      <div className="atr-head">
        <div className="atr-what">
          <h2>Add to route</h2>
          <p>{echo.title}</p>
        </div>
        <button className="pw-close" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      {routes.length > 0 && (
        <ul className="atr-list">
          {routes.map((r) => {
            const on = r.stops.includes(echo.id);
            return (
              <li key={r.id}>
                <button className={on ? "atr-route on" : "atr-route"} aria-pressed={on} onClick={() => onToggle(r.id)}>
                  <span className="atr-tick" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  </span>
                  <span className="atr-name">{r.name}</span>
                  <span className="atr-n">
                    {r.stops.length} {r.stops.length === 1 ? "stop" : "stops"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {naming ? (
        <form
          className="atr-new-form"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <input
            className="atr-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={nextRouteName(routes)}
            aria-label="Name the new route"
            maxLength={40}
            autoFocus
          />
          <button className="atr-create" type="submit">
            Create
          </button>
        </form>
      ) : (
        <button className="atr-new" onClick={() => setNaming(true)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 6v12M6 12h12" />
          </svg>
          New route
        </button>
      )}

      {routes.length > 0 && (
        <button className="atr-done" onClick={onClose}>
          Done
        </button>
      )}
    </div>
  );
}
