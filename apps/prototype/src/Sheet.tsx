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
import { useMemo, useRef, useState } from "react";
import { splitScript, stepLine } from "./transcript-lines";
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
  const savedCards = savedNearby;
  return (
    <div
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
      ) : nowPlaying ? null : (
        <Idle
          count={captured.length}
          total={onRouteCount}
          selfDirected={selfDirected}
          autoPlay={autoPlay}
        />
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
        <button className={view === "near" ? "seg on" : "seg"} onClick={() => setTab("near")}>
          Around you
        </button>
        <button
          className={view === "script" ? "seg on" : "seg"}
          onClick={() => setTab("script")}
          disabled={!scriptEcho}
        >
          Transcript
        </button>
        <button className={view === "saved" ? "seg on" : "seg"} onClick={() => setTab("saved")}>
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
 * Before anything has been found.
 *
 * One line, at the height of the design's mini bar, because this is the least valuable
 * block on the screen and it was taking the most room: a heading plus two lines of
 * explanation, about a hundred pixels, sitting between the listener and the list of
 * echoes around them. It is onboarding copy, and onboarding copy that reappears on every
 * visit has stopped being onboarding.
 *
 * What survives is the one thing somebody genuinely might not know, said in a clause
 * rather than a paragraph: arriving *opens* an echo, it does not start it. A listener
 * told their phone can stay in their pocket and then handed silence would reasonably
 * think something was broken.
 *
 * The count does the rest of the work. "3 found, 9 to go" is both the state and the
 * reason to keep walking, and it costs one line.
 */
function Idle({
  count,
  total,
  selfDirected,
  autoPlay,
}: {
  count: number;
  total: number;
  selfDirected: boolean;
  autoPlay: boolean;
}) {
  const left = Math.max(0, total - count);
  const heading =
    count > 0
      ? `${count} synced${left > 0 ? `, ${left} to go` : ""}`
      : selfDirected
        ? "Stand on one to sync it"
        : "Echoes open as you pass";
  const line = autoPlay
    ? "The ones you chose will play as you reach them."
    : count > 0
      ? "They sync as you reach them, then wait for you."
      : "Get to the spot and it syncs. Press play when you want it.";

  return (
    <div className="now now-idle">
      <div className="now-text">
        <h2>{heading}</h2>
        <p>{line}</p>
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
