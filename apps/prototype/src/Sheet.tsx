/**
 * The bottom sheet: what just opened, and what is around you.
 *
 * Keeps the prototype's three-detent instinct — the sheet is the browsing surface and the
 * map is the app — but the header is gone. On foot a progress bar to a destination is
 * meaningless, and the space is better spent on what is near.
 */

import type { CaptureEvent, Echo, NearbyEcho } from "@echofinders/core";
import { rarityOf, rarityReasons } from "@echofinders/core";
import type { PinState } from "./RouteMap";
import type { Rating } from "./ratings";
import { UpNext } from "./UpNext";
import { EchoCard } from "./EchoCard";
import { PlateStrip } from "./PlateStrip";
import { Player } from "./Player";
import { Transcript } from "./Transcript";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { splitScript, stepLine } from "./transcript-lines";
import { CATEGORY_LABEL } from "./categories";
import type { Upcoming } from "@echofinders/core";

interface Props {
  readonly nearby: readonly NearbyEcho[];
  readonly lastCapture: CaptureEvent | null;
  readonly captured: readonly CaptureEvent[];
  readonly stateOf: (echoId: string) => PinState;
  readonly selectedId: string | null;
  readonly onSelect: (echoId: string) => void;
  /** Start this echo. Finding one is collecting it; playing it is a separate decision. */
  readonly onPlay: (echo: Echo) => void;
  /** Whether this echo is the one currently in the listener's ears. */
  readonly isPlaying: (echoId: string) => boolean;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly paused: boolean;
  /** What is ahead on this route. Offered, never started.  */
  readonly upcoming: readonly Upcoming[];
  readonly selfDirected: boolean;
  readonly autoPlay: boolean;
  readonly saved: ReadonlySet<string>;
  /**
   * Every saved echo on this route, with its distance — not the saved ones that happen to
   * be within reach.
   *
   * The tab was filtering the *nearby* list, so its own counter said three and the list
   * below it showed nothing: the things you saved are, by definition, mostly the things
   * you have not got to yet.
   */
  readonly savedNearby: readonly SavedEcho[];
  /** How many echoes this route passes at all, so the idle line can say what is left. */
  readonly onRouteCount: number;
  readonly onSave: (echo: Echo) => void;
  /** What is in the listener's ears, if anything, and how far through it is. */
  readonly nowPlaying: Echo | null;
  readonly progress: number;
  readonly playing: boolean;
  readonly simple: boolean;
  readonly onSimple: (on: boolean) => void;
  readonly rate: number;
  readonly onRate: (rate: number) => void;
  readonly onSeek: (fraction: number) => void;
  readonly onNext: () => void;
  readonly onStop: () => void;
  readonly rating: Rating | undefined;
  readonly onRating: (rating: Rating) => void;
  /** Open the camera on an echo. Only where there is one — a flight has no then-and-now. */
  readonly onCamera?: (echo: Echo) => void;
  /** How much of the screen the sheet takes. Lifted, because the map has to know. */
  readonly detent: Detent;
  readonly onDetent: (detent: Detent) => void;
}

export type Detent = "peek" | "half" | "full";

/** An echo on the saved list, and how far off it is. All a card needs. */
export interface SavedEcho {
  readonly echo: Echo;
  readonly distanceKm: number;
}

