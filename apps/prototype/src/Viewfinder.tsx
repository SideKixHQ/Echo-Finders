/**
 * Then and now: hold the phone up where the photographer stood.
 *
 * The camera's job in this product is not to recognise anything. It is to put a century in
 * your hands — you walk to a spot, you raise the phone, and you drag a building back
 * through a hundred years while the kerb it stands on holds still. That is the thing people
 * describe to someone else afterwards, and it needs no AR, no world anchors and no model:
 * a photograph, the spot it was taken from, and a person who can see whether the windows
 * line up (see `alignmentTo`).
 *
 * Three decisions worth defending.
 *
 * **The slider is the product.** Everything else on this screen serves one gesture. An
 * automatic cross-fade is worse in every way — it takes the comparison away from the hands
 * doing the comparing, and half the pleasure is stopping at forty percent where both
 * centuries are visible at once.
 *
 * **Markers are arcs, not pins.** We know a bearing to within a compass reading, and in a
 * street lined with steel that can be tens of degrees. A pin hovering confidently over the
 * wrong building is worse than no marker; an arc that says "somewhere along here" stays
 * true, and stays useful (`viewfinderMarkers`).
 *
 * **It degrades all the way down.** No compass and it still says how far. No camera and it
 * still shows the plate against the place. The screen never claims a certainty it has not
 * got, which is the only reason anybody believes it when it does point somewhere.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  alignmentTo,
  alignmentWords,
  headingIsUsable,
  viewfinderMarkers,
  type ArchivePhoto,
  type Echo,
  type LatLng,
} from "@echofinders/core";
import { platePng } from "./archive-plate";
import { useCamera, useHeading } from "./use-sensors";
import { CATEGORY_LABEL } from "./categories";

export interface ViewfinderProps {
  readonly echo: Echo;
  readonly at: LatLng;
  /** Everything else worth an arc. The current echo is drawn from the list, not on top of it. */
  readonly nearby: readonly Echo[];
  readonly onClose: () => void;
  /** Switching to another echo's plate without leaving the camera. */
  readonly onSelect: (echo: Echo) => void;
}

const FOV_DEG = 65;

