import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Plan } from "./Plan";
import { RouteRibbon } from "./RouteRibbon";
import { CategoryChips } from "./CategoryChips";
import { Arrival } from "./Arrival";
import { Preflight } from "./Preflight";
import { Viewfinder } from "./Viewfinder";
import type { Echo, EchoCategory } from "@echofinders/core";
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
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // Set on the document rather than a wrapper, so the variables cascade to everything
  // including the portal-less fixed elements.
  useEffect(() => {
    document.documentElement.dataset["theme"] = theme;
  }, [theme]);
  // Two questions, two answers. `handsFree` buys background location so echoes open with
  // the screen off; this decides whether they then talk. Somebody can very reasonably want
  // a phone collecting in a pocket while still choosing what they hear.
  const [autoPlay, setAutoPlay] = useState(false);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [cats, setCats] = useState<ReadonlySet<EchoCategory> | null>(null);
  // The journey has not been chosen yet. The design opens here, and so does this: a package
  // that downloads at the gate is the difference between working and not (ADR-0003).
  const [started, setStarted] = useState(false);
  const [simple, setSimple] = useState(false);
  const [rate, setRate] = useState(1);

  /**
   * How far through the current echo we are.
   *
   * Timed from when it started rather than asked of the player, because the browser's
   * speech synthesis cannot be asked — it reports start and end and nothing between. That
   * makes this an estimate, and an honest one: it is exactly right at both ends and drifts
   * in the middle by however much the synthesiser's pace differs from the content file's
   * stated duration. A real render replaces it with the audio element's own currentTime.
   */
  const [progress, setProgress] = useState(0);
  const startedRef = useRef<{ id: string; at: number } | null>(null);
  // The listener's own setting drives it, not a constant. `handsFree` is off by default
  // (PRIVACY_DEFAULTS), so an echo collects itself on arrival and then waits to be played.
  const { state, session, walk } = useJourney(route, LIBRARY, {
    sound,
    narrate,
    autoPlay,
    // Undefined rather than an empty set when nothing has been picked: no choice made means
    // no restriction, while an empty choice means "I chose nothing" and is honoured.
    chosen: chosen.size > 0 ? chosen : undefined,
    paused: paused || !started,
  });

  // Whether the traveller can steer. Guidance answers "which way should I go", so it is
  // shown to a walker and to a car's navigator, and withheld from anyone being carried —
  // nobody diverts an aircraft towards a good story.
  const selfDirected = presetFor(route.mode).selfDirected;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("map");
  /**
   * The echo the camera is pointed at, or null for closed.
   *
   * Held here rather than inside the sheet because the viewfinder covers the whole screen
   * and outlives whatever opened it — an arc tapped inside it can move it to another echo
   * without going back out to the map.
   */
  const [camera, setCamera] = useState<Echo | null>(null);
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
    setCamera(null);
    setDeleted(new Set());
    setPaused(false);
    // A choice belongs to the journey it was made for.
    setChosen(new Set());
    setCats(null);
  };

  const nowPlaying = state.playback.kind === "idle" ? null : state.playback.item.echo;

  useEffect(() => {
    if (!nowPlaying) {
      startedRef.current = null;
      setProgress(0);
      return;
    }
    if (startedRef.current?.id !== nowPlaying.id) {
      startedRef.current = { id: nowPlaying.id, at: Date.now() };
      setProgress(0);
    }
    const durationS = (simple ? nowPlaying.simple?.durationS : null) ?? nowPlaying.durationS;
    const tick = setInterval(() => {
      const started = startedRef.current;
      if (!started) return;
      setProgress(Math.min(1, (Date.now() - started.at) / 1000 / durationS));
    }, 250);
    return () => clearInterval(tick);
  }, [nowPlaying, simple]);

  const walkedPercent = Math.round((walk.walkedMetres / walk.totalMetres) * 100);
  const arrived = walkedPercent >= 99;
  const remainingS = route.durationS * (1 - Math.min(1, walk.walkedMetres / walk.totalMetres));

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
  const savedEchoes = useMemo(() => onRoute.filter((e) => chosen.has(e.id)), [onRoute, chosen]);
  const suggestion = useMemo(
    () => ROUTES.find((r) => r.id !== route.id && (corridorCounts[r.id] ?? 0) > 1) ?? null,
    [route.id, corridorCounts],
  );

  // Only categories this route actually passes get a chip. Offering "Ghosts" on a flight
  // with no ghost stories on it is a promise the library cannot keep.
  const available = useMemo(
    () => new Set(onRoute.map((e) => e.category)),
    [onRoute],
  );
  const activeCats = cats ?? available;

  // Recomputed as the listener moves, from how far along they are rather than from the
  // clock: a journey that paused still knows where it is, and asking the clock would offer
  // things already behind them.
  // Everything on the route, in the order it is reached — the same question `upcoming` asks
  // from where you are, asked from the start line and without a lead-in filter.
  const wholeRoute = useMemo(
    () => upcomingOnRoute(route, onRoute, LISTENER, 0, { limit: 99, minLeadS: -Infinity }),
    [route, onRoute],
  );

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
              <div className="mapbar">
                <RouteRibbon
                  route={route}
                  progress={walk.totalMetres > 0 ? walk.walkedMetres / walk.totalMetres : 0}
                  remainingS={remainingS}
                />
                <CategoryChips
                  available={available}
                  on={activeCats}
                  onToggle={(c) => {
                    const next = new Set(activeCats);
                    if (next.has(c) && next.size > 1) next.delete(c);
                    else next.add(c);
                    setCats(next);
                  }}
                  onAll={() => setCats(null)}
                />
              </div>
              <RouteMap
                route={route}
                library={onRoute.filter((e) => activeCats.has(e.category))}
                position={state.position}
                opening={state.opening}
                stateOf={stateOf}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
              {selfDirected && <ProximityBar guidance={state.guidance} cue={state.cue} />}
              {!nowPlaying && <NowPlaying
                state={state.playback}
                waiting={state.waiting}
                deferred={state.deferred}
                onPause={() => session.pause()}
                onResume={() => session.resume()}
                onSkip={() => session.skip()}
              />}
              <Sheet
                nearby={state.nearby.filter((n) => activeCats.has(n.echo.category))}
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
                autoPlay={autoPlay}
                saved={chosen}
                nowPlaying={nowPlaying}
                progress={progress}
                playing={state.playback.kind === "playing"}
                simple={simple}
                onSimple={setSimple}
                rate={rate}
                onRate={setRate}
                onSeek={(f) => {
                  const d = (simple ? nowPlaying?.simple?.durationS : null) ?? nowPlaying?.durationS ?? 1;
                  startedRef.current = { id: nowPlaying?.id ?? "", at: Date.now() - f * d * 1000 };
                  setProgress(Math.max(0, Math.min(1, f)));
                }}
                onNext={() => session.skip()}
                {...(selfDirected ? { onCamera: setCamera } : {})}
                onSave={(echo) => {
                  const next = new Set(chosen);
                  if (next.has(echo.id)) next.delete(echo.id);
                  else next.add(echo.id);
                  setChosen(next);
                }}
              />
            </>
          )}

          {tab === "plan" && (
            <Plan
              route={route}
              items={wholeRoute}
              chosen={chosen}
              onToggle={(id) => {
                const next = new Set(chosen);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                setChosen(next);
              }}
              onAll={() => setChosen(new Set(wholeRoute.map((i) => i.echo.id)))}
              onNone={() => setChosen(new Set())}
              autoPlay={autoPlay}
              onAutoPlay={setAutoPlay}
              onPlay={(echo) => {
                session.play(echo);
                setTab("map");
              }}
            />
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

          {arrived && tab === "map" && (
            <Arrival
              route={route}
              heard={kept}
              saved={savedEchoes}
              suggestion={suggestion}
              suggestionCount={suggestion ? (corridorCounts[suggestion.id] ?? 0) : 0}
              onSuggestion={(next) => {
                onSelectRoute(next);
                walk.seekTo(0);
              }}
              onAgain={() => walk.seekTo(0)}
            />
          )}

          {/* No fix, no viewfinder. Every line on that screen is about where you are
              standing relative to where a photographer stood, and with no position it
              would have nothing to say but say it confidently. */}
          {camera && state.position && (
            <Viewfinder
              echo={camera}
              at={state.position.at}
              nearby={onRoute.filter((e) => activeCats.has(e.category))}
              onClose={() => setCamera(null)}
              onSelect={setCamera}
            />
          )}

          {!started && (
            <Preflight
              routes={ROUTES}
              counts={corridorCounts}
              current={route}
              onStart={(next) => {
                if (next.id !== route.id) onSelectRoute(next);
                setStarted(true);
              }}
            />
          )}

          <Nav
            tab={tab}
            onChange={setTab}
            foundCount={kept.length}
            chosenCount={chosen.size}
          />
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
          seconds; when it closes, the echo opens, and then it waits. Finding one and hearing
          it are separate acts: arriving collects it, pressing play is a decision. Starting
          narration unasked talks over a conversation, a podcast, or somebody standing in a
          memorial.
        </p>
        <p>
          Which is what <b>Plan</b> is for. Sit down before you set off, look at everything
          the route passes, pick a few, and switch on "play these as I reach them". Auto-play
          without that step is an imposition — twelve echoes is forty minutes of narration,
          and handing somebody all of it because they once tapped a switch is how a product
          becomes something people turn off. Choosing first makes the same switch an
          agreement about a known quantity, which is why the running total is at the top.
        </p>
        <p>
          Nothing ever interrupts: the next starts only when the last has finished. Echoes
          you did not pick still open and still join your collection — they simply do not
          talk. And <b>Coming up</b> on the map offers the next couple with their lead times,
          which matters most in the air, where you cannot go to an echo and choosing what to
          hear before it goes past is the whole interaction.
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
          <button
            onClick={() => {
              walk.seekTo(0);
              setStarted(false);
            }}
          >
            Back to start
          </button>
          <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
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
