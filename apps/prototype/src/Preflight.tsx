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
 *
 * **Unless they have been here before.** Once the collection persists, opening on "download
 * your journey before you go" is answering a question the returning listener settled weeks
 * ago, while their forty echoes sit invisible behind the panel. So there are two front
 * doors. A first-time listener is being asked where they are going; a returning one is
 * being shown what they have and offered the way back to it. Same screen, same panel, and
 * the route picker is one tap away in both — it is the *order* that changes, because what
 * somebody most likely wants is different on the first visit and the fortieth.
 */

import { useEffect, useState } from "react";
import type { Route } from "@echofinders/core";

export interface PreflightProps {
  readonly routes: readonly Route[];
  readonly counts: Readonly<Record<string, number>>;
  /** Whatever the app is already showing, so "Find my route" does not move you somewhere else. */
  readonly current: Route;
  readonly onStart: (route: Route) => void;
  /** How many echoes are already collected. Zero is a first-time listener. */
  readonly foundCount: number;
  /** The last few places they stood, most recent first. Shown, not counted. */
  readonly recentPlaces: readonly string[];
}

export function Preflight({
  routes,
  counts,
  current,
  onStart,
  foundCount,
  recentPlaces,
}: PreflightProps) {
  const [picked, setPicked] = useState<Route>(current);
  const total = counts[picked.id] ?? 0;
  const returning = foundCount > 0;
  /**
   * Whether the listener asked to see the route picker — not whether it is shown.
   *
   * Derived rather than initialised, because the collection arrives from disk a beat after
   * the first render: seeding state from `foundCount` captured the zero that was true only
   * while the read was in flight, and the returning listener got the heading without the
   * layout that goes with it. Keeping the *question* in state and computing the answer also
   * means deleting a collection puts the picker back with nothing to remember to reset.
   */
  const [askedToChoose, setAskedToChoose] = useState(false);
  const choosing = askedToChoose || !returning;

  // `current` seeds the choice, and then keeps seeding it. The mode picker sits beside the
  // phone and is live while this is showing, so switching to Car there used to leave this
  // panel still offering the walk — and "Find my route" would put you straight back on it.
  useEffect(() => setPicked(current), [current]);

  return (
    <div className="preflight">
      <div className="pf-body">
        {returning ? (
          <>
            <span className="pf-kicker">Welcome back</span>
            <h2>
              {foundCount} {foundCount === 1 ? "echo" : "echoes"} found
            </h2>
            {/* Their own places, in their own words. A number is a score; a list of
                streets somebody actually stood in is a memory, and that is the thing the
                collection is for. */}
            {recentPlaces.length > 0 && (
              <p className="pf-recent">
                {recentPlaces.slice(0, 3).join(" · ")}
                {foundCount > 3 && " · …"}
              </p>
            )}
          </>
        ) : (
          <>
            <h2>Download your journey before you go</h2>
            <p>
              Pick where you are going, choose the stories you want, and Echo Finders runs in
              airplane mode the whole way.
            </p>
          </>
        )}

        <div className="pf-field">
          <span className="pf-code">{code(picked)}</span>
          <span className="pf-sub">
            {picked.name ?? picked.id} · {total} {total === 1 ? "echo" : "echoes"}
          </span>
        </div>

        {choosing && (
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
        )}

        <button className="pf-go" onClick={() => onStart(picked)}>
          {returning && !choosing ? "Carry on" : "Find my route"}
        </button>

        {/* Offered rather than imposed. A returning listener usually wants the journey they
            were on, and the ones who do not are one tap from every other. */}
        {returning && !choosing && (
          <button className="pf-alt" onClick={() => setAskedToChoose(true)}>
            Start somewhere else
          </button>
        )}
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
