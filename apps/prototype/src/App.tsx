import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PRIVACY_DEFAULTS, holdsPersonalLocation, screenAwake, screenAwakeNote, type PrivacySettings } from "@echofinders/core";
import { LIBRARY, ROUTES } from "./library.generated";
import { CATEGORY_ORDER, type ChipGroup } from "./categories";
import { useJourney, listenerFor } from "./use-journey";
import { ModePicker } from "./ModePicker";
import { RouteMap, MAX_ZOOM, MIN_ZOOM, type PinState } from "./RouteMap";
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
import { Rose } from "./Rose";
import { Hum } from "./hum";
import { useHeading } from "./use-sensors";
import { Viewfinder } from "./Viewfinder";
import { Onboarding } from "./Onboarding";
import { loadRatings, setRating, type Rating } from "./ratings";
import { BrowserLocation } from "./browser-location";
import { Rail, type WalkingView } from "./Rail";
import { MODE_ICON, MODE_PHRASE } from "./travel";
import { publishNowPlaying, usePageVisible, useScreenAwake } from "./wake";
import { Synced } from "./Synced";
import { Walk } from "./Walk";
import { Nowhere } from "./Nowhere";
import { Ribbon } from "./Ribbon";
import { Stepper, STEPPER_H } from "./Stepper";
import { Paywall } from "./Paywall";
import { readEntitlement, unlock } from "./entitlement-store";
import { City } from "./City";
import type { Detent } from "./Sheet";
import type { CaptureEvent, Echo, EchoCategory } from "@echofinders/core";
import {
  bearingDeg as bearingTo,
  checkEligibility,
  mayHearAnother,
  type Entitlement,
  distanceKm,
  effectiveRadiusKm,
  findEchoesAlongRoute,
  presetFor,
  upcomingOnRoute,
  type Route,
} from "@echofinders/core";

/** Every category, as the starting filter. See `activeCats`. */
const ALL_CATEGORIES: ReadonlySet<EchoCategory> = new Set(CATEGORY_ORDER);
/** Nothing chosen. Onboarding's starting point, and never the map's. */
const EMPTY_CATS: ReadonlySet<EchoCategory> = new Set();

/** The walk is the richest route, so it is what the prototype opens on. */
/**
 * Is this somebody building the app, or somebody using it?
 *
 * `?dev` on the URL. Read once at module load rather than held in state, because it never
 * changes within a session and a prototype harness is not worth a re-render.
 */
