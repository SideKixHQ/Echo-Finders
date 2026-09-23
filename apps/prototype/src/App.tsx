import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PRIVACY_DEFAULTS, holdsPersonalLocation, type PrivacySettings } from "@echofinders/core";
import { LIBRARY, ROUTES } from "./library.generated";
import { useJourney, listenerFor } from "./use-journey";
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
import { Rail } from "./Rail";
import { MODE_PHRASE } from "./travel";
import type { Detent } from "./Sheet";
import type { Echo, EchoCategory } from "@echofinders/core";
import {
  checkEligibility,
  distanceKm,
  findEchoesAlongRoute,
  presetFor,
  upcomingOnRoute,
  type Route,
} from "@echofinders/core";

/** The walk is the richest route, so it is what the prototype opens on. */
const DEFAULT_ROUTE = ROUTES.find((r) => r.id === "lower-manhattan-walk") ?? ROUTES[0]!;

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
  /**
   * Kids mode, for the whole app rather than for a list.
   *
   * An age handed to the engine, not a filter over a view — see `listenerFor`. It also
   * turns on the plain-language cut, because the two go together: a listener the library
   * considers eight is a listener who wants the shorter telling, and making them find a
   * second switch for it would be a strange thing to ask of a parent.
   */
  const [kids, setKids] = useState(false);
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
  /**
   * The same number, readable without re-running the effect that owns the clock.
   *
   * The pause rebase below needs to know where the bar had got to, and depending on
   * `progress` would restart the interval four times a second.
   */
  const progressRef = useRef(0);
  const setPlayhead = useCallback((fraction: number) => {
    progressRef.current = fraction;
    setProgress(fraction);
  }, []);
  // The listener's own setting drives it, not a constant. `handsFree` is off by default
  // (PRIVACY_DEFAULTS), so an echo collects itself on arrival and then waits to be played.
  const { state, session, walk, store } = useJourney(route, LIBRARY, {
    sound,
    narrate,
    autoPlay,
    // Undefined rather than an empty set when nothing has been picked: no choice made means
    // no restriction, while an empty choice means "I chose nothing" and is honoured.
    chosen: chosen.size > 0 ? chosen : undefined,
    paused: paused || !started,
    rate,
    privacy,
    kids,
    simple,
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
  /**
   * How much of the screen the sheet takes.
   *
   * Lifted out of the sheet because the map needs it: with a follow-the-listener view, the
   * listener belongs in the middle of the band that is *visible*, and how much of the
   * screen the sheet is covering is exactly what decides where that is. Owned by the sheet,
   * a peek would slide the map's centre under the sheet it had just moved out of the way.
   */
  const [detent, setDetent] = useState<Detent>("half");
  /**
   * Whether the map is showing the whole journey rather than following the listener.
   *
   * Cleared the moment the journey starts, because that is the transition the two views
   * exist either side of: before you set off the useful question is what the walk looks
   * like, and from the first step it is where you are.
   */
  const [overview, setOverview] = useState(false);
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
      // And from disk, not only from this screen. Before the collection persisted, hiding
      // the rows *was* deleting them; now a delete that only updates the view is a delete
      // that comes back on the next refresh, which is the worst possible version of this
      // button.
      void store.clear();
    } else {
      // Deleting positions is what turning the setting off does, so it is the same action:
      // the session rewrites storage the moment the setting changes.
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
    setOverview(false);
  };

  const nowPlaying = state.playback.kind === "idle" ? null : state.playback.item.echo;

  const playing = state.playback.kind === "playing";

  useEffect(() => {
    if (!nowPlaying) {
      startedRef.current = null;
      setPlayhead(0);
      return;
    }
    if (startedRef.current?.id !== nowPlaying.id) {
      startedRef.current = { id: nowPlaying.id, at: Date.now() };
      setPlayhead(0);
    }
    // Divided by the speed setting, or the bar runs at one speed while the voice runs at
    // another and the two disagree by more the longer the echo is.
    const durationS =
      ((simple ? nowPlaying.simple?.durationS : null) ?? nowPlaying.durationS) / rate;

    /*
     * A paused echo has a still playhead.
     *
     * This ran off the wall clock from the moment the echo started and never asked whether
     * anything was being said, so pausing froze the voice and left the bar walking: come
     * back to a paused player after a minute and it claimed to be a minute further in,
     * then jumped backwards the instant it resumed.
     */
    if (!playing) return;

    // Resume from where it stopped rather than from when it began, so a pause costs no
    // listening time.
    startedRef.current = {
      id: nowPlaying.id,
      at: Date.now() - progressRef.current * durationS * 1000,
    };

    const tick = setInterval(() => {
      const started = startedRef.current;
      if (!started) return;
      setPlayhead(Math.min(1, (Date.now() - started.at) / 1000 / durationS));
    }, 250);
    return () => clearInterval(tick);
  }, [nowPlaying, simple, rate, playing, setPlayhead]);

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
  /**
   * What this route passes, that this listener may hear.
   *
   * The corridor query answers the first half and knows nothing about who is asking, so the
   * eligibility gate is applied here — and applied *once*, above everything, because a
   * child who is not allowed to hear an echo should not be looking at a pin for it either.
   * Filtering only the playback would leave the map advertising a murder it then refuses to
   * play, which is a worse screen than either honest alternative.
   */
  const onRoute = useMemo(() => {
    const listener = listenerFor(kids);
    return (byRoute[route.id] ?? []).filter(
      (echo) => checkEligibility(echo, { profile: listener, playAtMs: Date.now() }).eligible,
    );
  }, [byRoute, route.id, kids]);
  const savedEchoes = useMemo(() => onRoute.filter((e) => chosen.has(e.id)), [onRoute, chosen]);
  /**
   * The saved list the sheet shows, in the order you will reach them.
   *
   * Distance rather than pick order, because that is the question the list answers while
   * you are standing in a street: of the things I said I wanted, which is closest.
   */
  const savedNearby = useMemo(() => {
    const from = state.position?.at;
    return savedEchoes
      .map((echo) => ({ echo, distanceKm: from ? distanceKm(from, echo.point.at) : 0 }))
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [savedEchoes, state.position]);
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

  /*
   * Hoisted and made stable, and not for tidiness.
   *
   * Every one of these was an inline arrow, so the rail, the tab bar and the chip row were
   * handed brand-new props four times a second and re-rendered with them — a hundred-odd
   * SVG nodes redrawn per second to show exactly what they already showed. Memoising those
   * three is worthless while their callbacks change identity every frame, so the callbacks
   * come first.
   */
  const toggleCategory = useCallback((category: EchoCategory) => {
    setCats((current) => {
      const next = new Set(current ?? available);
      if (next.has(category) && next.size > 1) next.delete(category);
      else next.add(category);
      return next;
    });
  }, [available]);
  const allCategories = useCallback(() => setCats(null), []);
  const toggleSave = useCallback((echo: Echo) => {
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(echo.id)) next.delete(echo.id);
      else next.add(echo.id);
      return next;
    });
  }, []);
  const openPlan = useCallback(() => setTab("listening"), []);
  const openPackage = useCallback(() => setStarted(false), []);
  const setKidsMode = useCallback((on: boolean) => {
    setKids(on);
    setSimple(on);
  }, []);

  // Recomputed as the listener moves, from how far along they are rather than from the
  // clock: a journey that paused still knows where it is, and asking the clock would offer
  // things already behind them.
  // Everything on the route, in the order it is reached — the same question `upcoming` asks
  // from where you are, asked from the start line and without a lead-in filter.
  const wholeRoute = useMemo(
    () => upcomingOnRoute(route, onRoute, listenerFor(kids), 0, { limit: 99, minLeadS: -Infinity }),
    [route, onRoute, kids],
  );

  /**
   * Progress, in twenty-metre steps.
   *
   * `upcoming` asks a question of the whole route and was re-asked on every position event
   * — four times a second, forever, to produce the same two rows. Twenty metres is under
   * the accuracy of the fix that drives it, so nothing on screen can be stale in a way a
   * listener could detect, and the query runs when they have actually gone somewhere.
   */
  const walkedStep = Math.round(walk.walkedMetres / 20);

  const upcoming = useMemo(
    () =>
      upcomingOnRoute(
        route,
        onRoute,
        // Anything already found is not a suggestion. Reusing `heardEchoIds` rather than
        // adding an exclusion list keeps one mechanism for "do not offer me this again" —
        // and without it the thing currently playing turns up under "coming up".
        { ...listenerFor(kids), heardEchoIds: kept.map((c) => c.echo.id) },
        walk.walkedMetres / 1000,
        { limit: 2 },
      ),
    // `walk.walkedMetres` is read off a mutable simulation, so the quantised step is what
    // says it changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [route, onRoute, walkedStep, kept, kids],
  );
  const inCorridor = onRoute.length;

  return (
    <div className="stage">
      <div className="phone">
        <div className={selfDirected ? "screen" : "screen stack-noguide"}>
          <div className="statusbar">
            <span className="mono">10:42</span>
            <span className="mono dim">{MODE_PHRASE[route.mode] ?? route.mode}</span>
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
                  onToggle={toggleCategory}
                  onAll={allCategories}
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
                detent={detent}
                overview={overview}
                theme={theme}
              />
              <Rail
                theme={theme}
                onTheme={setTheme}
                routes={ROUTES}
                route={route}
                onRoute={onSelectRoute}
                counts={corridorCounts}
                available={available}
                on={activeCats}
                onToggle={toggleCategory}
                onAll={allCategories}
                kids={kids}
                onKids={setKidsMode}
                savedCount={chosen.size}
                onSaved={openPlan}
                overview={overview}
                onOverview={setOverview}
                downloaded={started}
                onDownload={openPackage}
              />
              {selfDirected && <ProximityBar guidance={state.guidance} cue={state.cue} />}
              {/*
                The floating row, and when it is allowed to exist.
                
                It was guarded on `!nowPlaying`, which is the same condition as playback
                being idle — and the row renders nothing when playback is idle. So it has
                never once appeared, and the queue it was written to make visible has never
                been visible.
                
                The guard was trying to say something true, though: the sheet carries the
                full transport, and two players on one screen is worse than none. The
                honest version of that is the detent. With the sheet down — the walking
                state, three-quarters map — there is no transport on screen and this is the
                only thing that says what is in your ears. With the sheet up there is, and
                this gets out of the way.
              */}
              {detent === "peek" && <NowPlaying
                state={state.playback}
                waiting={state.waiting}
                deferred={state.deferred}
                onPause={() => session.pause()}
                onResume={() => session.resume()}
                onSkip={() => session.skip()}
                progress={progress}
                saved={nowPlaying ? chosen.has(nowPlaying.id) : false}
                onSave={toggleSave}
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
                savedNearby={savedNearby}
                nowPlaying={nowPlaying}
                progress={progress}
                playing={playing}
                simple={simple}
                onSimple={setSimple}
                rate={rate}
                onRate={setRate}
                onSeek={(f) => {
                  if (!nowPlaying) return;
                  const clamped = Math.max(0, Math.min(1, f));
                  const d = ((simple ? nowPlaying.simple?.durationS : null) ?? nowPlaying.durationS) / rate;
                  startedRef.current = { id: nowPlaying.id, at: Date.now() - clamped * d * 1000 };
                  setPlayhead(clamped);
                }}
                detent={detent}
                onDetent={setDetent}
                onNext={() => session.skip()}
                {...(selfDirected ? { onCamera: setCamera } : {})}
                onSave={toggleSave}
              />
            </>
          )}

          {tab === "listening" && (
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

          {tab === "saved" && (
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

          {tab === "settings" && (
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
              foundCount={kept.length}
              // Most recent first, and de-duplicated: two echoes at Bowling Green should
              // not read as two places.
              recentPlaces={[...new Set([...kept].reverse().map((c) => c.echo.point.place.split(",")[0]!.trim()))]}
              onStart={(next) => {
                if (next.id !== route.id) onSelectRoute(next);
                setStarted(true);
                setOverview(false);
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
          The basemap is Esri's grey canvas, tiled in Web Mercator and projected by the
          same code that places the pins. It is dimmed on purpose: it is a backdrop for the
          route, not a thing to read. A tile that cannot be fetched hides itself, so a bad
          network degrades the map rather than breaking the screen.
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
