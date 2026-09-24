import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PRIVACY_DEFAULTS, holdsPersonalLocation, type PrivacySettings } from "@echofinders/core";
import { LIBRARY, ROUTES } from "./library.generated";
import { CATEGORY_ORDER, type ChipGroup } from "./categories";
import { useJourney, listenerFor } from "./use-journey";
import { ModePicker } from "./ModePicker";
import { RouteMap, type PinState } from "./RouteMap";
import { ProximityBar } from "./ProximityBar";
import { Sheet } from "./Sheet";
import { Collection } from "./Collection";
import { Privacy } from "./Privacy";
import { Nav, type Tab } from "./Nav";
import { Plan } from "./Plan";
import { RouteRibbon } from "./RouteRibbon";
import { CategoryChips } from "./CategoryChips";
import { Arrival } from "./Arrival";
import { Preflight } from "./Preflight";
import { EchoPopup } from "./EchoPopup";
import { Viewfinder } from "./Viewfinder";
import { Onboarding } from "./Onboarding";
import { loadRatings, setRating, type Rating } from "./ratings";
import { BrowserLocation } from "./browser-location";
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

/** Every category, as the starting filter. See `activeCats`. */
const ALL_CATEGORIES: ReadonlySet<EchoCategory> = new Set(CATEGORY_ORDER);

/** The walk is the richest route, so it is what the prototype opens on. */
const DEFAULT_ROUTE = ROUTES.find((r) => r.id === "lower-manhattan-walk") ?? ROUTES[0]!;

