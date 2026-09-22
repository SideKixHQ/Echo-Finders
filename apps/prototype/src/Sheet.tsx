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

interface Props {
  readonly nearby: readonly NearbyEcho[];
  readonly lastCapture: CaptureEvent | null;
  readonly captured: readonly CaptureEvent[];
  readonly stateOf: (echoId: string) => PinState;
  readonly selectedId: string | null;
  readonly onSelect: (echoId: string) => void;
}

export function Sheet({ nearby, lastCapture, captured, stateOf, selectedId, onSelect }: Props) {
  return (
    <div className="sheet">
      <div className="grab" />

      {lastCapture ? <NowPlaying capture={lastCapture} /> : <Idle count={captured.length} />}

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
          />
        ))}
        {nearby.length === 0 && <li className="empty">Nothing within reach. Keep walking.</li>}
      </ul>
    </div>
  );
}

function NowPlaying({ capture }: { capture: CaptureEvent }) {
  const rarity = rarityOf(capture.echo);
  const reasons = rarityReasons(capture.echo);

  return (
    <div className="now">
      <div className="now-top">
        <button className="play" aria-label="Play">
          <svg viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
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

function Idle({ count }: { count: number }) {
  return (
    <div className="now now-idle">
      <div className="now-text">
        <h2>{count === 0 ? "Walk to open an echo" : "Keep going"}</h2>
        <p>Stories open when you arrive. Your phone can stay in your pocket.</p>
      </div>
    </div>
  );
}

function Row({
  entry,
  state,
  selected,
  onSelect,
}: {
  entry: NearbyEcho;
  state: PinState;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const metres = Math.round(entry.distanceKm * 1000);
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
        <span className="row-distance">{metres < 1000 ? `${metres}m` : "far"}</span>
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
