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
import { NowPlaying } from "./NowPlaying";
import { findEchoesAlongRoute, presetFor, type Route } from "@echofinders/core";

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
  const [sound, setSound] = useState(true);
  const [narrate, setNarrate] = useState(true);
  const [paused, setPaused] = useState(false);
  const { state, session, walk } = useJourney(route, LIBRARY, { sound, narrate, paused });

  // Whether the traveller can steer. Guidance answers "which way should I go", so it is
  // shown to a walker and to a car's navigator, and withheld from anyone being carried —
  // nobody diverts an aircraft towards a good story.
  const selfDirected = presetFor(route.mode).selfDirected;
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  const togglePause = () => setPaused(!paused);

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
        <div className={selfDirected ? "screen" : "screen stack-noguide"}>
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
              {selfDirected && <ProximityBar guidance={state.guidance} cue={state.cue} />}
              <NowPlaying
                state={state.playback}
                waiting={state.waiting}
                deferred={state.deferred}
                onPause={() => session.pause()}
                onResume={() => session.resume()}
                onSkip={() => session.skip()}
              />
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
          seconds; when it closes, the echo opens.
        </p>
        {selfDirected ? (
          <p>
            <b>Turn your sound on.</b> As you close on a sealed echo you will hear it — a
            note followed by quieter repeats of itself, slow and spread out when you are far
            away, tightening as you approach, and at the moment of arrival a single clean
            note with no reflection at all, because you are standing at the source. The bar
            above the sheet is the same cue rendered as the haptic you would feel through a
            pocket. One proximity model, two ways of expressing it.
          </p>
        ) : (
          <p>
            No guidance bar and no sound here, which is the point. Guidance answers{" "}
            <i>which way should I go</i>, and a passenger cannot divert an aircraft towards a
            good story. The engine still computes proximity — the map wants it — it simply
            stops telling your body about it. A car gets the full cue, because a navigator
            can say "turn left here".
          </p>
        )}
        <p>
          <b>It talks.</b> Nothing has been through ElevenLabs yet, so the narration is your
          browser reading the actual script aloud. It is flat and its timing is not the real
          timing — but the words are the real words, which is the only way to judge writing
          that is heard rather than read. When the real renders land, this file is replaced
          by twenty lines around an <code>&lt;audio&gt;</code> element and nothing else
          changes.
        </p>
        <p>
          Two echoes capturing at once is the normal case, not the edge one — the stops on
          this route exist so a listener can collect both the King George statue and the
          Charging Bull at Bowling Green. One plays, the other waits, and neither talks over
          the other. Walk far enough while something waits and it gives up: capturing and
          hearing are different things, and nothing is lost, because it is in the collection.
        </p>
        <p className="dim">
          No basemap: tile providers are unreachable from this environment, and the pin
          states are the point. A real map slots in underneath unchanged.
        </p>
        <div className="controls">
          <button onClick={togglePause}>{paused ? "Resume" : "Pause"}</button>
          <button onClick={() => walk.seekTo(0)}>Back to start</button>
          {selfDirected && (
            <button onClick={() => setSound(!sound)}>{sound ? "Cue on" : "Cue off"}</button>
          )}
          <button onClick={() => setNarrate(!narrate)}>
            {narrate ? "Narration on" : "Narration off"}
          </button>
        </div>
        <p className="mono dim">
          {walkedPercent}% along · {kept.length} found · {inCorridor} on this route ·{" "}
          {LIBRARY.length} in the library
        </p>
      </aside>
    </div>
  );
}