const dev =
  typeof location !== "undefined" && new URLSearchParams(location.search).has("dev");

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
   * How you are travelling when there is no route.
   *
   * Roaming used to imply walking, which is how a driver hunting for echoes ended up run at
   * walking pace, with a three hundred metre corridor, under a rule that asked them to
   * stand still at every one. Driving is hunting too; it just hunts at sixty.
   */
  /**
   * How you are travelling. The source of truth, not something derived.
   *
   * It *was* derived, from whether you were roaming and what mode the current route had,
   * and that quietly made the journey screen's own control not work: pressing Flying set
   * roaming false, which handed the derivation back to the route, which was still a walk,
   * so the answer came back "driving" and the button appeared not to do anything. State
   * that a control sets has to be state.
   */
  const [travel, setTravel] = useState<"walking" | "driving" | "flight">("walking");
  /** What the engine is run as while roaming. Flying is never roaming: the door is locked. */
  const roamMode: "walking" | "driving" = travel === "driving" ? "driving" : "walking";
  /** A narrator the listener picked. Null keeps whichever the echo was written for. */
  const [voice, setVoice] = useState<string | null>(null);
  /*
   * Walking's own view, and the app opens on the MAP.
   *
   * It opened on the rose for months, on an argument I made up and never checked against
   * the canvas: that a route map answers a passenger's question while a walker has a here
   * and a head they can turn. It reads well and it is not what was approved. The canvas
   * has nine screens in order and the second is "FIND IT", which is the street map; the
   * rose's nearest relative is `Around.dc.html`, which sits on the row headed "Rejected.
   * Nothing on this row is proposed."
   *
   * So on foot the app landed on a compass dial that no approved board describes, with the
   * designed screen one unexplained tap away behind a folded-map icon. Every pass I made
   * at board 2 was invisible to anybody who opened the app and looked at it, which is
   * exactly what happened.
   *
   * The rose is still there and still one tap away, inverted: it is a genuinely good
   * answer to "what is around me" and deleting it would be overcorrecting. It is just no
   * longer the front door.
   */
  const [walkingView, setWalkingView] = useState<WalkingView>("map");
  /** The street humming. Off until somebody asks for it, because it is audio. */
  const [humming, setHumming] = useState(false);
  /**
   * The echo being walked to.
   *
   * The chord tells you what is around you and gets you nowhere in particular, which is
   * exactly half of a hunting tool. Picking one makes it the beacon: it becomes the loud one
   * and rises in pitch as you turn towards it, the dial stands everything else back, and the
   * street map becomes worth showing because there is finally somewhere to go.
   */
  const [beacon, setBeacon] = useState<string | null>(null);
  const hum = useMemo(() => new Hum(), []);
  useEffect(() => () => hum.close(), [hum]);
  /** Whether the journey screen actually resolved to a route, so "just drive" can roam. */
  const roamRouteChosen = useRef(false);

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
  /**
   * Which categories are on. `null` means all of them.
   *
   * Onboarding starts from an EMPTY set rather than from `null`, which is a different
   * thing and the reason that step read backwards: the screen says "Pick as many as you
   * like" over nine chips that are already picked, so the only available action is
   * deselecting, and the button underneath counts down instead of up. Nobody picks by
   * unpicking.
   *
   * `null` stays the resting state for everything after onboarding, because a listener
   * who has never opened the filter row should see the whole library rather than nothing.
   */
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
  /**
   * How far the engine looks, when somebody standing nowhere has asked for further.
   *
   * Undefined is the mode's own reach and is where every session starts. It is cleared
   * whenever the journey changes, because "look further" was an answer to a particular
   * street and carrying it into a flight would be a setting nobody set.
   */
  const [lookFurtherKm, setLookFurtherKm] = useState<number | undefined>(undefined);
  /**
   * Categories the listener has asked for that are not carried by default.
   *
   * Only true crime today. The chip is the opt-in: the engine refuses a category the
   * profile does not list, so switching the chip on has to change the profile or the chip
   * is a filter over an empty set — which is exactly what it was, and why the one rare
   * echo in the library could not be reached in any state of the app.
   *
   * Memoised on the one boolean rather than on `activeCats`, so toggling any other chip
   * does not rebuild the session.
   */
  // Read from `cats` rather than `activeCats`, which is derived further down: null means
  // nothing has been switched off yet, and the default set carries every category.
  const trueCrimeOn = (cats ?? ALL_CATEGORIES).has("true-crime");
  const optIns = useMemo<readonly EchoCategory[]>(
    () => (trueCrimeOn ? ["true-crime"] : []),
    [trueCrimeOn],
  );
  /**
   * The city view, which is the honest answer to "where are they then".
   *
   * It replaced the overview toggle as the destination for that question. The overview
   * frames the whole library on the street map, which at national scale is a grey
   * rectangle with eight specks on it — technically the answer and useless as one. This
   * shows density instead, which is the shape of the question.
   */
  const [cityOpen, setCityOpen] = useState(false);

  const setPlayhead = useCallback((fraction: number) => {
    progressRef.current = fraction;
    setProgress(fraction);
  }, []);
  /**
   * Whether the listening screen has the phone.
   *
   * Playing and *listening* are not the same state, which is why this is a flag rather
   * than `playing`. Starting an echo deliberately — from a row, from a pin, from the sync
   * moment — is somebody settling in to hear it, and that gets the whole screen. Pressing
   * back leaves it playing and hands the map back, with the transport in the sheet, which
   * is what somebody who wants to keep walking is asking for.
   */
  const [listening, setListening] = useState(false);
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
    roamMode,
    voice,
    privacy,
    kids,
    simple,
    gps,
    nearbyRadiusKm: lookFurtherKm,
    optIns,
  });

  // Whether the traveller can steer. Guidance answers "which way should I go", so it is
  // shown to a walker and to a car's navigator, and withheld from anyone being carried —
  // nobody diverts an aircraft towards a good story.
  const selfDirected = presetFor(route.mode).selfDirected;
  /**
   * What has been paid for, and the one place a play is refused for money.
   *
   * NOT on the map filter above, and that is the whole shape of it. The age gate is
   * applied to the pins, because a child should not be looking at a pin for something
   * they may not hear. The paywall is the opposite: somebody has to be able to SEE what
   * they would be buying, or there is no reason to buy it. A map that empties out after
   * the tenth echo looks broken; a map full of stories with one asking politely for $6.99
   * is the product.
   *
   * So the entitlement never reaches `onRoute`. It is consulted here, at the moment a
   * play is actually requested, and refuses by opening the paywall rather than by
   * silently doing nothing.
   */
  const [entitlement, setEntitlement] = useState<Entitlement>(() => readEntitlement());
  const [paywallFor, setPaywallFor] = useState<Echo | null>(null);



  const [selectedId, setSelectedId] = useState<string | null>(null);

  /**
   * How far the listener has zoomed the map in, as a multiple of the mode's own framing.
   *
   * Held here rather than inside the map, because the control column carries the zoom
   * buttons and both have to move the same number. The map still owns the gestures.
   */
  const [zoom, setZoom] = useState(1);
  /**
   * How far the listener has dragged the map, in screen pixels.
   *
   * Held next to the zoom and for the same reason: the recentre button on the control
   * column has to be able to clear it, and only App can see both.
   */
  const [pan, setPan] = useState({ x: 0, y: 0 });
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
  /*
   * The sheet opens at PEEK, which is what board 2 draws.
   *
   * It opened at half, and half is 46 percent of the screen: the map got the band between
   * the chips and a list of everything nearby, the control column was squeezed into that
   * band until its top button sat on the category chips, and the screen the design calls
   * FIND IT had barely enough map left to find anything on. Board 2 is a full screen of
   * map with a single card along the bottom, and that is peek.
   *
   * Half is one swipe up and the sheet remembers nothing between sessions, so this is the
   * resting state rather than a restriction.
   */
  const [detent, setDetent] = useState<Detent>("peek");
  /**
   * Whether the map is showing the whole journey rather than following the listener.
   *
   * Cleared the moment the journey starts, because that is the transition the two views
   * exist either side of: before you set off the useful question is what the walk looks
   * like, and from the first step it is where you are.
   */
  const [overview, setOverview] = useState(false);
  /*
   * A new journey, or a jump to the overview, is a new framing. Keeping the old multiplier
   * across either one lands somebody at 8x on a map they have not seen yet.
   */
  const routeId = roaming ? null : route.id;
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [routeId, overview]);
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

  /**
   * Which echoes have actually been HEARD, which is what the free ten counts.
   *
   * Not `kept`. Finding something and hearing it are different events and the free tier
   * only charges for the second: you can sync a whole city for nothing and every one of
   * those stays yours. `tracker.stateOf` is the engine's own answer to "did this play",
   * so the count and the gate cannot drift apart.
   */
  const heardIds = useMemo(
    () => state.captured.map((c) => c.echo.id).filter((id) => session.tracker.stateOf(id) === "heard"),
    [state, session],
  );

  /**
   * Play it, or ask for the money. Every play in the app goes through here.
   *
   * One funnel rather than a check at each of the nine call sites, because nine checks is
   * eight chances to forget one, and the one you forget is a free listen somebody was
   * supposed to pay for.
   */
  const playOrAsk = useCallback(
    (echo: Echo) => {
      if (!mayHearAnother(entitlement, { ...listenerFor(kids, optIns), heardEchoIds: heardIds }, echo.id)) {
        setPaywallFor(echo);
        return;
      }
      session.play(echo);
    },
    [entitlement, kids, optIns, session, heardIds],
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

  /*
   * The sync moment.
   *
   * An echo opening was a pin changing colour and a row appearing in a list, which is a
   * report rather than an event, and it is the one thing this product does that nothing
   * else does. It takes the screen now.
   *
   * Tracked by id rather than by list length, because captures can arrive together when
   * two echoes overlap and a length comparison would miss the second. The seen-set starts
   * populated from whatever was already captured at mount, so reopening the app does not
   * replay a celebration for something you synced last week.
   */
  const [syncedNow, setSyncedNow] = useState<CaptureEvent | null>(null);
  const seenCaptures = useRef<Set<string> | null>(null);
  useEffect(() => {
    /*
     * NOT WHILE ONBOARDING, and this one was found by running the app rather than reading
     * it. The session starts on a demo route the moment the app mounts, and the simulated
     * journey sets off from Battery Park and promptly syncs Castle Clinton — behind the
     * onboarding, which covers the screen. Close onboarding and you were handed a
     * full-screen celebration of an echo you had not walked a step towards, over the top
     * of the first thing you were ever meant to see.
     *
     * Holding the set at null until then is the fix rather than an extra flag, because it
     * is the same mechanism that stops last week's collection replaying: when onboarding
     * ends, whatever the simulation collected in the meantime is already-seen history, and
     * only what happens after counts as a moment.
     */
    if (!onboarded) return;
    if (seenCaptures.current === null) {
      seenCaptures.current = new Set(state.captured.map((c) => c.echo.id));
      return;
    }
    const fresh = state.captured.filter((c) => !seenCaptures.current!.has(c.echo.id));
    if (fresh.length === 0) return;
    for (const c of fresh) seenCaptures.current.add(c.echo.id);
    // The last one is the one you are standing on.
    setSyncedNow(fresh[fresh.length - 1]!);
  }, [state.captured, onboarded]);

  const nowPlaying = state.playback.kind === "idle" ? null : state.playback.item.echo;

  const playing = state.playback.kind === "playing";

  /*
   * Hold the screen awake while it matters, and say so.
   *
   * On iOS both the audio and the position fix stop when the screen locks, so
   * `featureAvailability`'s promise that "echoes still open, you just need the app open on
   * screen while you walk" is only true for the thirty seconds before the phone dims
   * itself. The engine decides when to hold it; `useScreenAwake` owns the platform call
   * and the re-request after the page comes back, which the API does not do for you.
   *
   * `humming` is the signal for a walk because it is the moment somebody explicitly says
   * they are out with headphones in, rather than reading a list indoors.
   */
  useEffect(() => {
    if (!nowPlaying) { publishNowPlaying(null); return; }
    publishNowPlaying({
      title: nowPlaying.title,
      place: nowPlaying.point.place,
      onPlay: () => playOrAsk(nowPlaying),
      onPause: () => session.stopPlaying(),
      onStop: () => session.stopPlaying({ dropQueue: true }),
    });
    return () => publishNowPlaying(null);
  }, [nowPlaying, session]);

  /**
   * Move the playhead, from anywhere.
   *
   * There is no real audio for most of the library, so "where you are" is a clock started
   * when playback began (`startedRef`). Seeking is therefore moving that start time, not
   * telling a decoder anything, and the sum has to be identical wherever it is done or the
   * two scrubbers disagree about the same echo. It was inline in the sheet; the ribbon is
   * the second caller.
   */
  const seekTo = useCallback(
    (fraction: number) => {
      if (!nowPlaying) return;
      const clamped = Math.max(0, Math.min(1, fraction));
      const d = ((simple ? nowPlaying.simple?.durationS : null) ?? nowPlaying.durationS) / rate;
      startedRef.current = { id: nowPlaying.id, at: Date.now() - clamped * d * 1000 };
      setPlayhead(clamped);
    },
    [nowPlaying, simple, rate, setPlayhead],
  );

  const pageVisible = usePageVisible();
  /*
   * Walk mode counts as walking, and that is not a detail.
   *
   * `humming` was the only signal, on the reasoning that switching the street hum on is
   * somebody saying out loud that they are out with headphones in. True, and incomplete:
   * pressing "Take me there" and holding walk mode open is the same statement made more
   * plainly, and a listener who never turns the hum on was getting a phone that dimmed
   * halfway to the echo — which is the exact failure the wake lock was added for.
   */
  const walkingNow = humming || (walkingView === "walk" && beacon !== null);
  const awake = screenAwake({ walking: walkingNow, playing, visible: pageVisible, allowed: true });
  const wake = useScreenAwake(awake);
  /*
   * Stopped is not paused, and the transport has to say which.
   *
   * The engine has one paused state, correctly: both are "an item, not making sound". The
   * difference is what the listener meant, and that only this layer knows. It clears itself
   * the moment anything starts again.
   */
  const [stopped, setStopped] = useState(false);
  useEffect(() => {
    if (playing) setStopped(false);
  }, [playing]);

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
    const listener = listenerFor(kids, optIns);
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
    () => upcomingOnRoute(route, onRoute, listenerFor(kids, optIns), 0, { limit: 99, minLeadS: -Infinity }),
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
        { ...listenerFor(kids, optIns), heardEchoIds: kept.map((c) => c.echo.id) },
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

  /*
   * Walking, and therefore the rose.
   *
   * Only free roam on foot: a walking *route* is a planned thing with an order to it, which
   * is what the map is good at. The rose is for hunting.
   */
  const onFoot = roaming && roamMode === "walking";
  const heading = useHeading(onFoot);

  /*
   * The rose wants the screen, so it takes the sheet down to one row when it opens.
   *
   * Not a preference, a measurement: at the half detent the dial had about two hundred
   * pixels to live in and its own button was behind the sheet. Peek is what the walking
   * screen is *for* anyway, and the sheet still opens by hand from there.
   */
  const showingRose = onFoot && walkingView === "rose";
  useEffect(() => {
    if (showingRose) setDetent("peek");
  }, [showingRose]);

  /**
   * What is drawn on the map, and therefore what the stepper walks.
   *
   * One list, hoisted out of the `RouteMap` call it used to be written inline in, because
   * the stepper has to step through EXACTLY what is on the map. Two expressions that
   * happen to agree today is how "3 of 26" ends up pointing at an echo with no pin.
   *
   * Overview means show me the lot, and while roaming that is the whole library rather
   * than what happens to be in reach. It is the answer to "where are they then" from
   * somewhere with nothing nearby, and without it the button framed an empty street: the
   * map had only ever been given the engine's nearby list, which on that screen is empty
   * by definition.
   *
   * Done here rather than by widening the engine's radius, because the radius also
   * decides what the hum sings and what the rose draws, and looking at a map of the world
   * should not put four hundred voices in somebody's ears.
   */
  const onMap = useMemo(
    () =>
      roaming
        ? (overview ? LIBRARY : state.nearby.map((n) => n.echo)).filter((e) =>
            activeCats.has(e.category),
          )
        : onRoute.filter((e) => activeCats.has(e.category)),
    [roaming, overview, state.nearby, activeCats, onRoute],
  );

  /**
   * The same list, nearest first, which is the order the stepper moves in.
   *
   * Distance order rather than library order, because the next item then has a meaning: it
   * is the cheapest one to go and get. Library order would be an order about the database.
   *
   * With no position fix there is nothing to measure from, so it keeps the map's own
   * order and says no distance rather than inventing one.
   */
  const stepList = useMemo(() => {
    const from = state.position?.at ?? null;
    const items = onMap.map((echo) => ({
      echo,
      distanceKm: from ? distanceKm(from, echo.point.at) : null,
    }));
    if (from) items.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
    return items;
  }, [onMap, state.position]);

  /**
   * The echo the arrows are looking at.
   *
   * SEPARATE FROM `selectedId`, and the separation is the design rather than plumbing.
   * Stepping is LOOKING: the map brings the next echo to the middle and its pin blooms,
   * and nothing else happens. Tapping the card, or tapping a pin, is CHOOSING, and that
   * opens the echo.
   *
   * Collapsing the two was the first attempt and it broke itself immediately: selecting
   * opens the detail popup, the popup covers the bottom of the screen, and the bottom of
   * the screen is where the arrows are — so pressing next once made it impossible to
   * press next again. Measured in a browser, as a click that timed out on "popup
   * intercepts pointer events".
   *
   * It also means tapping a pin must not move the map. The thing you just aimed at
   * jumping to the centre under your thumb takes the ground you were reading with it.
   */
  const [focusId, setFocusId] = useState<string | null>(null);

  /**
   * Where the stepper is, derived from the selection rather than held beside it.
   *
   * Two sources of truth for "which echo are we on" is how a stepper and a map stop
   * agreeing: tap a pin and the arrows carry on from somewhere else. The selection IS
   * the position, so tapping a pin moves the stepper to it for free.
   */
  const stepIndex = useMemo(() => {
    const on = focusId ?? selectedId;
    return on ? stepList.findIndex((i) => i.echo.id === on) : -1;
  }, [stepList, focusId, selectedId]);

  /** What the ears and the dial are both fed. One list, so they can never disagree. */
  const around = useMemo(
    () =>
      nearby.map((n) => ({
        echo: n.echo,
        bearingDeg: n.bearingDeg,
        distanceKm: n.distanceKm,
        sealed: stateOf(n.echo.id) === "sealed",
      })),
    [nearby, stateOf],
  );

  /**
   * The nearest echo anywhere, and whether looking further would turn anything up.
   *
   * Measured against the whole library rather than the engine's nearby list, because the
   * whole point is to answer a question the nearby list cannot: it is empty, and the
   * listener wants to know why. Eligibility is applied, so a child is never told the
   * nearest thing to them is one they are not allowed to hear.
   *
   * Only computed when there is nothing in range, which is the only time anything asks.
   */
  const WIDEN_TO_KM = 16;
  const nowhere = roaming && state.nearby.length === 0;
  const nearestAnywhere = useMemo(() => {
    if (!nowhere) return null;
    const from = state.position?.at ?? null;
    if (!from) return null;
    const listener = listenerFor(kids, optIns);
    let best: { echo: Echo; distanceKm: number } | null = null;
    for (const echo of LIBRARY) {
      if (!checkEligibility(echo, { profile: listener, playAtMs: Date.now() }).eligible) continue;
      const km = distanceKm(from, echo.point.at);
      if (!best || km < best.distanceKm) best = { echo, distanceKm: km };
    }
    return best;
  }, [nowhere, state.position, kids]);

  /**
   * Whether the arrows are up, named because the map has to know too.
   *
   * Not while the "nothing nearby" panel is up, which is already a full screen answering
   * the same question, and not while the sheet is open past a peek, because the sheet IS
   * a list of the same echoes and two ways to walk one list is worse than either.
   *
   * And not on the rose, which is drawn OVER the map rather than instead of it — so the
   * stepper was still mounted under it, invisible, reserving its hundred pixels and
   * pushing the control column into the tab bar. The audit caught it: "Zoom in is 38px
   * under the tab bar (walk/rose)". The rose is its own way of moving between echoes and
   * does not want a second one underneath.
   */
  const showStepper =
    !showingRose &&
    !(nowhere && !overview) &&
    (!(!nowhere || nowPlaying !== null) || detent === "peek");

  /**
   * What walk mode is pointing at.
   *
   * `around` first, because the engine already measured the bearing and the distance for
   * everything in range, and two answers to one question is how a screen stops meaning
   * anything. The fallback matters though: the beacon can be set from a map pin, and the
   * map draws the whole corridor rather than only what is within reach, so somebody can
   * perfectly well be walking to something a mile off that `around` has never heard of.
   * Then it gets measured here. With no fix there is nothing to point at, so walk mode
   * does not open at all rather than pointing north at a guess.
   */
  const walkTarget = useMemo(() => {
    if (!beacon) return null;
    const near = around.find((a) => a.echo.id === beacon);
    if (near) return near;
    const echo = LIBRARY.find((e) => e.id === beacon);
    const from = state.position?.at ?? null;
    if (!echo || !from) return null;
    return {
      echo,
      distanceKm: distanceKm(from, echo.point.at),
      bearingDeg: bearingTo(from, echo.point.at),
      sealed: stateOf(echo.id) === "sealed",
    };
  }, [beacon, around, state.position, stateOf]);

  /*
   * Feeding the hum.
   *
   * Three separate effects rather than one, because they change at completely different
   * rates: the heading many times a second, the voices on every position fix, and the mute
   * only when somebody presses something. One effect would rebuild the world on every
   * compass wobble.
   */
  useEffect(() => {
    hum.setMuted(!humming || !onFoot || nowPlaying !== null);
  }, [hum, humming, onFoot, nowPlaying]);
  useEffect(() => {
    hum.setHeading(heading.accuracyDeg <= 45 ? heading.deg : null);
  }, [hum, heading.deg, heading.accuracyDeg]);
  useEffect(() => {
    hum.setBeacon(beacon);
  }, [hum, beacon]);
  /*
   * Arriving is the end of the walk, so it is the end of the beacon.
   *
   * Leaving it set would keep one note loud and every other one ducked while standing on the
   * thing you were walking to, which is the app still pointing at somewhere you already are.
   *
   * *Arriving*, specifically, and not "no longer sealed". There are four pin states and the
   * middle one, `opening`, means you are inside the radius with the dwell still running,
   * which is the last few seconds of the walk rather than the end of it. Written as "not
   * sealed" this cleared the beacon the instant it was set on anything you were already
   * standing near, which looked exactly like the button not working.
   */
  useEffect(() => {
    if (!beacon) return;
    const state = stateOf(beacon);
    if (state === "captured" || state === "heard") {
      setBeacon(null);
      // The map was opened to get you here. You are here, so it has done its job and the
      // hunting screen comes back rather than leaving you on a street map of where you are.
      setWalkingView("rose");
    }
  }, [beacon, stateOf]);
  useEffect(() => {
    hum.setVoices(
      around.map((item) => ({
        id: item.echo.id,
        category: item.echo.category,
        bearingDeg: item.bearingDeg,
        distanceKm: item.distanceKm,
        reachKm: effectiveRadiusKm(item.echo),
        sealed: item.sealed,
      })),
    );
  }, [hum, around]);

  return (
    <div className="stage">
      <div className="phone">
        <div className={selfDirected ? "screen" : "screen stack-noguide"}>
          <div className="statusbar">
            <span className="mono">10:42</span>
            <span className="mono dim">{MODE_PHRASE[route.mode] ?? route.mode}</span>
          </div>

          {/*
            Walk mode, over everything, when there is somewhere to go.

            It is the whole screen rather than a layer on the map because the point of it
            is what is NOT lit: a map under it would be the lit surface the wake lock was
            added to survive.
          */}
          {tab === "map" && onFoot && walkingView === "walk" && walkTarget && (
            <Walk
              echo={walkTarget.echo}
              distanceKm={walkTarget.distanceKm}
              bearingDeg={walkTarget.bearingDeg}
              /*
                A heading we do not trust is not a heading. The rose draws a wide cone and
                lets you judge it; walk mode turns a heading into the word "right", which
                is a claim rather than a picture, so below the same 45 degree bar it says
                it has no compass instead of pointing confidently at nothing.
              */
              headingDeg={heading.accuracyDeg <= 45 ? heading.deg : null}
              needsCompass={heading.needsPermission}
              onAskCompass={() => void heading.ask()}
              playsItself={session.playsOnArrival(walkTarget.echo)}
              syncedNearby={around.filter((a) => !a.sealed).length}
              totalNearby={around.length}
              awakeNote={wake === "held" ? screenAwakeNote(awake) : ""}
              awakeWarning={
                wake === "held"
                  ? ""
                  : wake === "unsupported"
                    ? "Keep the app on screen: this browser cannot stop the phone sleeping."
                    : "The phone may sleep. Keep the screen on and it will keep tracking."
              }
              /*
                And close the popup on the way. "Show the map" from a walk left the target's
                own card open over the map, and that card covers the control column down the
                right hand side — including the one fab that leads back to the walk. Running
                it is what showed it: the only route out of the map was the one the map had
                buried.
              */
              onMap={() => {
                setSelectedId(null);
                setWalkingView("map");
              }}
              onEnd={() => {
                setBeacon(null);
                setWalkingView("rose");
              }}
            />
          )}

          {/*
            Not while there is nothing nearby. The rose's whole content is what is around
            you, so with nothing around it is an empty dial with a hum switch under it,
            drawn over the screen that exists to explain the emptiness and offer a way out
            of it. Two answers to one question, and the useless one was on top.
          */}
          {tab === "map" && onFoot && walkingView === "rose" && !nowhere && (
            <Rose
              items={around}
              headingDeg={heading.deg}
              accuracyDeg={heading.accuracyDeg}
              needsCompass={heading.needsPermission}
              onAskCompass={() => void heading.ask()}
              selectedId={selectedId}
              beaconId={beacon}
              onSelect={setSelectedId}
              humming={humming}
              onHum={setHumming}
              /*
                The note reports what the SCREEN IS DOING, not what we asked it to do.
                Those came apart the first time this was tested: the request is refused
                in a headless browser, at low battery, and in any Safari tab that is not
                an installed home screen app, and the app cheerfully said "screen staying
                on" over a phone that was about to sleep. A promise the device is not
                keeping is worse than no promise, so a refusal says so and tells the
                listener the one thing they can still do about it.
              */
              awakeNote={wake === "held" ? screenAwakeNote(awake) : ""}
              awakeWarning={
                !walkingNow || wake === "held"
                  ? ""
                  : wake === "unsupported"
                    ? "Keep the app on screen: this browser cannot stop the phone sleeping."
                    : "The phone may sleep. Keep the screen on and it will keep tracking."
              }
            />
          )}

          {tab === "map" && (
            <>
              <div className="mapbar">
                {/*
                  The journey, and the way to change it.

                  It was a read-only header, and the only way to the journey screen was a
                  download icon in the control column, which nobody would guess and which
                  does not look like a question about how you are getting around. This is
                  where every travel app puts it: the trip is at the top, and tapping the
                  trip changes the trip.

                  Roaming has no origin, destination or ETA, and inventing one would be the
                  fiction the whole UX review was about, so it gets a plain chip saying what
                  it is. Same slot, same tap, nothing made up.
                */}
                <button
                  className={roaming ? "journey-tap journey-roam" : "journey-tap"}
                  onClick={openPackage}
                  aria-label="Change your journey"
                >
                  {roaming ? (
                    <>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        {MODE_ICON[roamMode]}
                      </svg>
                      {roamMode === "driving" ? "Driving, no route" : "On foot, around here"}
                      <span className="journey-change">Change</span>
                    </>
                  ) : (
                    <>
                      <RouteRibbon route={route} progress={along} remainingS={remainingS} />
                    </>
                  )}
                </button>
                <CategoryChips
                  available={available}
                  on={activeCats}
                  onToggle={toggleCategory}
                  onAll={allCategories}
                />
              </div>
              {/*
                Nothing nearby, over the map.

                Over rather than instead of, so the journey chip and the category chips
                above it stay reachable: the map is where you change what you are looking
                for, and burying it would leave nowhere to go from the screen whose whole
                job is to give you somewhere to go.

                Shown on `state.nearby` rather than the filtered `around`, which is the
                difference between "there is nothing here" and "you switched everything
                off". The second is a filter and belongs in the chips, not behind a full
                screen that hides them.

                And not while the overview is up, because the overview is what its own
                primary button asks for: leaving it on top would have "show me where they
                are" replace this screen with itself.
              */}
              {nowhere && !overview && (
                <Nowhere
                  nearest={nearestAnywhere}
                  reachKm={session.nearbyReachKm}
                  onShowAll={() => setCityOpen(true)}
                  widenToKm={WIDEN_TO_KM}
                  {...(nearestAnywhere && nearestAnywhere.distanceKm <= WIDEN_TO_KM
                    ? { onWiden: () => setLookFurtherKm(WIDEN_TO_KM) }
                    : {})}
                />
              )}
              <RouteMap
                route={roaming ? null : route}
                mode={roaming ? roamMode : route.mode}
                library={onMap}
                position={state.position}
                opening={state.opening}
                stateOf={stateOf}
                selectedId={selectedId}
                onSelect={(id) => {
                  // A pin tap is a selection, not a request to move the map.
                  setFocusId(null);
                  setSelectedId(id);
                }}
                focusId={focusId}
                /* The stepper covers the bottom of the map, so the map has to know: it
                   keeps pins, edge markers and the Esri credit above it. */
                reservedBottom={showStepper ? STEPPER_H : 0}
                detent={detent}
                sheet={!nowhere || nowPlaying !== null}
                overview={overview}
                progress={along}
                theme={theme}
                zoom={zoom}
                onZoom={setZoom}
                pan={pan}
                onPan={setPan}
              />

              {/*
                STEP THROUGH THEM, nearest first.

                The map's own answer to "move from echo to echo" was to aim a thumb at a
                41px pin in a pile of twenty six, and zooming in to make that easier left
                zero of the twenty six on screen. Clustering made the pile hittable; this
                makes the aiming optional. Two targets that never move, at the bottom of
                the screen where a thumb already is.

                Hidden while the sheet is up past a peek, because the sheet IS a list of
                the same echoes and two ways to walk one list, one on top of the other, is
                worse than either. Hidden behind the "nothing nearby" panel too, which is
                already a full screen answering the same question.

                NOT hidden in the overview, which was the first guess and was wrong. The
                overview is exactly the screen where somebody has asked "where are they
                then" about a library spread from Manhattan to Miami — twenty six pins,
                fifteen of them in one pile — and stepping nearest first is the only
                answer on that screen that does not involve aiming at the pile.
              */}
              {showStepper && (
                <Stepper
                  items={stepList}
                  index={stepIndex}
                  onStep={(i) => {
                    const next = stepList[i];
                    if (!next) return;
                    // Looking, not choosing. No selection, so no popup over the arrows.
                    setSelectedId(null);
                    setFocusId(next.echo.id);
                  }}
                  /* Tapping the card is choosing rather than looking, and it opens the
                     echo exactly as tapping its pin does. */
                  onOpen={(echo) => {
                    setFocusId(null);
                    setSelectedId(echo.id);
                  }}
                />
              )}
              {/*
                No control column either. It carries the map toggle, recentre and download,
                which all act on echoes in reach, and with none in reach it had nothing to
                act on. It also sits centred in the band between the chips and the sheet,
                and with no sheet that band grew until the top fab landed on the journey
                chip's own Change button. Both gone at once: overview brings it back,
                because turning overview on is what takes this screen down.
              */}
              {(!nowhere || overview) && (
              <Rail
                zoom={zoom}
                onZoom={setZoom}
                minZoom={MIN_ZOOM}
                maxZoom={MAX_ZOOM}
                /* On foot only: the hum places echoes by bearing, and a bearing means
                   nothing at 500 knots. Carried modes never had it and still do not. */
                {...(onFoot ? { humming, onHum: setHumming } : {})}
                overview={overview}
                /*
                  Recentre is the way back from a drag, and it has to work even when the
                  overview is already where you want it: dragging the map and then tapping
                  recentre should put you back in the middle, not toggle the framing and
                  leave the offset in place.
                */
                onOverview={(next) => {
                  setPan({ x: 0, y: 0 });
                  setOverview(next);
                }}
                panned={pan.x !== 0 || pan.y !== 0}
                downloaded={downloaded}
                /*
                  Leaving the map hands back the WALK when there is one, and the survey
                  when there is not. Returning everybody to the rose meant that tapping
                  "Show the map" from a walk and then tapping back silently dropped you
                  out of the walk you were in the middle of.
                */
                {...(onFoot
                  ? {
                      roseView: walkingView,
                      roseBackLabel: beacon ? "Back to your walk" : "Back to what is around you",
                      onRoseView: () =>
                        setWalkingView((v) => (v === "map" ? (beacon ? "walk" : "rose") : "map")),
                    }
                  : {})}
                onDownload={openPackage}
                onCity={() => setCityOpen(true)}
              />
              )}
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
                  mode={roaming ? roamMode : route.mode}
                  saved={chosen.has(selectedEcho.echo.id)}
                  aimed={beacon === selectedEcho.echo.id}
                  {...(selfDirected
                    ? {
                        onAim: (echo: Echo) => {
                          /*
                           * Pick it, and the app becomes about getting there: the beacon is
                           * set, the hum ducks everything else, and the street map comes up,
                           * because a map with a destination on it is the right object and a
                           * map without one is the question nobody asked. Pressing it again
                           * lets go and hands the map back.
                           */
                          const already = beacon === echo.id;
                          setBeacon(already ? null : echo.id);
                          /*
                           * Walk mode, not the street map. Picking a destination used to
                           * hand over a lit map for the whole walk, which is the thing
                           * ADR-0001's wake lock exists to survive and the worst possible
                           * screen to hold on for it. The map is still one tap away from
                           * inside walk mode, for the moments you genuinely want streets.
                           */
                          setWalkingView(already ? "rose" : "walk");
                          setSelectedId(already ? null : echo.id);
                        },
                      }
                    : {})}
                  onSave={toggleSave}
                  onPlay={(echo) => {
                    playOrAsk(echo);
                    setSelectedId(null);
                    setListening(true);
                  }}
                  onClose={() => setSelectedId(null)}
                />
              ) : (
                selfDirected && <ProximityBar guidance={state.guidance} cue={state.cue} />
              )}
              {/*
                No sheet while there is nothing nearby, unless something is playing.

                The sheet's own empty state says "Nothing here yet" in grey at the bottom
                of the screen, which is the sentence the whole Nowhere screen exists to
                replace, and it would cover the two buttons that are the only way off it.
                A transport for something already playing is the one thing worth keeping,
                because losing it mid-echo would strand the audio with no way to stop it.
              */}
              {(!nowhere || nowPlaying) && (
              <Sheet
                nearby={nearby}
                lastCapture={state.lastCapture}
                captured={kept}
                stateOf={stateOf}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onPlay={(echo) => {
                  playOrAsk(echo);
                  setListening(true);
                }}
                isPlaying={(id) =>
                  state.playback.kind !== "idle" && state.playback.item.echo.id === id
                }
                onPause={() => session.pause()}
                onResume={() => {
                  /*
                   * Resuming a stopped echo is starting it, not un-pausing it.
                   *
                   * Stop cancels the utterance; there is nothing left to resume, so
                   * `session.resume()` would move the progress bar over silence. Stopped
                   * means back at the beginning, so play means play it.
                   */
                  if (stopped && nowPlaying) playOrAsk(nowPlaying);
                  else session.resume();
                  setStopped(false);
                }}
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
                onSeek={seekTo}
                detent={detent}
                onDetent={setDetent}
                onNext={() => session.skip()}
                stopped={stopped}
                voice={voice}
                onVoice={setVoice}
                onStop={() => {
                  /*
                   * Stop, not "be done with it". The audio stops, the playhead goes back to
                   * the start, and the echo stays exactly where it is, so pressing stop
                   * does not make the thing you pressed disappear.
                   */
                  session.stopPlaying();
                  if (nowPlaying) {
                    startedRef.current = { id: nowPlaying.id, at: Date.now() };
                  }
                  setPlayhead(0);
                  setStopped(true);
                }}
                rating={nowPlaying ? ratings[nowPlaying.id] : undefined}
                onRating={(r) => nowPlaying && rateEcho(nowPlaying.id, r)}
                {...(selfDirected ? { onCamera: setCamera } : {})}
                onSave={toggleSave}
              />
              )}
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
                playOrAsk(echo);
                setPlanOpen(false);
                setListening(true);
              }}
              onClose={() => setPlanOpen(false)}
            />
          )}

          {tab === "echoes" && (
            <Collection
              captured={kept}
              privacy={privacy}
              onPlay={(echo) => {
                playOrAsk(echo);
                setListening(true);
              }}
              onSettings={() => setTab("settings")}
              isPlaying={(id) =>
                state.playback.kind !== "idle" && state.playback.item.echo.id === id
              }
              isHeard={(id) => stateOf(id) === "heard"}
              saved={savedEchoes}
              onSave={toggleSave}
              mode={roaming ? roamMode : route.mode}
            />
          )}

          {tab === "settings" && (
            <Privacy
              onJourney={() => {
                setTab("echoes");
                openPackage();
              }}
              journey={
                roaming
                  ? roamMode === "driving"
                    ? "Driving, no route"
                    : "On foot, around here"
                  : (route.name ?? route.id)
              }
              settings={privacy}
              onChange={setPrivacy}
              storedPositions={storedPositions}
              collectionSize={kept.length}
              onDelete={onDelete}
              kids={kids}
              onKids={setKidsMode}
              theme={theme}
              onTheme={setTheme}
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
              /*
                What the onboarding chips show, which is NOT `activeCats`.
                
                `activeCats` resolves an untouched filter to the whole library, which is
                right for the map and wrong for the question. Passed here it lit all nine
                chips under the words "Pick as many as you like", so the step read
                backwards. Untouched here means nothing chosen yet.
              */
              cats={cats ?? EMPTY_CATS}
              onAllCats={() => setCats(ALL_CATEGORIES)}
              onToggleCats={(categories) =>
                setCats((current) => {
                  /*
                    During onboarding an untouched filter means NOTHING chosen, not
                    everything: the step is asking, so the first tap has to add rather
                    than subtract. Afterwards `null` still means all, which is why this
                    reads `current ?? (onboarded ? ALL : EMPTY)` rather than picking one.
                  */
                  const next = new Set(current ?? (onboarded ? ALL_CATEGORIES : []));
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
              onTestLine={() => playOrAsk(LIBRARY[0]!)}
              routes={ROUTES}
              onFlight={(routeId) => {
                const found = routeId ? ROUTES.find((r) => r.id === routeId) : undefined;
                roamRouteChosen.current = Boolean(found);
                if (found) onSelectRoute(found);
              }}
              onDone={({ roaming: roam, mode }) => {
                /*
                 * Driving without a route still roams, and still has to be driving.
                 * Roaming used to imply walking, so a driver hunting for echoes was run at
                 * walking pace with a three hundred metre corridor and a rule that asked
                 * them to stand still. `roamMode` keeps the two apart.
                 */
                setRoaming(roam || (mode === "driving" && !roamRouteChosen.current));
                setTravel(mode);
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
              /*
               * How you are travelling, changeable here and nowhere else until now.
               *
               * Switching to flying clears the route rather than carrying a walk over into
               * the air: a flight is chosen by number, and leaving the old journey selected
               * would mean "Carry on" quietly putting somebody back on a pavement.
               */
              travel={travel}
              onTravel={(next) => {
                setTravel(next);
                /*
                 * Back to the rose.
                 *
                 * `walkingView` is set to "map" by "Take me there" and nothing ever set it
                 * back, so one use of the beacon meant the rose never returned: you picked
                 * "Around here, no route", pressed Carry on, and got the same street map you
                 * had been trying to leave. Changing how you are travelling starts the
                 * walking screen over.
                 */
                setWalkingView("rose");
                setBeacon(null);
                setLookFurtherKm(undefined);
                // Flying is somebody else's route and the door is locked, so there is
                // nothing to roam. On foot and driving both land on roaming, because
                // hunting is the thing you do without a route and it is the common case.
                setRoaming(next !== "flight");
              }}
              roaming={roaming}
              onRoam={(on) => {
                setRoaming(on);
                // Same reason: choosing to roam is choosing the hunting screen.
                if (on) {
                  setWalkingView("rose");
                  setBeacon(null);
                }
              }}
              onChoose={() => setPlanOpen(true)}
              onClose={() => setPackageOpen(false)}
              onStart={(next) => {
                if (!roaming && next.id !== route.id) onSelectRoute(next);
                setDownloaded(true);
                setPackageOpen(false);
                setOverview(false);
              }}
            />
          )}

          {/*
            The city, over the map. Its own screen with its own way out, so nothing under
            it has to stay reachable.
          */}
          {cityOpen && (
            <City
              library={LIBRARY}
              at={state.position?.at ?? null}
              theme={theme}
              onClose={() => setCityOpen(false)}
              onGo={(cluster) => {
                /*
                  Going somewhere is looking far enough to see it. Without this, tapping a
                  cluster four hundred kilometres away closed the city and handed back the
                  same empty street: the engine's reach had not moved, so neither had the
                  map. The reach becomes whatever it takes to hold that cluster, with its
                  own spread added so the far edge is in too.
                */
                const from = state.position?.at ?? null;
                const need = from ? distanceKm(from, cluster.at) + cluster.spreadKm : 0;
                setLookFurtherKm(Math.max(WIDEN_TO_KM, Math.ceil(need * 1.1)));
                setCityOpen(false);
                setTab("map");
                setOverview(true);
                /*
                  And the street map, not the rose. On foot the resting screen is the rose,
                  which covers the map, so "Go" closed the city and handed back the same
                  dial you were looking at before — the overview went on underneath where
                  nobody could see it. Going somewhere means being shown it.
                */
                setWalkingView("map");
                setBeacon(null);
              }}
            />
          )}

        {/*
          Hearing it, over everything but the sync moment.

          It leaves the tab bar showing, because it is a state of the app rather than a modal:
          you can walk away from an echo into My Echoes and it keeps playing. The sync moment
          sits above it, since arriving somewhere new outranks listening to somewhere old.
        */}
        {/*
          INSIDE THE PHONE, and it was not.

          This sat as a sibling of `.phone`, so its `position: absolute; inset: 0`
          resolved against the whole window. On a phone that is the same rectangle and it
          looked right; on a laptop the sync moment spread across two thousand pixels
          while every other screen stayed in its 390px frame, with "Keep it for later" as
          a button the width of the desk. Invisible in every render I had taken, because
          every render I had taken was 390 wide.
        */}
        {syncedNow && (
          <Synced
            event={syncedNow}
            onListen={() => {
              playOrAsk(syncedNow.echo);
              setSyncedNow(null);
              setListening(true);
            }}
            onLater={() => setSyncedNow(null)}
          />
        )}

        {/*
          The ask, over everything.

          Above the listening screen because it is the reason that screen did not open,
          and it has to be dismissible back to exactly where somebody was. It does not
          take the tab bar away: "not now" should never be the only exit from a screen
          about money.
        */}
        {paywallFor && (
          <Paywall
            echo={paywallFor}
            heardCount={new Set(heardIds).size}
            onBuy={() => {
              /*
                Where Stripe Checkout goes.

                Today it unlocks locally and immediately, which is the honest stub: there
                is no Checkout session to open, no webhook to hear back from and no
                account to attach the result to (`docs/03-selling.md`). The shape is the
                real one though — the app asks, something outside it decides, and the
                answer comes back as an Entitlement — so the redirect slots in here
                without any other screen changing.
              */
              setEntitlement(unlock());
              const echo = paywallFor;
              setPaywallFor(null);
              session.play(echo);
            }}
            onClose={() => setPaywallFor(null)}
          />
        )}

        {listening && nowPlaying && (
          <Ribbon
            echo={nowPlaying}
            progress={progress}
            playing={playing}
            durationS={(simple ? nowPlaying.simple?.durationS : null) ?? nowPlaying.durationS}
            saved={chosen.has(nowPlaying.id)}
            onSave={() => toggleSave(nowPlaying)}
            onPlayPause={() => {
              /*
                Stopped is not paused. Stop cancelled the utterance, so there is nothing to
                resume and `session.resume()` would walk the playhead over silence — the
                same distinction the sheet's transport already makes.
              */
              if (playing) session.pause();
              else if (stopped) playOrAsk(nowPlaying);
              else session.resume();
            }}
            onSeek={seekTo}
            /*
              Fifteen seconds as a fraction, because the playhead is a clock rather than a
              decoder position. Signed, so one handler serves both buttons.
            */
            onNudge={(seconds) => {
              const d = (simple ? nowPlaying.simple?.durationS : null) ?? nowPlaying.durationS;
              if (d > 0) seekTo(progressRef.current + seconds / d);
            }}
            simple={simple}
            /*
              Everything below was already in this component and already wired to the
              SHEET's player. The full-screen player was a strict subset of the small one,
              which is what "what happened to all the audio controls" was pointing at: not
              a rendering bug, a screen that never got the props.
            */
            onSimple={setSimple}
            rate={rate}
            onRate={setRate}
            onRestart={() => seekTo(0)}
            onNext={() => session.skip()}
            onClose={() => setListening(false)}
          />
        )}

          <Nav
            tab={tab}
            /*
              Leaving by the tab bar closes the listening screen.
              
              It used to only set `tab`, under the comment that hearing an echo is a state
              of the app rather than a modal and you can walk away into My Echoes while it
              keeps playing. That was the right intent and the wrong code: `Ribbon` renders
              on `listening` alone, never on the tab, so the overlay stayed over the top and
              tapping My Echoes changed a variable and nothing else. The tab bar looked
              broken because from that screen it WAS broken.
              
              The playback is untouched — `session` keeps going and the sheet's own
              transport picks it up — so the intent survives. Only the full-screen view goes.
            */
            onChange={(next) => {
              setTab(next);
              setListening(false);
            }}
            foundCount={kept.length}
          />
          <div className="homebar" />
        </div>
      </div>

      {/*
        THE HARNESS, and it is not the product.

        Everything below the mode switcher is scaffolding: several hundred words of
        engineering commentary about `WalkSession` and `MODE_PRESETS`, written so somebody
        reading the code could drive the app from a desk. That made complete sense while
        the only people opening this were building it.

        It stopped making sense the moment the link went to somebody to TEST. Below about
        a thousand pixels the commentary reflows UNDER the phone, so scrolling past the
        app lands you in a wall of documentation about the thing you were just using —
        which is exactly what happened, and the reaction was "why am I able to see this".

        So the prose is behind `?dev` now. The mode switcher stays, because switching to
        Air or Car is a real thing to test. And on a narrow window the whole aside goes,
        because on a phone the app IS the product.
      */}
      <aside className={dev ? "notes notes-dev" : "notes"}>
        <b>ECHO FINDERS</b>
        <ModePicker
          routes={ROUTES}
          selected={route}
          onSelect={onSelectRoute}
          counts={corridorCounts}
        />
        <p className="routename">{route.name ?? route.id}</p>
        {dev && (
          <>
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
          </>
        )}
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
