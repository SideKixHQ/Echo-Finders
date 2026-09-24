/**
 * The collection.
 *
 * Not the same thing as "Saved" in the flight prototype, and merging them would muddle
 * both: saved is *places you want to go*, this is *places you actually stood*. One is a
 * wish list; the other is a record.
 *
 * That record is the reason someone keeps the app. A number that goes up is a poor reason;
 * "here is everywhere your life has passed through, and what happened there" is a good one.
 *
 * **Grouped by whether you have heard it, not by how rare it is.** The rarity grouping this
 * replaces was a scoring instinct: it sorted a record into tiers nobody asked about, and it
 * buried the one question a person actually has in front of a list of forty. Finding an
 * echo and hearing it are separate acts by design (ADR-0010) — arriving collects it, and
 * pressing play is a decision — so "collected and never listened to" is a real and
 * extremely common state. The engine has tracked it all along in `heardAt`; this screen
 * threw it away and drew every row the same.
 *
 * So the backlog comes first and it is the actionable half. What you have already heard
 * sits under it, quieter, as the record.
 */

import { rarityReasons, type CaptureEvent, type Echo } from "@echofinders/core";
import { CATEGORY_ICON } from "./categories";
import type { PrivacySettings } from "@echofinders/core";
import { holdsPersonalLocation } from "@echofinders/core";

interface Props {
  readonly captured: readonly CaptureEvent[];
  readonly privacy: PrivacySettings;
  readonly total: number;
  /** Play one, from anywhere, at any time — which is the whole point of keeping them. */
  readonly onPlay: (echo: Echo) => void;
  readonly isPlaying: (echoId: string) => boolean;
  /**
   * Whether this one has actually been listened to.
   *
   * Asked of the live tracker rather than read off `capture.record`, because a capture
   * event is built at the moment of arrival and its record is a snapshot from before
   * anybody pressed play. The record on disk gains `heardAt` later; the event in this
   * array never does.
   */
  readonly isHeard: (echoId: string) => boolean;
}

export function Collection({ captured, privacy, total, onPlay, isPlaying, isHeard }: Props) {
  if (captured.length === 0) {
    return (
      <div className="screen-body">
        <div className="empty">
          <b>Nothing found yet</b>
          Echoes open when you arrive at them. Walk towards one and it will be here
          afterwards — yours to listen to whenever, wherever.
        </div>
      </div>
    );
  }

  const unheard = captured.filter((c) => !isHeard(c.echo.id));
  const heard = captured.filter((c) => isHeard(c.echo.id));
  const groups = [
    { key: "unheard", label: `Not heard yet · ${unheard.length}`, items: unheard },
    { key: "heard", label: `Heard · ${heard.length}`, items: heard },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="screen-body">
      <header className="screen-head">
        <h1>Your collection</h1>
        <p>
          {captured.length} of {total} found on this walk
        </p>
        {/* The number as a shape. "1 of 12" is a fact; a bar that is a twelfth full is an
            invitation to go and get the rest, which is what this screen is for. */}
        <span className="coll-bar" aria-hidden="true">
          <i style={{ width: `${total > 0 ? (captured.length / total) * 100 : 0}%` }} />
        </span>
      </header>

      {groups.map(({ key, label, items }) => (
        <section key={key} className={`group group-${key}`}>
          <h3 className="group-head">{label}</h3>
          {items.map((capture) => (
            <Entry
              key={capture.echo.id}
              capture={capture}
              privacy={privacy}
              onPlay={onPlay}
              playing={isPlaying(capture.echo.id)}
              heard={isHeard(capture.echo.id)}
            />
          ))}
        </section>
      ))}

      {/* A footnote, set as one. It had the same border, padding and background as an
          echo, so a sentence about settings carried the visual weight of a story somebody
          walked to. The distinction it draws is worth keeping; the card around it was not. */}
      <footer className="collection-foot">
        {privacy.recordPrecisePlaces ? (
          <p>
            Your collection records where you were standing. You can turn that off in Privacy
            without losing anything above.
          </p>
        ) : (
          <p>
            Your collection records <strong>which</strong> echoes you found and when, not
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
  heard,
}: {
  capture: CaptureEvent;
  privacy: PrivacySettings;
  onPlay: (echo: Echo) => void;
  playing: boolean;
  heard: boolean;
}) {
  const reasons = rarityReasons(capture.echo);
  const stored = privacy.recordPrecisePlaces && holdsPersonalLocation(capture.record);
  const found = new Date(capture.record.capturedAt);

  return (
    <article className={`entry${playing ? " entry-playing" : ""}${heard ? " entry-heard" : ""}`}>
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
        {/*
          The design's saved-row thumbnail: a 76x52 plate carrying the category's own glyph
          and colour. A tick in a circle told you it was found, which you already knew from
          it being on this screen; the category is the thing that makes a list of forty
          scannable.
        */}
        <div className={`entry-glyph cat-${capture.echo.category}`} aria-hidden="true">
          {playing || !heard ? (
            <svg viewBox="0 0 24 24" className="entry-glyph-play">
              <path d="M8 5v14l11-7z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24">{CATEGORY_ICON[capture.echo.category]}</svg>
          )}
          <i>{clock(capture.echo.durationS)}</i>
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

/** Minutes and seconds, as a listener reads a length. */
const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
