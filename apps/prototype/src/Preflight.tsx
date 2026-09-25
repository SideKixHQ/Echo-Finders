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

import { useEffect, useMemo, useState } from "react";
import { buildEchoJourney, type Echo, type Route } from "@echofinders/core";
import { lookupFlight } from "./flights";
import { MODE_ICON } from "./travel";

export interface PreflightProps {
  readonly routes: readonly Route[];
  readonly counts: Readonly<Record<string, number>>;
  /** Needed to say how big the journey is, which is the one thing this screen promises. */
  readonly library: readonly Echo[];
  /** Whatever the app is already showing, so "Find my route" does not move you somewhere else. */
  readonly current: Route;
  readonly onStart: (route: Route) => void;
  /** Open the list of what this journey passes, to pick what plays itself. */
  readonly onChoose: () => void;
  /** How many echoes are already collected. Zero is a first-time listener. */
  readonly foundCount: number;
  /** The last few places they stood, most recent first. Shown, not counted. */
  readonly recentPlaces: readonly string[];
  /**
   * How you are travelling, and how to change it.
   *
   * This screen could pick a *route* and not a mode, which meant the answer to "how do I
   * switch to flying" was "reinstall the app": the choice was made once during onboarding,
   * on a screen that says "you can switch later", and then never offered again. It is a
   * journey screen, so the journey is all of it.
   */
  readonly travel: "walking" | "driving" | "flight";
  readonly onTravel: (travel: "walking" | "driving" | "flight") => void;
  /** Free roam: no route, just what is around you. Only meaningful on foot and driving. */
  readonly roaming: boolean;
  readonly onRoam: (roaming: boolean) => void;
}

export function Preflight({
  routes,
  counts,
  library,
  current,
  onStart,
  onChoose,
  foundCount,
  recentPlaces,
  travel,
  onTravel,
  roaming,
  onRoam,
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
  /** What they typed into the flight box, and what it resolved to. */
  const [flight, setFlight] = useState("");
  const flightRoute = useMemo(() => {
    const id = lookupFlight(flight);
    return id ? routes.find((r) => r.id === id) : undefined;
  }, [flight, routes]);

  /** The journeys worth offering for the way they are travelling. */
  const forTravel = useMemo(
    () => routes.filter((route) => route.mode === (travel === "flight" ? "flight" : travel)),
    [routes, travel],
  );

  /*
   * The real package for the route in front of you, against the real budget for its mode —
   * sixty megabytes on foot, two hundred and fifty in the air. Rebuilt only when the
   * choice changes, because it runs the corridor query and the coverage passes.
   */
  const journey = useMemo(() => buildEchoJourney(picked, library), [picked, library]);

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
              {foundCount} {foundCount === 1 ? "echo" : "echoes"} synced
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
              Pick where you are going, choose the echoes you want, and Echo Finders runs in
              airplane mode the whole way.
            </p>
          </>
        )}

        {/*
          How you are travelling.

          The first question, above the journey, because it decides what a journey even is:
          flying means a flight number and a fixed route, driving means a road or no road at
          all, and on foot there is usually nothing to pick. It was asked once in onboarding,
          on a screen that promises "you can switch later", and then never again.
        */}
        <div className="pf-travel">
          {(["walking", "driving", "flight"] as const).map((mode) => (
            <button
              key={mode}
              className={travel === mode ? "pf-travel-pick on" : "pf-travel-pick"}
              onClick={() => onTravel(mode)}
              aria-pressed={travel === mode}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {MODE_ICON[mode === "flight" ? "flight" : mode]}
              </svg>
              {TRAVEL_LABEL[mode]}
            </button>
          ))}
        </div>

        {/*
          The flight number, where somebody flying actually starts.

          It existed in onboarding and nowhere else, so the one input the whole flight
          product turns on was reachable exactly once. It resolves against the same stub the
          onboarding uses, so both doors behave identically.
        */}
        {travel === "flight" && (
          <div className="pf-flight">
            <input
              className="onb-field"
              value={flight}
              onChange={(e) => {
                setFlight(e.target.value);
                const id = lookupFlight(e.target.value);
                const found = id ? routes.find((r) => r.id === id) : undefined;
                if (found) {
                  setPicked(found);
                  onRoam(false);
                }
              }}
              placeholder="Flight number, e.g. DL 411"
              autoComplete="off"
              spellCheck={false}
              aria-label="Flight number"
            />
            {flight.trim().length > 2 && !flightRoute && (
              <p className="pf-note">
                No route for that one yet. We only have content for a few flights while the
                library is being written.
              </p>
            )}
          </div>
        )}

        {/*
          Free roam, where it means anything. A flight is somebody else's route and the door
          is locked, so there is nothing to roam.
        */}
        {travel !== "flight" && (
          <button
            className={roaming ? "pf-pick pf-roam on" : "pf-pick pf-roam"}
            onClick={() => onRoam(true)}
            aria-pressed={roaming}
          >
            {travel === "walking" ? "Around here, no route" : "Just drive, no route"}
          </button>
        )}

        <div className="pf-field">
          <span className="pf-code">{code(picked)}</span>
          <span className="pf-sub">
            {picked.name ?? picked.id} · {total} {total === 1 ? "echo" : "echoes"}
          </span>
        </div>

        {/*
          What you are actually carrying.
          
          The heading on this screen has said "download your journey before you go" since
          the first version and the screen has never once mentioned a package: no size, no
          count, nothing about the budget. It asked which route and called that a download.
          The engine has built the real thing all along — `buildEchoJourney` selects against
          the mode's own byte budget and reports what it could not fit — so the number is
          measured rather than claimed.

          "Already on this device" is the truthful version of the tick on the rail: the
          prototype ships its library inside the bundle, so by the time you can read this
          the journey genuinely is local. When the audio is real files in a bucket, this
          line becomes a progress bar and nothing above it changes.
        */}
        <div className="pf-pkg">
          <span className="pf-pkg-bar">
            <i style={{ width: `${Math.min(100, (journey.totalBytes / journey.budgetBytes) * 100).toFixed(1)}%` }} />
          </span>
          <span className="pf-pkg-text">
            {journey.echoes.length} {journey.echoes.length === 1 ? "echo" : "echoes"} ·{" "}
            {megabytes(journey.totalBytes)} of {megabytes(journey.budgetBytes)} · already on
            this device
          </span>
          {journey.droppedCount > 0 && (
            <span className="pf-pkg-drop">
              {journey.droppedCount} more on this route than the offline budget holds
            </span>
          )}
        </div>

        {choosing && forTravel.length > 0 && (
          <div className="pf-picks">
            {forTravel.map((route) => (
              <button
                key={route.id}
                className={route.id === picked.id && !roaming ? "pf-pick on" : "pf-pick"}
                aria-pressed={route.id === picked.id && !roaming}
                onClick={() => {
                  setPicked(route);
                  onRoam(false);
                }}
              >
                {code(route)}
              </button>
            ))}
          </div>
        )}

        {/* Where "Listening" went. It is a decision about this journey, so it lives on the
            screen where the journey is being decided. */}
        <button className="pf-alt" onClick={onChoose}>
          Choose what plays itself ({journey.echoes.length} on this route)
        </button>

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
const TRAVEL_LABEL = {
  walking: "On foot",
  driving: "Driving",
  flight: "Flying",
} as const;

const megabytes = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

function code(route: Route): string {
  const a = route.origin.code;
  const b = route.destination.code;
  if (a && b) return `${a} → ${b}`;
  const short = (name: string) => name.split(",")[0]!;
  return `${short(route.origin.name)} → ${short(route.destination.name)}`;
}
