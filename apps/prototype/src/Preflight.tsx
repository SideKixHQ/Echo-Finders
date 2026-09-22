/**
 * Before you go.
 *
 * The design opens on this, and it is the right thing to open on: the whole product depends
 * on having the journey *before* the journey starts. An aircraft has no signal, a walking
 * route in a foreign city has no data plan worth using, and a package that downloads at the
 * gate is the difference between working and not (ADR-0003).
 *
 * So this screen asks for one thing — which journey — and everything else follows from it.
 * The quick-picks are how somebody actually arrives here: they are not browsing a catalogue
 * of routes, they have a flight number on a boarding pass or they are standing at the start
 * of a walk, and the list should meet them where they are rather than making them search.
 */

import { useEffect, useState } from "react";
import type { Route } from "@echofinders/core";

export interface PreflightProps {
  readonly routes: readonly Route[];
  readonly counts: Readonly<Record<string, number>>;
  /** Whatever the app is already showing, so "Find my route" does not move you somewhere else. */
  readonly current: Route;
  readonly onStart: (route: Route) => void;
}

export function Preflight({ routes, counts, current, onStart }: PreflightProps) {
  const [picked, setPicked] = useState<Route>(current);
  const total = counts[picked.id] ?? 0;

  // `current` seeds the choice, and then keeps seeding it. The mode picker sits beside the
  // phone and is live while this is showing, so switching to Car there used to leave this
  // panel still offering the walk — and "Find my route" would put you straight back on it.
  useEffect(() => setPicked(current), [current]);

  return (
    <div className="preflight">
      <div className="pf-body">
        <h2>Download your journey before you go</h2>
        <p>
          Pick where you are going, choose the stories you want, and Echo Finders runs in
          airplane mode the whole way.
        </p>

        <div className="pf-field">
          <span className="pf-code">{code(picked)}</span>
          <span className="pf-sub">
            {picked.name ?? picked.id} · {total} {total === 1 ? "echo" : "echoes"}
          </span>
        </div>

        <div className="pf-picks">
          {routes.map((route) => (
            <button
              key={route.id}
              className={route.id === picked.id ? "pf-pick on" : "pf-pick"}
              onClick={() => setPicked(route)}
            >
              {code(route)}
            </button>
          ))}
        </div>

        <button className="pf-go" onClick={() => onStart(picked)}>
          Find my route
        </button>
      </div>
    </div>
  );
}

/**
 * The shortest thing that identifies a journey to the person taking it.
 *
 * A flight is its two airport codes, because that is what is printed on the boarding pass.
 * A walk has no code and never will, so it is the two ends — which is longer, and correct:
 * nobody has ever called a walk by an abbreviation.
 */
function code(route: Route): string {
  const a = route.origin.code;
  const b = route.destination.code;
  if (a && b) return `${a} → ${b}`;
  const short = (name: string) => name.split(",")[0]!.split(" — ")[0]!;
  return `${short(route.origin.name)} → ${short(route.destination.name)}`;
}
