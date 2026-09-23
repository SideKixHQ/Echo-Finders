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
import { UpNext } from "./UpNext";
import { EchoCard } from "./EchoCard";
import { PlateStrip } from "./PlateStrip";
import { Player } from "./Player";
import { Transcript } from "./Transcript";
import { useRef, useState } from "react";
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
  onCamera,
  detent,
  onDetent,
}: Props) {
  const [tab, setTab] = useState<"near" | "script" | "saved">("near");

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
  // The transcript is only meaningful for something actually playing, so the tab falls back
  // rather than showing an empty panel with a search box in it.
  const view = tab === "script" && !nowPlaying ? "near" : tab;
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
        <Idle count={captured.length} selfDirected={selfDirected} autoPlay={autoPlay} />
      )}

      {/*
        Peek is a sheet with about two hundred pixels in it, and the transport alone is
        taller than that — drawn here it was cut in half by the sheet's own bottom edge.
        The floating row over the map is the player at that height; this is the player at
        every other height, and there is never more than one of them.
      */}
      {nowPlaying && detent !== "peek" && (
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
          onLine={(delta) => onSeek(Math.max(0, Math.min(1, progress + delta * 0.12)))}
          onNext={onNext}
        />
      )}

      <div className="segs">
        <button className={view === "near" ? "seg on" : "seg"} onClick={() => setTab("near")}>
          Around you
        </button>
        <button
          className={view === "script" ? "seg on" : "seg"}
          onClick={() => setTab("script")}
          disabled={!nowPlaying}
        >
          Transcript
        </button>
        <button className={view === "saved" ? "seg on" : "seg"} onClick={() => setTab("saved")}>
          Saved<span className="seg-count">{saved.size}</span>
        </button>
      </div>

      {view === "script" && nowPlaying && (
        <Transcript echo={nowPlaying} simple={simple} progress={progress} onSeek={onSeek} />
      )}

      {view !== "script" && <UpNext items={view === "near" ? upcoming : []} onPlay={onPlay} />}

      {view !== "script" && (
      <div className="list">
        {(view === "saved" ? savedCards : nearby.slice(0, 5)).map((entry) => (
          <EchoCard
            key={entry.echo.id}
            echo={entry.echo}
            distanceM={entry.distanceKm * 1000}
            sealed={stateOf(entry.echo.id) === "sealed"}
            selected={selectedId === entry.echo.id}
            playing={isPlaying(entry.echo.id)}
            saved={saved.has(entry.echo.id)}
            onPlay={onPlay}
            onSave={onSave}
            onSelect={onSelect}
            {...(onCamera ? { onCamera } : {})}
          />
        ))}
        {view === "near" && nearby.length === 0 && (
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
          <span className={`tag tag-${rarity}`}>Found · {rarity}</span>
          <h2>{capture.echo.title}</h2>
          {/* Place and length on one line, because the decision this row exists to support
              is whether to listen now, and that is a question about both. */}
          <p>
            {capture.echo.point.place} · {clock(capture.echo.durationS)}
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
      {/* Rarity as a sentence, not a badge. A tier icon means nothing; this means something. */}
      {reasons.length > 0 && <p className="rarity-why">{reasons[0]}</p>}
      {onCamera && <PlateStrip echo={capture.echo} onOpen={onCamera} />}
    </div>
  );
}

/**
 * Before anything has been found.
 *
 * Says what actually happens rather than what the walking case happens to do. Arriving
 * *opens* an echo — it does not start it — and the phrasing has to carry that, because a
 * listener told "your phone can stay in your pocket" and then handed silence would
 * reasonably think something was broken.
 */
function Idle({
  count,
  selfDirected,
  autoPlay,
}: {
  count: number;
  selfDirected: boolean;
  autoPlay: boolean;
}) {
  const heading =
    count > 0 ? "Keep going" : selfDirected ? "Walk to open an echo" : "Echoes open as you pass";

  return (
    <div className="now now-idle">
      <div className="now-text">
        <h2>{heading}</h2>
        <p>
          {autoPlay
            ? "The ones you chose in Plan will play as you reach them, one at a time."
            : "They open as you reach them and wait — press play when you want to hear one."}
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
const DETENTS: Record<Detent, number> = { peek: 0.26, half: 0.46, full: 0.86 };

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
