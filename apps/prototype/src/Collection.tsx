/**
 * The collection.
 *
 * Not the same thing as "Saved" in the flight prototype, and merging them would muddle
 * both: saved is *places you want to go*, this is *places you actually stood*. One is a
 * wish list; the other is a record.
 *
 * That record is the reason someone keeps the app. A number that goes up is a poor reason;
 * "here is everywhere your life has passed through, and what happened there" is a good one.
 */

import { rarityOf, rarityReasons, type CaptureEvent, type Echo, type Rarity } from "@echofinders/core";
import type { PrivacySettings } from "@echofinders/core";
import { holdsPersonalLocation } from "@echofinders/core";

interface Props {
  readonly captured: readonly CaptureEvent[];
  readonly privacy: PrivacySettings;
  readonly total: number;
  /** Play one, from anywhere, at any time — which is the whole point of keeping them. */
  readonly onPlay: (echo: Echo) => void;
  readonly isPlaying: (echoId: string) => boolean;
}

const RARITY_ORDER: readonly Rarity[] = ["singular", "rare", "uncommon", "common"];

export function Collection({ captured, privacy, total, onPlay, isPlaying }: Props) {
  if (captured.length === 0) {
    return (
      <div className="screen-body">
        <div className="empty-state">
          <h2>Nothing yet</h2>
          <p>
            Echoes open when you arrive at them. Walk towards one and it will be here
            afterwards — yours to listen to whenever, wherever.
          </p>
        </div>
      </div>
    );
  }

  const byRarity = RARITY_ORDER.map((rarity) => ({
    rarity,
    items: captured.filter((c) => rarityOf(c.echo) === rarity),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="screen-body">
      <header className="screen-head">
        <h1>Your collection</h1>
        <p>
          {captured.length} of {total} found on this walk
        </p>
      </header>

      {byRarity.map(({ rarity, items }) => (
        <section key={rarity} className="group">
          <h3 className={`group-head group-${rarity}`}>{rarity}</h3>
          {items.map((capture) => (
            <Entry
              key={capture.echo.id}
              capture={capture}
              privacy={privacy}
              onPlay={onPlay}
              playing={isPlaying(capture.echo.id)}
            />
          ))}
        </section>
      ))}

      <footer className="collection-foot">
        {/* The distinction the privacy model exists for, made legible. A collection is
            about echoes; a standing position is about a person. */}
        {privacy.recordPrecisePlaces ? (
          <p>
            Your collection records where you were standing. You can turn that off in Privacy
            without losing anything above.
          </p>
        ) : (
          <p>
            Your collection records <strong>which</strong> echoes you found and when — not
            where you were standing. Turn that on in Privacy if you want a personal map.
          </p>
        )}
      </footer>
    </div>
  );
}

function Entry({
  capture,
  privacy,
  onPlay,
  playing,
}: {
  capture: CaptureEvent;
  privacy: PrivacySettings;
  onPlay: (echo: Echo) => void;
  playing: boolean;
}) {
  const reasons = rarityReasons(capture.echo);
  const stored = privacy.recordPrecisePlaces && holdsPersonalLocation(capture.record);
  const found = new Date(capture.record.capturedAt);

  return (
    <article className={playing ? "entry entry-playing" : "entry"}>
      {/*
        The whole entry starts it. Capturing an echo bookmarks it; this is where the
        bookmark gets cashed in, and it should take one tap anywhere on the row rather than
        hunting for a small target — the listener may well be walking.
      */}
      <button
        className="entry-hit"
        onClick={() => onPlay(capture.echo)}
        aria-label={`Play ${capture.echo.title}`}
      >
        <div className="entry-glyph" aria-hidden="true">
          {playing ? (
            <svg viewBox="0 0 24 24" className="entry-glyph-play">
              <path d="M8 5v14l11-7z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24">
              <path d="M5 12.5 L10 17.5 L19 7" />
            </svg>
          )}
        </div>
        <div className="entry-text">
          <h4>{capture.echo.title}</h4>
          <p>{capture.echo.point.place}</p>
          <p className="entry-meta mono">
            {playing ? (
              <span className="entry-now">Playing</span>
            ) : (
              found.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
            )}
            {reasons.length > 0 && <> · {reasons[0]!.toLowerCase()}</>}
            {stored && <> · position saved</>}
          </p>
        </div>
      </button>
    </article>
  );
}