export function Sheet({
  nearby,
  lastCapture,
  captured,
  stateOf,
  selectedId,
  onSelect,
  onPlay,
  isPlaying,
  onPause,
  onResume,
  paused,
  upcoming,
  selfDirected,
  autoPlay,
  saved,
  savedNearby,
  onRouteCount,
  onSave,
  nowPlaying,
  progress,
  playing,
  simple,
  onSimple,
  rate,
  onRate,
  onSeek,
  onNext,
  onStop,
  rating,
  onRating,
  onCamera,
  detent,
  onDetent,
}: Props) {
  const [tab, setTab] = useState<"near" | "script" | "saved">("near");
  /**
   * Which row is showing its detail. One at a time, held here rather than in the card.
   *
   * Two open rows is two thirds of the sheet gone and the scanning problem back, so the
   * list owns the choice. Tapping the open row closes it, which is the only way out that
   * does not need a second control.
   */
  const [openId, setOpenId] = useState<string | null>(null);
  const toggleOpen = (id: string) => setOpenId((current) => (current === id ? null : id));

  /**
   * The list holds still while a row is open.
   *
   * Ordering it along the route (see `App`) stops rows swapping places, but membership
   * still changes as echoes come into and go out of range, and the worst version of that
   * is the row somebody has just opened to read disappearing out from under them. While
   * one is open the list is whatever it was at the moment it opened; close it and the live
   * list comes straight back.
   */
  const frozen = useRef<readonly NearbyEcho[] | null>(null);
  if (openId === null) frozen.current = null;
  else frozen.current ??= nearby;
  const liveNearby = frozen.current ?? nearby;

  /**
   * How much of the screen the sheet is taking.
   *
   * The grab handle has been drawn at the top of this sheet since the first version and has
   * never done anything, which is worse than not drawing it: it is the universal signal for
   * "pull me", and a sheet that shows the affordance and then holds still teaches people
   * the screen is broken. On a phone it left about a hundred pixels of map, which is the
   * same as no map.
   *
   * Three detents rather than two, because the sheet has three jobs and they want different
   * amounts of room: seeing where you are, reading what just opened, and working through
   * the list.
   */
  const setDetent = onDetent;
  const drag = useRef<{ startY: number; startH: number } | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  /**
   * Which echo the transcript is showing.
   *
   * It used to be "whatever is playing, or nothing", with the tab disabled the rest of the
   * time — so tapping Transcript with nothing playing did nothing at all, which reads as a
   * broken tab rather than as a considered restriction. And the restriction was wrong
   * anyway: the transcript is the accessible surface for this product (ADR-0001). Somebody
   * who cannot hear the audio, or is in a quiet carriage, wants to *read* the echo, and
   * requiring them to start narration they will not listen to before they may read it is
   * exactly backwards.
   *
   * So it follows what is playing, then what is selected on the map, then the last thing
   * found. Only genuinely empty when none of those exist.
   */
  const scriptEcho =
    nowPlaying ??
    nearby.find((n) => n.echo.id === selectedId)?.echo ??
    lastCapture?.echo ??
    null;
  const view = tab === "script" && !scriptEcho ? "near" : tab;
  /*
   * The same lines the transcript shows, so the player's line buttons step by one of them.
   * Split once per script rather than on every press.
   */
  const lines = useMemo(() => {
    const script = (simple ? nowPlaying?.simple?.script : nowPlaying?.script) ?? nowPlaying?.script;
    return script ? splitScript(script) : [];
  }, [nowPlaying, simple]);
  /*
   * The nearest one, which is what the resting row shows.
   *
   * By distance, not by position along the route: the list is ordered along the route so it
   * holds still as you walk, and that ordering is right for a list and wrong for "which one
   * am I closest to".
   */
  const next = useMemo(() => {
    let best: NearbyEcho | null = null;
    for (const candidate of liveNearby) {
      if (!best || candidate.distanceKm < best.distanceKm) best = candidate;
    }
    return best;
  }, [liveNearby]);

  const savedCards = savedNearby;

  /**
   * Peek is exactly one row tall, measured rather than guessed.
   *
   * It was 132px, a number picked once against one of the two things that can be in that
   * row. The other one is shorter, so at rest there was sixty-odd pixels of empty panel
   * between the echo and the tab bar: the sheet looked like a drawer that had failed to
   * close rather than like a bar.
   *
   * Measured from the top of the sheet to the bottom of whichever block is showing, plus
   * the sheet's own padding. That block keeps its height at every detent — at peek the CSS
   * hides what is below it rather than resizing it — so this is right whichever detent we
   * happen to be at when it runs, and it stays right when the title wraps to two lines or
   * the row gains something.
   */
  const sheetRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    const screen = sheet?.parentElement;
    if (!sheet || !screen) return;

    const measure = () => {
      const row = sheet.querySelector(".phead, .now-top");
      if (!row) return;
      const pad = parseFloat(getComputedStyle(sheet).paddingBottom) || 0;
      const height =
        row.getBoundingClientRect().bottom - sheet.getBoundingClientRect().top + pad;
      if (height > 0) screen.style.setProperty("--peek-h", `${Math.round(height)}px`);
    };

    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(sheet);
    const row = sheet.querySelector(".phead, .now-top");
    if (row) observer.observe(row);
    return () => observer.disconnect();
  });

  return (
    <div
      ref={sheetRef}
      className={`sheet sheet-${detent}${nowPlaying ? " sheet-playing" : ""}`}
      style={dragging === null ? undefined : { height: `${dragging}px` }}
    >
      {/*
        The whole header is the handle, not the 4px bar. A grab target the size of a
        matchstick is a grab target for a mouse.
      */}
      <div
        className="grab-zone"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const sheet = e.currentTarget.parentElement as HTMLElement;
          drag.current = { startY: e.clientY, startH: sheet.getBoundingClientRect().height };
          setDragging(drag.current.startH);
        }}
        onPointerMove={(e) => {
          const from = drag.current;
          if (!from) return;
          // Up is negative on screen and taller for a sheet, hence the flip.
          const next = from.startH + (from.startY - e.clientY);
          setDragging(Math.max(120, Math.min(window.innerHeight * 0.88, next)));
        }}
        onPointerUp={(e) => {
          const from = drag.current;
          drag.current = null;
          if (from === null || dragging === null) return;
          e.currentTarget.releasePointerCapture(e.pointerId);
          // A tap is not a drag. Under a few pixels of travel, cycle instead — the handle
          // should answer a tap, which is what most people try first.
          const moved = Math.abs(dragging - from.startH);
          setDetent(moved < 6 ? nextDetent(detent) : nearestDetent(dragging));
          setDragging(null);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragging(null);
        }}
      >
        <div className="grab" />
      </div>

      {lastCapture && !nowPlaying ? (
        <Found
          capture={lastCapture}
          playing={isPlaying(lastCapture.echo.id)}
          paused={paused}
          onPlay={onPlay}
          onPause={onPause}
          onResume={onResume}
          saved={saved.has(lastCapture.echo.id)}
          onSave={onSave}
          {...(onCamera ? { onCamera } : {})}
        />
      ) : nowPlaying ? null : next ? (
        <NextUp
          echo={next.echo}
          distanceKm={next.distanceKm}
          /* Synced echoes are yours anywhere. On a route that carries you the package came
             down before you left, so everything on it plays. */
          playable={!selfDirected || stateOf(next.echo.id) !== "sealed"}
          saved={saved.has(next.echo.id)}
          onPlay={onPlay}
          onSave={onSave}
          onOpen={onSelect}
        />
      ) : (
        <Empty selfDirected={selfDirected} />
      )}

      {/*
        The player is always here, at every height, and the sheet reveals it as it rises.
        That is the design's own mechanism and it is better than the two components I had:
        at peek `theme.css` hides everything below the top row, so what is left is a
        compact now-playing bar over a full screen of map, and swiping up turns the same
        element into the full transport without anything being swapped underneath you.

        It also retires the floating row I had built over the map. One player, one place.
      */}
      {nowPlaying && (
        <Player
          echo={nowPlaying}
          onPlayPause={playing ? onPause : onResume}
          saved={saved.has(nowPlaying.id)}
          onSave={() => onSave(nowPlaying)}
          progress={progress}
          playing={playing}
          simple={simple}
          onSimple={onSimple}
          rate={rate}
          onRate={onRate}
          onSeek={onSeek}
          onLine={(delta) => onSeek(stepLine(lines, progress, delta))}
          onNext={onNext}
          onStop={onStop}
          rating={rating}
          onRating={onRating}
        />
      )}

      <div className="segs">
        <button
          className={view === "near" ? "seg on" : "seg"}
          onClick={() => setTab("near")}
          aria-pressed={view === "near"}
        >
          Around you
        </button>
        <button
          className={view === "script" ? "seg on" : "seg"}
          onClick={() => setTab("script")}
          aria-pressed={view === "script"}
          disabled={!scriptEcho}
        >
          Transcript
        </button>
        <button
          className={view === "saved" ? "seg on" : "seg"}
          onClick={() => setTab("saved")}
          aria-pressed={view === "saved"}
        >
          Saved<span className="seg-count">{saved.size}</span>
        </button>
      </div>

      {view === "script" && scriptEcho && (
        <Transcript
          echo={scriptEcho}
          simple={simple}
          /* A line's position only means anything for the echo actually being narrated.
             Reading somebody else's transcript, nothing is highlighted, which is correct. */
          progress={scriptEcho.id === nowPlaying?.id ? progress : 0}
          onSeek={
            scriptEcho.id === nowPlaying?.id
              ? onSeek
              : // Tapping a line in an echo that is not playing starts it. Jumping to a
                // position in silence would be a control with nothing to control.
                () => onPlay(scriptEcho)
          }
        />
      )}

      {view !== "script" && <UpNext items={view === "near" ? upcoming : []} onPlay={onPlay} />}

      {/*
        Progress, where it costs nothing.
        It used to be the whole resting row, which is how a status line ended up occupying
        the most valuable strip in the app. It is a label above the list now: the same two
        numbers, in the place people look when they want to know how much is left.
      */}
      {view === "near" && onRouteCount > 0 && (
        <p className="list-progress">
          {captured.length} synced
          {onRouteCount > captured.length && <> · {onRouteCount - captured.length} to go</>}
          {autoPlay && <> · playing as you reach them</>}
        </p>
      )}

      {view !== "script" && (
      <div className="list">
        {(view === "saved" ? savedCards : liveNearby.slice(0, 5)).map((entry) => (
          <EchoCard
            key={entry.echo.id}
            echo={entry.echo}
            distanceM={entry.distanceKm * 1000}
            sealed={stateOf(entry.echo.id) === "sealed"}
            selected={selectedId === entry.echo.id}
            playing={isPlaying(entry.echo.id)}
            open={openId === entry.echo.id}
            onOpen={toggleOpen}
            saved={saved.has(entry.echo.id)}
            onPlay={onPlay}
            onSave={onSave}
            onSelect={onSelect}
            {...(onCamera ? { onCamera } : {})}
          />
        ))}
        {view === "near" && liveNearby.length === 0 && (
          <p className="empty">Nothing within reach. Keep walking.</p>
        )}
        {view === "saved" && savedCards.length === 0 && (
          <p className="empty">Nothing saved on this route yet.</p>
        )}
      </div>
      )}
    </div>
  );
}