export function App() {
  const [route, setRoute] = useState<Route>(DEFAULT_ROUTE);
  /**
   * Roaming: there is no journey, only here.
   *
   * The front door the app was missing. Everything downstream already supports it —
   * `WalkSession` takes a mode rather than a route, and `findEchoesNearby` answers "what
   * is here" with no path to project onto — so this is a flag, not a second app.
   */
  const [roaming, setRoaming] = useState(false);

  /**
   * The real device location. Asked for once, by a tap, and held for the life of the app:
   * a granted watch should survive switching journeys, and asking twice is how a
   * permission gets refused.
   */
  const gps = useMemo(() => new BrowserLocation(), []);
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
  /*
   * The map is the app, so the map is what opens.
   *
   * This used to be `false`, which put the package screen in front of everything as a gate:
   * a modal over a blurred map asking you to pick a route and agree to a download before
   * you were allowed to look at anything. That is the wrong shape for a product whose whole
   * proposition is "open it and see what is around you", and it made the first thing anyone
   * saw a form.
   *
   * The package screen still exists and still matters, because a walk with no signal needs
   * one (ADR-0003). It is now something you go to, from the rail, rather than something that
   * happens to you.
   */
  const [packageOpen, setPackageOpen] = useState(false);
  /** Whether this journey has actually been taken onto the device. */
  const [downloaded, setDownloaded] = useState(false);
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
  const { state, session, walk, store } = useJourney(roaming ? null : route, LIBRARY, {
    sound,
    narrate,
    autoPlay,
    // Undefined rather than an empty set when nothing has been picked: no choice made means
    // no restriction, while an empty choice means "I chose nothing" and is honoured.
    chosen: chosen.size > 0 ? chosen : undefined,
    paused,
    rate,
    privacy,
    kids,
    simple,
    gps,
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
  /**
   * Choosing what plays itself, reached from the package screen rather than the tab bar.
   *
   * It is a decision about a journey, made once before setting off, and it only pays off
   * if the phone is going in a pocket. A permanent tab gave it the same standing as the
   * map, which it does not have.
   */
  const [planOpen, setPlanOpen] = useState(false);

  /**
   * First run, remembered.
   *
   * `localStorage` rather than the collection store, because this is a fact about the
   * browser rather than about the journey, and because a read that fails should mean
   * "show it" rather than blocking the app on a disk error. A private window sees it
   * every time, which is the right side to fail on.
   */
  useEffect(() => () => gps.stop(), [gps]);

  const [onboarded, setOnboarded] = useState(() => {
    try {
      return localStorage.getItem("echo-finders:onboarded") === "1";
    } catch {
      return false;
    }
  });
  const finishOnboarding = useCallback(() => {
    setOnboarded(true);
    try {
      localStorage.setItem("echo-finders:onboarded", "1");
    } catch {
      /* private browsing. Seeing the welcome twice is not worth an error. */
    }
  }, []);

  /**
   * The real GPS, asked for once, by a tap.
   *
   * Held for the life of the app rather than per session: a granted watch should survive
   * switching journeys, and asking twice is how a permission gets refused. The walk is
   * still driven by the simulation — see `useJourney` — so this currently proves the
   * permission path end to end without replacing the demo's position. Swapping the source
   * is one line in `useJourney` once there is a real route under somebody's feet.
   */
  /**
   * Private ratings, for editorial rather than for display. See `ratings.ts`.
   *
   * There is nowhere to send these yet, so they sit on the device. That is the right
   * order: the question is worth asking before there is a backend to answer it into, and
   * a signal collected from day one is a signal you have when the backend arrives.
   */
  const [ratings, setRatings] = useState(loadRatings);
  const rateEcho = useCallback((echoId: string, rating: Rating) => {
    setRatings((current) => setRating(current, echoId, rating));
  }, []);


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

  /* Progress along a journey. Roaming has none: there is nowhere you are supposed to end up. */
  const along = walk && walk.totalMetres > 0 ? walk.walkedMetres / walk.totalMetres : 0;
  const arrived = walk !== null && along >= 0.99;
  const remainingS = route.durationS * (1 - Math.min(1, along));

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

  /**
   * How far along the route each echo sits, by id.
   *
   * The corridor query has always returned this and the line above always threw it away.
   * It is what makes a list of echoes hold still: see `nearby` below.
   */
  const alongKm = useMemo(() => {
    const out = new Map<string, number>();
    for (const r of ROUTES) {
      for (const hit of findEchoesAlongRoute(r, LIBRARY)) {
        if (r.id === route.id) out.set(hit.echo.id, hit.alongTrackKm);
      }
    }
    return out;
  }, [route.id]);
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
  /**
   * Everything is on until somebody turns something off.
   *
   * This used to default to `available` — the categories this route happens to pass — and
   * the chip row reads that as state: five of nine chips came up grey on a walk, looking
   * switched off by a listener who had never touched them. Defaulting to the whole
   * taxonomy means an unlit chip always means "you turned this off", which is the only
   * thing a filter should ever mean. It changes no results: an echo cannot be in a
   * category that does not exist.
   */
  const activeCats = cats ?? ALL_CATEGORIES;

  /*
   * Hoisted and made stable, and not for tidiness.
   *
   * Every one of these was an inline arrow, so the rail, the tab bar and the chip row were
   * handed brand-new props four times a second and re-rendered with them — a hundred-odd
   * SVG nodes redrawn per second to show exactly what they already showed. Memoising those
   * three is worthless while their callbacks change identity every frame, so the callbacks
   * come first.
   */
  /**
   * Toggling a chip moves every category it stands for.
   *
   * Landmarks is two (`built` and `land`), so it has to set both or the chip would light
   * on half its own meaning. The last lit chip cannot be turned off: an empty filter is an
   * empty map with no obvious way back, and nobody means it.
   */
  const toggleCategory = useCallback((group: ChipGroup) => {
    setCats((current) => {
      const base = current ?? ALL_CATEGORIES;
      const next = new Set(base);
      const lit = group.categories.some((c) => next.has(c));
      if (lit) {
        const remaining = [...next].filter((c) => !group.categories.includes(c));
        if (remaining.length === 0) return next;
        return new Set(remaining);
      }
      for (const c of group.categories) next.add(c);
      return next;
    });
  }, []);
  /**
   * All, and none.
   *
   * It only ever switched everything on, so once everything was on it was a button that
   * did nothing. Toggling is what the word implies and it is the fastest way to say "just
   * this one": clear the row, then tap the one you want.
   *
   * An empty filter is reachable this way, and that is fine here where it is not from a
   * single chip: turning off the last lit category one tap at a time is almost always a
   * mistake, while emptying the row deliberately is a technique, and the way out of it is
   * the same button.
   */
  const allCategories = useCallback(() => {
    setCats((current) => {
      const on = current ?? ALL_CATEGORIES;
      return on.size >= ALL_CATEGORIES.size ? new Set<EchoCategory>() : null;
    });
  }, []);
  const toggleSave = useCallback((echo: Echo) => {
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(echo.id)) next.delete(echo.id);
      else next.add(echo.id);
      return next;
    });
  }, []);
  const openPackage = useCallback(() => setPackageOpen(true), []);
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
  const walkedStep = Math.round((walk?.walkedMetres ?? 0) / 20);

  const upcoming = useMemo(
    () =>
      upcomingOnRoute(
        route,
        onRoute,
        // Anything already found is not a suggestion. Reusing `heardEchoIds` rather than
        // adding an exclusion list keeps one mechanism for "do not offer me this again" —
        // and without it the thing currently playing turns up under "coming up".
        { ...listenerFor(kids), heardEchoIds: kept.map((c) => c.echo.id) },
        (walk?.walkedMetres ?? 0) / 1000,
        { limit: 2 },
      ),
    // `walk.walkedMetres` is read off a mutable simulation, so the quantised step is what
    // says it changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [route, onRoute, walkedStep, kept, kids],
  );
  /**
   * What is around you, in the order you will reach it.
   *
   * The engine ranks `nearby` by score, which blends quality with distance, and distance
   * changes four times a second. So the list re-sorted continuously: rows swapped under a
   * thumb, the thing somebody was reading slid somewhere else, and two echoes a few metres
   * apart traded places over and over on nothing but GPS jitter. On a walk shown at
   * fourteen times life it is unusable; at real pace it would be slower and still wrong,
   * because the cause is not speed.
   *
   * Ordering by position along the route fixes it by construction rather than by damping.
   * A route is a sequence. Walking forward, an item can only ever leave the top: nothing
   * behind you moves ahead of anything, and no amount of jitter reorders two points whose
   * order was fixed when the route was drawn. The engine's ranking still decides what is
   * *in* the list; this only decides the order they sit in.
   *
   * Echoes with no along-track position sort last rather than first, so a missing value
   * can never jump a row to the top of somebody's screen.
   */
  const nearby = useMemo(() => {
    const at = (id: string) => alongKm.get(id) ?? Number.POSITIVE_INFINITY;
    return state.nearby
      .filter((n) => activeCats.has(n.echo.category))
      .slice()
      .sort((a, b) => at(a.echo.id) - at(b.echo.id));
  }, [state.nearby, activeCats, alongKm]);

  /**
   * The echo whose pin is open, and how far off it is.
   *
   * `nearby` first, because that already carries a measured distance. A pin can be selected
   * from outside that set though — the map draws everything in the corridor, not only what
   * is within reach — so the fallback measures it, and reports null rather than zero when
   * there is no fix yet. Zero would read as "you are standing on it".
   */
  const selectedEcho = useMemo(() => {
    if (!selectedId) return null;
    const near = state.nearby.find((n) => n.echo.id === selectedId);
    if (near) return { echo: near.echo, distanceKm: near.distanceKm };
    const echo = LIBRARY.find((e) => e.id === selectedId);
    if (!echo) return null;
    const from = state.position?.at ?? null;
    return { echo, distanceKm: from ? distanceKm(from, echo.point.at) : null };
  }, [selectedId, state.nearby, state.position]);

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
                {/* A journey's header. Roaming has no origin, no destination and no ETA,
                    and inventing one would be the same fiction the whole review was about. */}
                {!roaming && <RouteRibbon
                  route={route}
                  progress={along}
                  remainingS={remainingS}
                />}
                <CategoryChips
                  available={available}
                  on={activeCats}
                  onToggle={toggleCategory}
                  onAll={allCategories}
                />
              </div>
              <RouteMap
                route={roaming ? null : route}
                mode={roaming ? "walking" : route.mode}
                library={
                  roaming
                    ? state.nearby.map((n) => n.echo).filter((e) => activeCats.has(e.category))
                    : onRoute.filter((e) => activeCats.has(e.category))
                }
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
                kids={kids}
                onKids={setKidsMode}
                overview={overview}
                onOverview={setOverview}
                downloaded={downloaded}
                onDownload={openPackage}
              />
              {/*
                The echo you tapped, over the map.
                It replaces the guidance bar while it is open rather than stacking with it:
                two strips saying how far away something is, one of them about a different
                echo, is how a screen stops meaning anything.
              */}
              {selectedEcho ? (
                <EchoPopup
                  echo={selectedEcho.echo}
                  distanceKm={selectedEcho.distanceKm}
                  state={stateOf(selectedEcho.echo.id)}
                  saved={chosen.has(selectedEcho.echo.id)}
                  onSave={toggleSave}
                  onPlay={(echo) => {
                    session.play(echo);
                    setSelectedId(null);
                  }}
                  onClose={() => setSelectedId(null)}
                />
              ) : (
                selfDirected && <ProximityBar guidance={state.guidance} cue={state.cue} />
              )}
              <Sheet
                nearby={nearby}
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
                onRouteCount={inCorridor}
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
                onStop={() => session.stopPlaying()}
                rating={nowPlaying ? ratings[nowPlaying.id] : undefined}
                onRating={(r) => nowPlaying && rateEcho(nowPlaying.id, r)}
                {...(selfDirected ? { onCamera: setCamera } : {})}
                onSave={toggleSave}
              />
            </>
          )}

          {planOpen && (
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
                setPlanOpen(false);
              }}
              onClose={() => setPlanOpen(false)}
            />
          )}

          {tab === "echoes" && (
            <Collection
              captured={kept}
              privacy={privacy}
              total={inCorridor}
              onPlay={(echo) => session.play(echo)}
              isPlaying={(id) =>
                state.playback.kind !== "idle" && state.playback.item.echo.id === id
              }
              isHeard={(id) => stateOf(id) === "heard"}
              saved={savedEchoes}
              onSave={toggleSave}
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
                walk?.seekTo(0);
              }}
              onAgain={() => walk?.seekTo(0)}
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

          {/*
            Onboarding sits above the package screen, because two of its three steps decide
            things the package screen assumes: who is listening, and whether we know where
            they are.
          */}
          {!onboarded && (
            <Onboarding
              onAskLocation={() => gps.start()}
              kids={kids}
              onKids={setKidsMode}
              cats={activeCats}
              onToggleCats={(categories) =>
                setCats((current) => {
                  const next = new Set(current ?? ALL_CATEGORIES);
                  if (categories.some((c) => next.has(c))) {
                    for (const c of categories) next.delete(c);
                  } else {
                    for (const c of categories) next.add(c);
                  }
                  return next;
                })
              }
              simple={simple}
              onSimple={setSimple}
              /* The real narrator, saying a real line, through whatever the listener has
                 in their ears. A volume set against silence is not set. */
              onTestLine={() => session.play(LIBRARY[0]!)}
              routes={ROUTES}
              onFlight={(routeId) => {
                const found = routeId ? ROUTES.find((r) => r.id === routeId) : undefined;
                if (found) onSelectRoute(found);
              }}
              onDone={(roam) => {
                setRoaming(roam);
                finishOnboarding();
              }}
            />
          )}

          {onboarded && packageOpen && (
            <Preflight
              routes={ROUTES}
              counts={corridorCounts}
              library={LIBRARY}
              current={route}
              foundCount={kept.length}
              // Most recent first, and de-duplicated: two echoes at Bowling Green should
              // not read as two places.
              recentPlaces={[...new Set([...kept].reverse().map((c) => c.echo.point.place.split(",")[0]!.trim()))]}
              onChoose={() => setPlanOpen(true)}
              onStart={(next) => {
                if (next.id !== route.id) onSelectRoute(next);
                setDownloaded(true);
                setPackageOpen(false);
                setOverview(false);
              }}
            />
          )}

          <Nav
            tab={tab}
            onChange={setTab}
            foundCount={kept.length}
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
          chip is faked, and position comes from <code>RouteProfile</code>, so the traveller
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
            <b>Turn your sound on.</b> As you close on a sealed echo you will hear it. A
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
              walk?.seekTo(0);
              setPackageOpen(true);
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
          {Math.round(along * 100)}% along · {kept.length} synced · {inCorridor} on this route ·{" "}
          {LIBRARY.length} in the library
        </p>
      </aside>
    </div>
  );
}