export function Viewfinder({ echo, at, nearby, onClose, onSelect }: ViewfinderProps) {
  const camera = useCamera();
  const heading = useHeading(true);
  const video = useRef<HTMLVideoElement | null>(null);

  const [photoIndex, setPhotoIndex] = useState(0);
  /** 0 is now, 1 is then. Starts part-way in, because a screen that opens on "now" looks broken. */
  const [blend, setBlend] = useState(0.72);
  /** Press and hold snaps to the other century; releasing goes back. The comparison gesture. */
  const [held, setHeld] = useState(false);

  const photos = echo.archive ?? [];
  const photo: ArchivePhoto | undefined = photos[Math.min(photoIndex, photos.length - 1)];

  // Asked for once, on open, and released on close. Never on mount of anything else.
  useEffect(() => {
    void camera.start();
    return () => camera.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A different echo means a different plate; keeping the old index would show photograph
  // three of an echo that has one.
  useEffect(() => setPhotoIndex(0), [echo.id]);

  useEffect(() => {
    if (camera.state.kind !== "live" || !video.current) return;
    video.current.srcObject = camera.state.stream;
    // Safari will not autoplay without this, and a paused viewfinder looks like a crash.
    void video.current.play().catch(() => undefined);
  }, [camera.state]);

  const alignment = useMemo(
    () =>
      photo
        ? alignmentTo(photo, echo.point.at, at, heading.deg, {
            headingAccuracyDeg: heading.accuracyDeg,
          })
        : null,
    [photo, echo.point.at, at, heading.deg, heading.accuracyDeg],
  );

  const pointing = heading.deg !== null && headingIsUsable(heading.accuracyDeg, FOV_DEG);
  const markers = useMemo(
    () =>
      pointing
        ? viewfinderMarkers(at, heading.deg!, nearby, {
            fovDeg: FOV_DEG,
            headingAccuracyDeg: heading.accuracyDeg,
            maxDistanceKm: 0.6,
          })
        : [],
    [pointing, at, heading.deg, heading.accuracyDeg, nearby],
  );

  // Held inverts rather than maximising: from mostly-then a hold should show you now.
  const shown = held ? (blend > 0.5 ? 0 : 1) : blend;
  const live = camera.state.kind === "live";

  return (
    <div className="vf">
      <div
        className="vf-frame"
        onPointerDown={() => setHeld(true)}
        onPointerUp={() => setHeld(false)}
        onPointerCancel={() => setHeld(false)}
        onPointerLeave={() => setHeld(false)}
      >
        {/* Now. The camera when there is one; otherwise a stand-in of the same street,
            clearly labelled below, so the gesture is still judgeable on a desktop. */}
        {live ? (
          <video className="vf-video" ref={video} playsInline muted autoPlay />
        ) : (
          <img
            className="vf-video"
            src={platePng(photo?.imageKey ?? echo.id, "now")}
            alt=""
            draggable={false}
          />
        )}

        {/* Then. */}
        {photo && (
          <img
            className="vf-then"
            style={{ opacity: shown }}
            src={platePng(photo.imageKey, "then")}
            alt={photo.caption ?? `${echo.point.place}, then`}
            draggable={false}
          />
        )}

        <Arcs markers={markers} current={echo.id} onSelect={onSelect} />

        <div className="vf-top">
          <button className="vf-x" onClick={onClose} aria-label="Close the camera">
            <svg viewBox="0 0 24 24">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <span className={`vf-tag cat-${echo.category}`}>
            <span className="vf-tag-dot" />
            {CATEGORY_LABEL[echo.category]}
          </span>
          {photo?.year && <span className="vf-year">{photo.year}</span>}
        </div>

        {alignment && <Guide words={alignmentWords(alignment)} score={alignment.score} advice={alignment.advice} />}

        {/*
          iOS refuses to deliver orientation events until they have been asked for, and the
          ask is only honoured from inside a user gesture — so without this button the
          bearing arcs simply never appear on the one platform most people will hold this
          up on, silently, with no error anywhere. Offered rather than demanded: the plate
          against the place works perfectly well without a compass.
        */}
        {heading.needsPermission && (
          <button className="vf-compass" onClick={() => void heading.ask()}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M15.5 8.5l-2 5-5 2 2-5z" />
            </svg>
            Use the compass
          </button>
        )}

        {/* Said once, at the bottom, and never as a modal. Somebody who declined the camera
            came here anyway — the plate against the place is most of the value, and a
            dialog demanding a permission they just refused is how a screen gets closed. */}
        {!live && (
          <p className="vf-note">
            {camera.state.kind === "starting"
              ? "Starting the camera…"
              : camera.state.kind === "unavailable"
                ? `${camera.state.why}. Showing a stand-in of the street.`
                : "Showing a stand-in of the street."}
          </p>
        )}
      </div>

      <div className="vf-bottom">
        {photo ? (
          <>
            <div className="vf-cap">
              <p>{photo.caption ?? echo.point.place}</p>
              <small>{photo.credit}</small>
            </div>

            <div className="vf-blend">
              <span className="vf-end">Now</span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(blend * 100)}
                onChange={(e) => setBlend(Number(e.target.value) / 100)}
                aria-label="Blend between now and then"
              />
              <span className="vf-end">{photo.year ?? "Then"}</span>
            </div>
            <p className="vf-hint">Press and hold the picture to flick between them</p>

            {photos.length > 1 && (
              <div className="vf-plates">
                {photos.map((p, i) => (
                  <button
                    key={p.imageKey}
                    className={i === photoIndex ? "vf-plate vf-plate-on" : "vf-plate"}
                    onClick={() => setPhotoIndex(i)}
                    aria-label={p.caption ?? `Photograph ${i + 1}`}
                    aria-pressed={i === photoIndex}
                  >
                    <img src={platePng(p.imageKey, "then")} alt="" />
                    <span>{p.year ?? "—"}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="vf-cap">
            <p>No photograph of this one yet</p>
            <small>The arcs still show you what is around you.</small>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * How close you are to reproducing the shot, in words and in one bar.
 *
 * Coarse on purpose. A live degree readout invites staring at a screen while standing in a
 * road, and the last few degrees are yours to judge by eye against the picture anyway —
 * which is more accurate than anything we could compute.
 */
function Guide({
  words,
  score,
  advice,
}: {
  words: string;
  score: number;
  advice: string;
}) {
  return (
    <div className={`vf-guide vf-guide-${advice}`}>
      <strong>{words}</strong>
      <span className="vf-meter" aria-hidden="true">
        <span style={{ width: `${Math.round(score * 100)}%` }} />
      </span>
    </div>
  );
}

/**
 * Echoes placed in the frame by bearing.
 *
 * Drawn at the width of our own uncertainty, so a twenty-degree compass error is a wide
 * band rather than a confident dot over the wrong doorway. Off-frame markers become an edge
 * arrow instead of being dropped — on a street the thing you want is often behind you, and
 * "turn left" is the most useful thing this screen can say.
 *
 * Both halves are capped, and the caps are the difference between this being useful and
 * being wallpaper. Lower Manhattan puts five echoes inside 600m; drawn honestly at 46% of
 * the frame each, they overlap into one illegible smear with their labels stacked on top of
 * one another, and five edge arrows pile up at the same height on the same side. So: the
 * three nearest in frame, laid out in lanes so no two labels ever collide, and one arrow
 * per side carrying the count of what is behind it. A viewfinder that shows you everything
 * shows you nothing.
 */
function Arcs({
  markers,
  current,
  onSelect,
}: {
  markers: ReturnType<typeof viewfinderMarkers>;
  current: string;
  onSelect: (echo: Echo) => void;
}) {
  if (markers.length === 0) return null;

  // `viewfinderMarkers` sorts farthest-first for painting; picking what to *show* is the
  // opposite question.
  const nearestFirst = [...markers].sort((a, b) => a.distanceKm - b.distanceKm);
  const inFrame = nearestFirst.filter((m) => m.inFrame).slice(0, 3);
  const left = nearestFirst.filter((m) => !m.inFrame && m.turnDeg < 0);
  const right = nearestFirst.filter((m) => !m.inFrame && m.turnDeg >= 0);

  return (
    <div className="vf-arcs">
      {/* Painter's order restored for the bands: the nearest should sit over the rest. */}
      {[...inFrame].reverse().map((m) => {
        const lane = inFrame.indexOf(m);
        const centre = ((m.x + 1) / 2) * 100;
        // x runs −1…1 across the frame; the band spans our stated error either side of it.
        // Capped at a third of the frame, because past that it stops reading as "over
        // there" and starts reading as a filter over the whole picture.
        const width = Math.min(34, Math.max(11, m.spread * 100));
        return (
          <button
            key={m.echo.id}
            className={`vf-arc cat-${m.echo.category}${m.echo.id === current ? " vf-arc-on" : ""}`}
            onClick={() => onSelect(m.echo)}
          >
            <span className="vf-arc-band" style={{ left: `${centre}%`, width: `${width}%` }} />
            {/*
              The label is placed independently of the band it belongs to, and clamped.
              A band centred at the very edge of the frame is correct — the thing really is
              over there — but its centred label then hangs half outside the picture, which
              is how this first rendered: "owling Green" against the left bezel. The band
              keeps the truth about the bearing; the label keeps being readable.

              Lanes, not a shared baseline: two bearings a few degrees apart would otherwise
              put their labels on top of one another.
            */}
            <span
              className="vf-arc-label"
              style={{
                left: `${Math.max(17, Math.min(83, centre))}%`,
                // Stacked upward from the foot of the band, so a label always reads as
                // belonging to its column. Downward put the third one under the stand-in
                // notice at the bottom of the frame.
                bottom: `calc(22% + ${lane * 46}px)`,
              }}
            >
              {shortPlace(m.echo.point.place)}
              <em>{distanceWords(m.distanceKm)}</em>
            </span>
          </button>
        );
      })}

      <Edge side="l" markers={left} onSelect={onSelect} />
      <Edge side="r" markers={right} onSelect={onSelect} />
    </div>
  );
}

/** One arrow per side: the nearest thing that way, and how much else is with it. */
function Edge({
  side,
  markers,
  onSelect,
}: {
  side: "l" | "r";
  markers: ReturnType<typeof viewfinderMarkers>;
  onSelect: (echo: Echo) => void;
}) {
  const first = markers[0];
  if (!first) return null;
  const more = markers.length - 1;
  return (
    <button className={`vf-edge vf-edge-${side}`} onClick={() => onSelect(first.echo)}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={side === "l" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
      </svg>
      <span>
        {shortPlace(first.echo.point.place)}
        <em>
          {distanceWords(first.distanceKm)}
          {more > 0 && ` · +${more}`}
        </em>
      </span>
    </button>
  );
}

/** Coarse on purpose, like everywhere else: a live metre count invites staring. */
const distanceWords = (km: number) =>
  km < 0.95 ? `${Math.round((km * 1000) / 10) * 10}m` : `${km.toFixed(1)}km`;

/**
 * "Castle Clinton, Battery Park, Manhattan" is a caption. On a viewfinder held at arm's
 * length it is three lines of wrapped text over a photograph, and the borough is the part
 * nobody standing in it needs.
 */
function shortPlace(place: string): string {
  const first = place.split(",")[0]?.trim() ?? place;
  return first.length > 24 ? `${first.slice(0, 23)}…` : first;
}