/**
 * What was just found, and the button that starts it.
 *
 * Finding and hearing are separate acts, and the button is where the second one lives.
 * Capture-by-arrival (ADR-0010) means an echo collects itself as you walk up to it — that
 * is the game — but narration is something a listener chooses. Starting it unasked would
 * talk over a conversation, a podcast, or somebody standing in a memorial.
 */
function Found({
  capture,
  playing,
  paused,
  onPlay,
  onPause,
  onResume,
  saved,
  onSave,
  onCamera,
}: {
  capture: CaptureEvent;
  playing: boolean;
  paused: boolean;
  onPlay: (echo: Echo) => void;
  onPause: () => void;
  onResume: () => void;
  saved: boolean;
  onSave: (echo: Echo) => void;
  onCamera?: (echo: Echo) => void;
}) {
  const rarity = rarityOf(capture.echo);
  const reasons = rarityReasons(capture.echo);
  const showPause = playing && !paused;

  return (
    <div className="now">
      <div className="now-top">
        <button
          className="play"
          aria-label={showPause ? "Pause" : "Play"}
          onClick={() => (showPause ? onPause() : playing ? onResume() : onPlay(capture.echo))}
        >
          {showPause ? (
            <svg viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" rx="1.2" />
              <rect x="14" y="4" width="4" height="16" rx="1.2" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <div className="now-text">
          <span className={`tag tag-${rarity}`}>Synced · {rarity}</span>
          <h2>{capture.echo.title}</h2>
          {/* Place and length on one line, because the decision this row exists to support
              is whether to listen now, and that is a question about both. */}
          <p>
            {capture.echo.point.place} · {clock(capture.echo.durationS)}
            {reasons.length > 0 && <> · {reasons[0]!.toLowerCase()}</>}
          </p>
        </div>

        {/*
          Keeping it is a separate act from hearing it, and it is the one with a deadline:
          walk on and the row is replaced by the next thing you find.
        */}
        <button
          className={saved ? "now-mark on" : "now-mark"}
          onClick={() => onSave(capture.echo)}
          aria-pressed={saved}
          aria-label={saved ? "Saved" : "Save this echo"}
        >
          <svg viewBox="0 0 24 24">
            <path d="M18 21l-6-3.6L6 21V5.4A1.4 1.4 0 0 1 7.4 4h9.2A1.4 1.4 0 0 1 18 5.4z" />
          </svg>
        </button>
      </div>
      {/*
        The rarity sentence used to sit here as its own line. It is good writing and it was
        costing a line of a sheet that had none to spare, above a list somebody was trying
        to scan. It rides with the place instead.
      */}
      {onCamera && <PlateStrip echo={capture.echo} onOpen={onCamera} />}
    </div>
  );
}

/**
 * What is next, with a way to start it.
 *
 * This slot used to hold a status sentence: "12 synced. They sync as you reach them, then
 * wait for you." Put that beside the design and the difference is the whole product. The
 * design's peek row is an *echo* — a play orb, what it is, what it is called, where it is
 * and how long — and mine was a progress report with nothing to press. A one-row sheet over
 * a full screen of map is the app's entire resting state, and mine was spending it on
 * telling you how the app works.
 *
 * So the resting state is the nearest echo, always, in the same row the design draws.
 *
 * The orb is the part that had to be thought about rather than copied. This product's rule
 * is that you cannot play something you have not stood at, so a play triangle on an echo
 * three streets away would be a lie, and a greyed-out one is a small insult. It is
 * therefore two controls wearing one shape: play, when the echo is yours; and, when it is
 * not, a pin that opens it on the map and says how far. Something to press either way,
 * and true either way.
 */
function NextUp({
  echo,
  distanceKm,
  playable,
  saved,
  onPlay,
  onSave,
  onOpen,
}: {
  echo: Echo;
  distanceKm: number | null;
  playable: boolean;
  saved: boolean;
  onPlay: (echo: Echo) => void;
  onSave: (echo: Echo) => void;
  onOpen: (echoId: string) => void;
}) {
  return (
    <div className="now">
      <div className="now-top">
        <button
          className={playable ? "play" : "play play-far"}
          aria-label={playable ? `Play ${echo.title}` : `Show ${echo.title} on the map`}
          onClick={() => (playable ? onPlay(echo) : onOpen(echo.id))}
        >
          {playable ? (
            <svg viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="play-pin">
              <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z" />
              <circle cx="12" cy="10" r="2.4" />
            </svg>
          )}
        </button>
        <div className="now-text">
          <span className={`playing-kicker cat-${echo.category}`}>
            <span className="playing-dot" />
            {CATEGORY_LABEL[echo.category]}
          </span>
          <h2>{echo.title}</h2>
          <p>
            {echo.point.place} ·{" "}
            {playable ? clock(echo.durationS) : nearness(distanceKm)}
          </p>
        </div>
        <button
          className={saved ? "now-mark on" : "now-mark"}
          onClick={() => onSave(echo)}
          aria-pressed={saved}
          aria-label={saved ? "Saved" : "Save this echo"}
        >
          <svg viewBox="0 0 24 24">
            <path d="M18 21l-6-3.6L6 21V5.4A1.4 1.4 0 0 1 7.4 4h9.2A1.4 1.4 0 0 1 18 5.4z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/** Rounded to fifty metres, to agree with everything else that reports a distance. */
function nearness(distanceKm: number | null): string {
  if (distanceKm === null) return "near here";
  const metres = distanceKm * 1000;
  if (metres < 950) return `${Math.round(metres / 50) * 50}m away`;
  return `${distanceKm.toFixed(1)}km away`;
}

/**
 * When there is genuinely nothing.
 *
 * Only reached with an empty map: every category switched off, or a place with no echoes
 * in it. Anything else has a nearest echo and gets the row above.
 */
function Empty({ selfDirected }: { selfDirected: boolean }) {
  return (
    <div className="now now-idle">
      <div className="now-text">
        <h2>Nothing here yet</h2>
        <p>
          {selfDirected
            ? "Move, or switch more categories on above the map."
            : "Nothing on this stretch of the route."}
        </p>
      </div>
    </div>
  );
}



/** Minutes and seconds, as a listener reads a length. */
const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;

/**
 * Fractions of the viewport each detent settles at.
 *
 * Peek is a quarter, which is enough for the grab handle and whatever just opened while
 * leaving three-quarters of the screen as map. That is the state the sheet should be in
 * while somebody is actually walking; half is for browsing what is around them, and full
 * is for working through the list sitting down.
 */
const DETENTS: Record<Detent, number> = { peek: 0.16, half: 0.46, full: 0.86 };

const nextDetent = (from: Detent): Detent =>
  from === "peek" ? "half" : from === "half" ? "full" : "peek";

/** Where a drag lets go — whichever detent the sheet ended up nearest. */
function nearestDetent(heightPx: number): Detent {
  const fraction = heightPx / window.innerHeight;
  let best: Detent = "half";
  let gap = Infinity;
  for (const [name, at] of Object.entries(DETENTS) as [Detent, number][]) {
    if (Math.abs(fraction - at) < gap) {
      gap = Math.abs(fraction - at);
      best = name;
    }
  }
  return best;
}
