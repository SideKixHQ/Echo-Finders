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
  readonly handsFree: boolean;
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
  handsFree,
}: Props) {
  return (
    <div className="sheet">
      <div className="grab" />

      {lastCapture ? (
        <Found
          capture={lastCapture}
          playing={isPlaying(lastCapture.echo.id)}
          paused={paused}
          onPlay={onPlay}
          onPause={onPause}
          onResume={onResume}
        />
      ) : (
        <Idle count={captured.length} selfDirected={selfDirected} handsFree={handsFree} />
      )}

      <UpNext items={upcoming} onPlay={onPlay} />

      <div className="list-head">
        <span>Around you</span>
        <span className="count">{captured.length} found</span>
      </div>

      <ul className="list">
        {nearby.slice(0, 5).map((entry) => (
          <Row
            key={entry.echo.id}
            entry={entry}
            state={stateOf(entry.echo.id)}
            selected={selectedId === entry.echo.id}
            onSelect={onSelect}
            onPlay={onPlay}
            playing={isPlaying(entry.echo.id)}
          />
        ))}
        {nearby.length === 0 && <li className="empty">Nothing within reach. Keep walking.</li>}
      </ul>
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
}: {
  capture: CaptureEvent;
  playing: boolean;
  paused: boolean;
  onPlay: (echo: Echo) => void;
  onPause: () => void;
  onResume: () => void;
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
          <p>{capture.echo.point.place}</p>
        </div>
      </div>
      {/* Rarity as a sentence, not a badge. A tier icon means nothing; this means something. */}
      {reasons.length > 0 && <p className="rarity-why">{reasons[0]}</p>}
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
  handsFree,
}: {
  count: number;
  selfDirected: boolean;
  handsFree: boolean;
}) {
  const heading =
    count > 0 ? "Keep going" : selfDirected ? "Walk to open an echo" : "Echoes open as you pass";

  return (
    <div className="now now-idle">
      <div className="now-text">
        <h2>{heading}</h2>
        <p>
          {handsFree
            ? "They open as you reach them and start playing on their own. Your phone can stay in your pocket."
            : "They open as you reach them and wait — press play when you want to hear one."}
        </p>
      </div>
    </div>
  );
}

function Row({
  entry,
  state,
  selected,
  onSelect,
  onPlay,
  playing,
}: {
  entry: NearbyEcho;
  state: PinState;
  selected: boolean;
  onSelect: (id: string) => void;
  onPlay: (echo: Echo) => void;
  playing: boolean;
}) {
  const metres = Math.round(entry.distanceKm * 1000);
  // A sealed echo has nothing to play yet — going there is the only way to open it, and a
  // play button on one would be an offer the product cannot keep.
  const found = state !== "sealed";

  return (
    <li>
      <button
        className={`row row-${state}${selected ? " row-selected" : ""}`}
        onClick={() => onSelect(entry.echo.id)}
      >
        <span className={`bullet bullet-${state}`} />
        <span className="row-text">
          <strong>{state === "sealed" ? sealedTitle(entry.echo) : entry.echo.title}</strong>
          <small>{entry.echo.point.place}</small>
        </span>
        {found ? (
          <span
            className={playing ? "row-play row-play-on" : "row-play"}
            role="button"
            tabIndex={0}
            aria-label={`Play ${entry.echo.title}`}
            onClick={(event) => {
              event.stopPropagation();
              onPlay(entry.echo);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.stopPropagation();
                event.preventDefault();
                onPlay(entry.echo);
              }
            }}
          >
            <svg viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        ) : (
          <span className="row-distance">{metres < 1000 ? `${metres}m` : "far"}</span>
        )}
      </button>
    </li>
  );
}

/**
 * A sealed echo shows its teaser rather than its title.
 *
 * The map is a map of promises: you can see that something is there and roughly what kind
 * of thing, and finding out means going. Spoiling it on the list removes the reason to walk.
 */
function sealedTitle(echo: Echo): string {
  return echo.teaser ?? "Something happened here";
}
