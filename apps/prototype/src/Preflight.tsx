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
import { MODE_ICON } from "./travel";
import { AIRPORTS, searchAirports, type Airport } from "./airports";
import { buildFlight } from "./build-flight";

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
  /**
   * Leave without changing anything.
   *
   * There was no way out at all: the only exits committed you to a journey, so opening this
   * to look at it meant agreeing to something. A panel that can only be left by saying yes
   * is a trap, however good the yes is.
   */
  readonly onClose: () => void;
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
  onClose,
  foundCount,
  recentPlaces,
  travel,
  onTravel,
  roaming,
  onRoam,
}: PreflightProps) {
  const [picked, setPicked] = useState<Route>(current);
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
  /** The two ends of a flight, which is all a flight is to this app. */
  const [from, setFrom] = useState<Airport | null>(null);
  const [to, setTo] = useState<Airport | null>(null);

  /**
   * The route for a pair: the one we wrote if we wrote one, otherwise a drawn great circle.
   *
   * A written route carries the actual track, and on a coastal corridor that is the whole
   * difference between finding the echoes and threading between them.
   */
  const routeFor = (a: Airport, b: Airport): Route =>
    routes.find(
      (route) =>
        route.mode === "flight" &&
        route.origin.code === a.code &&
        route.destination.code === b.code,
    ) ?? buildFlight(a, b);

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
  const journeyCount = journey.echoes.length;
  /*
   * Flying, with the pair not yet chosen.
   *
   * `picked` is still whatever you were on before, so without this the panel announced a
   * walk through Lower Manhattan under a lit Flying button: the same contradiction roaming
   * had, where the one line that says what you chose disagrees with the choice.
   */
  const awaitingPair = travel === "flight" && (!from || !to || from.code === to.code);
  /*
   * How many echoes this journey passes.
   *
   * `counts` is precomputed for the routes we ship, and an airport pair somebody just typed
   * is not one of them, so the fallback is the package's own count. Same query either way,
   * `findEchoesAlongRoute` through `buildEchoJourney`; the precomputed one is only there to
   * avoid running it for every route in a list.
   */
  const total = counts[picked.id] ?? journeyCount;


  // `current` seeds the choice, and then keeps seeding it. The mode picker sits beside the
  // phone and is live while this is showing, so switching to Car there used to leave this
  // panel still offering the walk — and "Find my route" would put you straight back on it.
  useEffect(() => setPicked(current), [current]);

  return (
    <div className="preflight">
      <div className="pf-body">
        <button className="pf-close" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

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
          Where you are flying, asked as two airports rather than as a flight number.

          The flight number was never the thing we needed: `buildRouteGeometry` takes two
          waypoints and draws the great circle itself, so origin and destination is a
          complete answer, and a flight-data subscription is an expensive way of turning one
          question into another. It also asks a harder question than ours. The unit of this
          product is the city pair: everybody on the New York to Miami corridor gets the same
          echoes over the same stretch of coast, whatever is printed on their boarding pass.

          It works offline, which is the entire point, because the place somebody enters
          their flight is a seat with the wifi off.
        */}
        {travel === "flight" && (
          <div className="pf-flight">
            {/*
              A route is only built once both ends exist. `buildFlight(a, a)` is a journey of
              zero length, and the geometry refuses to build one, which is correct of it and
              crashed the screen the moment somebody picked a departure airport.

              And a curated route wins over a drawn one, which is the thing testing this
              taught me. I had assumed a great circle was close enough to a filed track to
              not matter. On this corridor it is not: the real New York to Miami routing
              follows the coast, and the straight line threads between Cape Hatteras and
              Savannah, missing both by more than the corridor is wide. Five echoes became
              two. So when a pair matches a route we have written, we fly the written one,
              with its real waypoints; the drawn great circle is the fallback for everywhere
              else.
            */}
            <AirportField
              label="From"
              value={from}
              onPick={(airport) => {
                setFrom(airport);
                if (to && to.code !== airport.code) setPicked(routeFor(airport, to));
                onRoam(false);
              }}
            />
            <AirportField
              label="To"
              value={to}
              onPick={(airport) => {
                setTo(airport);
                if (from && from.code !== airport.code) setPicked(routeFor(from, airport));
                onRoam(false);
              }}
            />
            {/*
              Honest about coverage, which matters more here than anywhere else in the app.
              Any pair of airports builds a route; only some of them fly over anything we
              have written. Saying "no echoes on that one yet" is better than a screen that
              looks like it worked and then plays nothing for five hours.
            */}
            {from && to && from.code !== to.code && (
              <p className="pf-note">
                {total > 0
                  ? `${total} ${total === 1 ? "echo" : "echoes"} along that route.`
                  : "Nothing written along that route yet. New York to Miami is the one with echoes on it today."}
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

        {/*
          What you are about to do, which is not always a route.

          This showed the selected route unconditionally, so pressing "Around here, no route"
          lit the button and left this panel still announcing a walk through Lower Manhattan.
          The one thing on the screen that says what you have chosen was contradicting the
          choice, which reads exactly like the button not working.
        */}
        <div className="pf-field">
          <span className="pf-code">
            {roaming ? ROAM_CODE[travel] : awaitingPair ? "Where to?" : code(picked)}
          </span>
          <span className="pf-sub">
            {roaming
              ? ROAM_SUB[travel]
              : awaitingPair
                ? "Pick both airports and the route builds itself."
                : `${picked.name ?? picked.id} · ${total} ${total === 1 ? "echo" : "echoes"}`}
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
        {/* A package is a route's worth of echoes. Roaming has no route, so there is nothing
            to weigh and a bar claiming otherwise would be inventing a number. */}
        {!roaming && !awaitingPair && <div className="pf-pkg">
          <span className="pf-pkg-bar">
            <i style={{ width: `${Math.min(100, (journey.totalBytes / journey.budgetBytes) * 100).toFixed(1)}%` }} />
          </span>
          {/*
            What this actually is, rather than what it will be.

            The line said "already on this device" as though a download had happened. It had
            not: the prototype ships its library inside the bundle, so there is nothing to
            fetch and nothing to wait for, and the word download was doing work the app does
            not do. The count and the size are real, measured by `buildEchoJourney` against
            the mode's own budget. When the audio is real files in a bucket this becomes a
            progress bar and nothing above it changes.
          */}
          <span className="pf-pkg-text">
            {journey.echoes.length} {journey.echoes.length === 1 ? "echo" : "echoes"} ·{" "}
            {megabytes(journey.totalBytes)} of {megabytes(journey.budgetBytes)} · ships
            inside the app for now, so there is nothing to download yet
          </span>
          {journey.droppedCount > 0 && (
            <span className="pf-pkg-drop">
              {journey.droppedCount} more on this route than the offline budget holds
            </span>
          )}
        </div>}

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
        {!roaming && !awaitingPair && (
          <button className="pf-alt" onClick={onChoose}>
            Choose what plays itself ({journey.echoes.length} on this route)
          </button>
        )}

        <button className="pf-go" onClick={() => onStart(picked)} disabled={awaitingPair}>
          {roaming
            ? travel === "driving"
              ? "Start driving"
              : "Start looking"
            : returning && !choosing
              ? "Carry on"
              : "Find my route"}
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
/**
 * One end of a flight.
 *
 * A text box that searches as you type and a short list under it, rather than a dropdown of
 * five thousand airports: people know where they are flying and type three letters, and the
 * job of the control is to confirm rather than to browse. Code, city and name all match,
 * because "LHR", "London" and "Heathrow" are one fact to a person.
 */
function AirportField({
  label,
  value,
  onPick,
}: {
  label: string;
  value: Airport | null;
  onPick: (airport: Airport) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const results = useMemo(() => (open ? searchAirports(query) : []), [open, query]);

  return (
    <div className="pf-air">
      <span className="pf-air-label">{label}</span>
      <input
        className="onb-field pf-air-input"
        value={open ? query : value ? `${value.code} · ${value.city}` : ""}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        /* A blur that beats the tap on a result would close the list before the tap lands,
           which is the classic way an autocomplete becomes unusable on a phone. */
        onBlur={() => window.setTimeout(() => setOpen(false), 160)}
        placeholder={`${label === "From" ? "Departure" : "Arrival"} airport or city`}
        autoComplete="off"
        spellCheck={false}
        aria-label={`${label} airport`}
      />
      {open && results.length > 0 && (
        <ul className="pf-air-list">
          {results.map((airport) => (
            <li key={airport.code}>
              <button
                onClick={() => {
                  onPick(airport);
                  setOpen(false);
                }}
              >
                <b>{airport.code}</b>
                <span>
                  {airport.city} · {airport.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query.trim().length > 0 && results.length === 0 && (
        <p className="pf-note">
          Not in the list yet. It holds {AIRPORTS.length} of the busiest; the full set is a
          build step away.
        </p>
      )}
    </div>
  );
}

/** What the journey field says when there is no journey, only a here. */
const ROAM_CODE = {
  walking: "Around here",
  driving: "Wherever you drive",
  flight: "Around here",
} as const;
const ROAM_SUB = {
  walking: "No route. It finds what is near you as you go.",
  driving: "No route. Echoes sync as you drive through them.",
  flight: "No route.",
} as const;

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
