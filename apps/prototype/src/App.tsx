import { useCallback, useMemo, useState } from "react";
import { PRIVACY_DEFAULTS, holdsPersonalLocation, type PrivacySettings } from "@echofinders/core";
import { LIBRARY, ROUTES } from "./library.generated";
import { useJourney } from "./use-journey";
import { ModePicker } from "./ModePicker";
import { RouteMap, type PinState } from "./RouteMap";
import { ProximityBar } from "./ProximityBar";
import { Sheet } from "./Sheet";
import { Collection } from "./Collection";
import { Privacy } from "./Privacy";
import { Nav, type Tab } from "./Nav";
import { findEchoesAlongRoute, type Route } from "@echofinders/core";

/** The walk is the richest route, so it is what the prototype opens on. */
const DEFAULT_ROUTE = ROUTES.find((r) => r.id === "lower-manhattan-walk") ?? ROUTES[0]!;

const MODE_LABEL: Record<string, string> = {
  flight: "in the air",
  driving: "driving",
  walking: "walking",
  rail: "on the train",
  cycling: "cycling",
};

export function App() {
  const [route, setRoute] = useState<Route>(DEFAULT_ROUTE);
  const { state, session, walk } = useJourney(route, LIBRARY);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [tab, setTab] = useState<Tab>("map");
  const [privacy, setPrivacy] = useState<PrivacySettings>(PRIVACY_DEFAULTS);
  const [deleted, setDeleted] = useState<Set<string>>(new Set());

  // What the collection would actually hold, given the privacy settings and any deletion.
  const kept = useMemo(
    () => (privacy.keepCollection ? state.captured.filter((c) => !deleted.has(c.echo.id)) : []),
    [state.captured, privacy.keepCollection, deleted],
  );

  const storedPositions = useMemo(
    () =>
      privacy.recordPrecisePlaces
        ? kept.filter((c) => holdsPersonalLocation(c.record)).length
        : 0,
    [kept, privacy.recordPrecisePlaces],
  );

  const onDelete = (what: "positions" | "everything") => {
    if (what === "everything") {
      setDeleted(new Set(state.captured.map((c) => c.echo.id)));
    } else {
      // Deleting positions is what turning the setting off does, so it is the same action.
      setPrivacy({ ...privacy, recordPrecisePlaces: false });
    }
  };

  const stateOf = useCallback(
    (echoId: string): PinState => {
      if (state.opening.some((a) => a.echo.id === echoId)) return "opening";
      const s = session.tracker.stateOf(echoId);
      return s === "sealed" ? "sealed" : s === "heard" ? "heard" : "captured";
    },
    // `state` is included so the map redraws as captures land, even though it is not read
    // directly — the tracker it queries is mutable.
    [session, state],
  );

  const togglePause = () => {
    walk.setPaused(!paused);
    setPaused(!paused);
  };

  // Switching journeys starts a new session with its own captures, so anything pinned to
  // the old one has to go with it.
  const onSelectRoute = (next: Route) => {
    if (next.id === route.id) return;
    setRoute(next);
    setSelectedId(null);
    setDeleted(new Set());
    setPaused(false);
  };

  const walkedPercent = Math.round((walk.walkedMetres / walk.totalMetres) * 100);

  // How much of the library this route actually passes. Worth showing: it is the clearest
  // statement that content is filed by place, not by journey, and that a route is a query
  // over the library rather than a list someone assembled.
  // The echoes this route actually passes.
  //
  // The map has to be given these rather than the whole library, or its bounds are the
  // bounds of every echo that exists: with content on three routes across a thousand
  // miles, a hundred-mile drive through North Carolina collapses to a point and its route
  // line disappears entirely. The engine already filters by corridor — the view should ask
  // it the same question rather than drawing everything.
  const byRoute = useMemo(
    () =>
      Object.fromEntries(
        ROUTES.map((r) => [r.id, findEchoesAlongRoute(r, LIBRARY).map((hit) => hit.echo)]),
      ),
    [],
  );
  const corridorCounts = useMemo(
    () => Object.fromEntries(Object.entries(byRoute).map(([id, echoes]) => [id, echoes.length])),
    [byRoute],
  );
  const onRoute = byRoute[route.id] ?? [];
  const inCorridor = onRoute.length;

  return (
    <div className="stage">
      <div className="phone">
        <div className="screen">
          <div className="statusbar">
            <span className="mono">10:42</span>
            <span className="mono dim">{MODE_LABEL[route.mode] ?? route.mode}</span>
          </div>

          {tab === "map" && (
            <>
              <RouteMap
                route={route}
                library={onRoute}
                position={state.position}
                opening={state.opening}
                stateOf={stateOf}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
              <ProximityBar guidance={state.guidance} cue={state.cue} />
              <Sheet
                nearby={state.nearby}
                lastCapture={state.lastCapture}
                captured={kept}
                stateOf={stateOf}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </>
          )}

          {tab === "collection" && (
            <Collection captured={kept} privacy={privacy} total={inCorridor} />
          )}

          {tab === "privacy" && (
            <Privacy
              settings={privacy}
              onChange={setPrivacy}
              storedPositions={storedPositions}
              collectionSize={kept.length}
              onDelete={onDelete}
            />
          )}

          <Nav tab={tab} onChange={setTab} foundCount={kept.length} />
          <div className="homebar" />
        </div>
      </div>

      <aside className="notes">
        <b>ECHO FINDERS</b>
        <ModePicker
          routes={ROUTES}
          selected={route}
          onSelect={onSelectRoute}
          counts={corridorCounts}
        />
        <p className="routename">{route.name ?? route.id}</p>
        <p>
          Everything you see is driven by <code>WalkSession</code> from{" "}
          <code>@echofinders/core</code>, the same code an iOS build would run. Only the GPS
          chip is faked, and position comes from <code>RouteProfile</code> — so the traveller
          idles before setting off, slows on arrival, and actually stands still at the stops
          the route declares.
        </p>
        <p>
          Switching mode changes nothing about the code path. It swaps one row of{" "}
          <code>MODE_PRESETS</code> for another: corridor width, timing tolerance,
          talk-to-silence ratio, position source and package budget. A flight looks eighty
          kilometres either side of the track and will play an echo ten minutes from its
          place; on foot that is three hundred metres and ninety seconds.
        </p>
        <p>
          Echoes are sealed until you arrive. Step inside one and the ring fills over twelve
          seconds; when it closes, the echo opens. The bar above the sheet is the haptic made
          visible — on a phone this is a vibration you feel through a pocket.
        </p>
        <p className="dim">
          No basemap: tile providers are unreachable from this environment, and the pin
          states are the point. A real map slots in underneath unchanged.
        </p>
        <div className="controls">
          <button onClick={togglePause}>{paused ? "Resume" : "Pause"}</button>
          <button onClick={() => walk.seekTo(0)}>Back to start</button>
        </div>
        <p className="mono dim">
          {walkedPercent}% along · {kept.length} found · {inCorridor} on this route ·{" "}
          {LIBRARY.length} in the library
        </p>
      </aside>
    </div>
  );
}
