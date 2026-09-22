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
  readonly onSave: (echo: Echo) => void;
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
  onSave,
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
        <Idle count={captured.length} selfDirected={selfDirected} autoPlay={autoPlay} />
      )}

      <UpNext items={upcoming} onPlay={onPlay} />

      <div className="list-head">
        <span>Around you</span>
        <span className="count">{captured.length} found</span>
      </div>

      <div className="list">
        {nearby.slice(0, 5).map((entry) => (
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
          />
        ))}
        {nearby.length === 0 && <p className="empty">Nothing within reach. Keep walking.</p>}
      </div>
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


