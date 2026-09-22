import { useCallback, useMemo, useState } from "react";
import { PRIVACY_DEFAULTS, holdsPersonalLocation, type PrivacySettings } from "@echofinders/core";
import { LIBRARY, ROUTES } from "./library.generated";
import { useJourney, LISTENER } from "./use-journey";
import { ModePicker } from "./ModePicker";
import { RouteMap, type PinState } from "./RouteMap";
import { ProximityBar } from "./ProximityBar";
import { Sheet } from "./Sheet";
import { Collection } from "./Collection";
import { Privacy } from "./Privacy";
import { Nav, type Tab } from "./Nav";
import { NowPlaying } from "./NowPlaying";
import { findEchoesAlongRoute, presetFor, upcomingOnRoute, type Route } from "@echofinders/core";

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
  const [privacy, setPrivacy] = useState<PrivacySettings>(PRIVACY_DEFAULTS);
  // The listener's own setting drives it, not a constant. `handsFree` is off by default
  // (PRIVACY_DEFAULTS), so an echo collects itself on arrival and then waits to be played.
  const { state, session, walk } = useJourney(route, LIBRARY, {
    sound,
    narrate,
    handsFree: privacy.handsFree,
    paused,
  });

  // Whether the traveller can steer. Guidance answers "which way should I go", so it is
  // shown to a walker and to a car's navigator, and withheld from anyone being carried —
  // nobody diverts an aircraft towards a good story.
  const selfDirected = presetFor(route.mode).selfDirected;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("map");
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

  // Recomputed as the listener moves, from how far along they are rather than from the
  // clock: a journey that paused still knows where it is, and asking the clock would offer
  // things already behind them.
  const upcoming = useMemo(
    () =>
      upcomingOnRoute(
        route,
        onRoute,
        // Anything already found is not a suggestion. Reusing `heardEchoIds` rather than
        // adding an exclusion list keeps one mechanism for "do not offer me this again" —
        // and without it the thing currently playing turns up under "coming up".
        { ...LISTENER, heardEchoIds: kept.map((c) => c.echo.id) },
        walk.walkedMetres / 1000,
        { limit: 2 },
      ),
    // `walk.walkedMetres` is read off a mutable simulation, so the position event is what
    // says it changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [route, onRoute, state.position, kept],
  );
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
                onPlay={(echo) => session.play(echo)}
                isPlaying={(id) =>
                  state.playback.kind !== "idle" && state.playback.item.echo.id === id
                }
                onPause={() => session.pause()}
                onResume={() => session.resume()}
                paused={state.playback.kind === "paused"}
                upcoming={upcoming}
                selfDirected={selfDirected}
                handsFree={privacy.handsFree}
              />
            </>
          )}

          {tab === "collection" && (
            <Collection
              captured={kept}
              privacy={privacy}
              total={inCorridor}
              onPlay={(echo) => session.play(echo)}
              isPlaying={(id) =>
                state.playback.kind !== "idle" && state.playback.item.echo.id === id
              }
            />
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
          seconds; when it closes, the echo opens — and then <b>waits</b>. Finding one and
          hearing it are separate acts: arriving collects it, pressing play is a decision.
          Starting narration unasked talks over a conversation, a podcast, or somebody
          standing in a memorial. <b>Hands-free</b> in Privacy is how a listener asks for
          the opposite; it is off by default.
        </p>
        <p>
          <b>Coming up</b> is the other half of that. Nothing is forced, but on a route the
          engine knows what is ahead and when — which matters most in the air, where you
          cannot go to an echo and choosing what to hear before it goes past is the whole
          interaction.
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
