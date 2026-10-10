/**
 * The city. Where the echoes are, at the scale where individual pins stop meaning anything.
 *
 * WHAT THE DESIGN BOARD GOT RIGHT AND HOW THIS GETS IT A DIFFERENT WAY. The board's own
 * note says its first pass read as fog, because the density was painted over the whole
 * screen including the water, and a blur with no edge is weather rather than information.
 * Its fix was to draw the rivers on top so every bloom stopped at the shoreline.
 *
 * This does not need to. The heat is not a field painted over the map: it is one bloom per
 * echo, at the echo's real coordinates. Nothing is drawn where there is nothing, so the
 * heat stops at the shoreline because nobody wrote an echo about the middle of the Hudson.
 * The shoreline itself comes from the basemap, which is a real one. The board drew rivers
 * because it had no map to stand on; we do.
 *
 * COLOUR, which is the one place this bends the law in `design/brand/README.md`. Ember is
 * the echo, and a hundred echoes painted ember would be the whole warm screen the law
 * exists to prevent. So the density field is indigo — it is a statement ABOUT the map,
 * like a contour line, rather than something you can have — and ember is spent only on the
 * singular ones, as points. That is the board's call and it is the right one: the legend
 * reads Few, Many, Worth it, and only the last of those is an echo.
 *
 * Every number on this screen is counted from the library. The board had 412 echoes and
 * five named boroughs; we have twenty-six across four regions, and saying so is better
 * than dressing it up.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  clusterEchoes,
  distanceKm,
  rarityOf,
  type Echo,
  type EchoCluster,
  type LatLng,
} from "@echofinders/core";
import { TILE_ATTRIBUTION, TILE_URL, VECTOR_ATTRIBUTION, VECTOR_TILES_URL, cameraFor, planTiles, toWorld } from "./tiles";
import { VectorBasemap } from "./VectorBasemap";

export interface CityProps {
  readonly library: readonly Echo[];
  readonly at: LatLng | null;
  readonly theme: "dark" | "light";
  readonly onClose: () => void;
  /** Take me to this one: centres the map on it and leaves. */
  readonly onGo: (cluster: EchoCluster) => void;
}

const W = 390;
const H = 844;
/** Where the map is allowed to draw, between the legend and the card. */
const TOP = 170;
const BOTTOM = 198;

/**
 * How far apart two echoes can be and still be the same place, on foot.
 *
 * 1.2km, which is the walking mode's own notion of "around here" (the corridor, times
 * eight). Using the same number means a cluster is, by construction, a place you could
 * walk across — which is exactly what the Go button is promising.
 */
const JOIN_KM = 1.2;

export function City({ library, at, theme, onClose, onGo }: CityProps) {
  /*
   * TWICE, and the second pass is the one that matters.
   *
   * The first clusters at walking distance, which is the only honest way to find out how
   * far apart the library actually is. But the view that then has to hold it may be a
   * continent wide, and at that scale two clusters eight kilometres apart are the same
   * pixel: rendering it showed Manhattan and Central Park as one blob with two labels
   * stacked on each other, and a third of the library missing behind them.
   *
   * So the extent from the first pass sets the zoom, and the second pass joins at a
   * distance that means something AT THAT ZOOM — a thirtieth of the span, or about thirteen
   * pixels. Clusters that would be drawn on top of each other are one cluster, which is
   * what a person looking at the screen would call them anyway.
   */
  const spanKm = useMemo(() => {
    const first = clusterEchoes(library, JOIN_KM);
    if (first.length === 0) return 2;
    const centre = mean(first.map((c) => c.at));
    const reach = first.reduce(
      (far, c) => Math.max(far, distanceKm(centre, c.at) + c.spreadKm),
      0,
    );
    // A floor of 2km, so a single neighbourhood does not zoom to street level, where a
    // density map is the wrong picture entirely.
    return Math.max(2, reach * 2.4);
  }, [library]);

  const clusters = useMemo(
    () => clusterEchoes(library, Math.max(JOIN_KM, spanKm / 30)),
    [library, spanKm],
  );

  /*
   * Where the fixed 390x844 drawing lands on this screen. The SVG fits itself with
   * `preserveAspectRatio`; the vector basemap is HTML and has to be told, or it would sit
   * a few pixels off the blooms on any phone that is not exactly that shape.
   */
  const frame = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ scale: number; left: number; top: number } | null>(null);
  useEffect(() => {
    const el = frame.current;
    if (!el || !VECTOR_TILES_URL || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const scale = Math.min(el.clientWidth / W, el.clientHeight / H);
      setFit({ scale, left: (el.clientWidth - W * scale) / 2, top: (el.clientHeight - H * scale) / 2 });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const view = useMemo(() => {
    const points = clusters.map((c) => c.at);
    if (points.length === 0) return null;
    const centre = mean(points);
    const plan = planTiles(
      centre,
      spanKm,
      W,
      BOTTOM - TOP,
      { x: 0, y: TOP, w: W, h: H - TOP - BOTTOM },
      { x: W / 2, y: TOP + (H - TOP - BOTTOM) / 2 },
    );
    const origin = toWorld(centre.lat, centre.lng, plan.zoom);
    const project = (p: LatLng) => {
      const w = toWorld(p.lat, p.lng, plan.zoom);
      return {
        x: W / 2 + (w.x - origin.x) * plan.scale,
        y: TOP + (H - TOP - BOTTOM) / 2 + (w.y - origin.y) * plan.scale,
      };
    };
    // Metres per pixel, so a bloom can be sized in metres rather than in guesses.
    const mPerPx = (spanKm * 1000) / W;
    return { plan, project, mPerPx };
  }, [clusters]);

  /*
   * The one to offer. Nearest to the listener when there is a fix, biggest otherwise —
   * "densest near you" is a claim that needs a you, and before the first fix there is not
   * one, so the wording changes with it rather than the number being fudged.
   */
  const pick = useMemo(() => {
    if (clusters.length === 0) return null;
    if (!at) return clusters[0]!;
    return clusters.reduce((best, c) =>
      distanceKm(at, c.at) < distanceKm(at, best.at) ? c : best,
    );
  }, [clusters, at]);

  const total = library.length;
  const you = at && view ? view.project(at) : null;

  /**
   * Where the labels go, once they have been stopped from sitting on each other.
   *
   * Clustering at view scale removes most collisions and cannot remove all of them: two
   * genuinely separate places can still be twenty pixels apart. So the biggest clusters
   * claim their spot first and each later one is pushed down until it clears, which keeps
   * the label nearest its own bloom and makes the one that moves the one that matters
   * least. A label that has been pushed off the bottom of the band is dropped rather than
   * parked on the card.
   */
  const plates = useMemo(() => {
    if (!view) return [];
    const ROW = 27;
    const taken: { x: number; y: number; w: number }[] = [];
    const out: { cluster: EchoCluster; x: number; y: number }[] = [];
    for (const c of clusters) {
      const p = view.project(c.at);
      if (p.x < -40 || p.x > W + 40) continue;
      // Roughly: 7px a character plus the padding. Close enough to decide an overlap.
      const w = (c.label.length + 4) * 7 + 18;
      /*
       * Three rows and no further. Pushing until it fits sounds better and is worse: one
       * label ended up three hundred pixels from its own bloom, pointing at nothing, which
       * is a label that actively lies about where a place is. Past eighty pixels the honest
       * move is to drop it — the bloom is still there, and the card below names the one
       * that matters.
       */
      let y = p.y + 14;
      for (let tries = 0; tries < 3; tries++) {
        const clash = taken.some(
          (t) => Math.abs(t.y - y) < ROW && Math.abs(t.x - p.x) < (t.w + w) / 2,
        );
        if (!clash) break;
        y += ROW;
      }
      const stillClashes = taken.some(
        (t) => Math.abs(t.y - y) < ROW && Math.abs(t.x - p.x) < (t.w + w) / 2,
      );
      if (stillClashes || y < TOP + 6 || y > H - BOTTOM - ROW) continue;
      taken.push({ x: p.x, y, w });
      out.push({ cluster: c, x: p.x, y });
    }
    return out;
  }, [clusters, view]);

  return (
    <div className="city" ref={frame}>
      {VECTOR_TILES_URL && fit && view && (
        <VectorBasemap
          tiles={VECTOR_TILES_URL}
          camera={cameraFor(view.plan, W, H)}
          theme={theme}
          width={W}
          height={H}
          scale={fit.scale}
          left={fit.left}
          top={fit.top}
          clipTop={TOP}
          clipBottom={BOTTOM}
          className="city-base"
        />
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="city-map" aria-hidden="true">
        <defs>
          <radialGradient id="cityHot">
            <stop offset="0%" stopColor="#d3cdff" stopOpacity="0.78" />
            <stop offset="36%" stopColor="#9b95ff" stopOpacity="0.36" />
            <stop offset="100%" stopColor="#6c63ff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="cityEmber">
            <stop offset="0%" stopColor="#ffd77a" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#ff9e12" stopOpacity="0" />
          </radialGradient>
          <clipPath id="cityBand">
            <rect x="0" y={TOP} width={W} height={H - TOP - BOTTOM} />
          </clipPath>
        </defs>

        <g clipPath="url(#cityBand)">
          {!VECTOR_TILES_URL && view?.plan.tiles.map((t) => (
            <image
              key={`${theme}/${view.plan.zoom}/${t.x}/${t.y}`}
              href={TILE_URL(t.x, t.y, view.plan.zoom, theme)}
              x={t.px}
              y={t.py}
              width={256 * view.plan.scale}
              height={256 * view.plan.scale}
              className="city-tile"
              onError={(e) => {
                (e.currentTarget as SVGImageElement).style.display = "none";
              }}
            />
          ))}

          {/*
            One bloom per echo, at its own coordinates. Overlapping blooms add up, which is
            the whole mechanism: density is what happens when a lot of them land together,
            rather than something computed and then drawn.

            300 metres of radius, which is walking's corridor. So a bright patch means
            literally "several echoes within earshot of each other" rather than a number
            somebody chose to make the picture look good.
          */}
          {view &&
            library.map((e) => {
              const p = view.project(e.point.at);
              return (
                <circle
                  key={e.id}
                  className="city-bloom"
                  cx={p.x}
                  cy={p.y}
                  r={Math.max(18, 300 / view.mPerPx)}
                  fill="url(#cityHot)"
                />
              );
            })}

          {/* Ember only on the rarest, and only as points. See the note at the top. */}
          {view &&
            clusters.flatMap((c) =>
              c.echoes
                .filter((e) => rarityOf(e) === "singular")
                .map((e) => {
                  const p = view.project(e.point.at);
                  return (
                    <g key={`s-${e.id}`}>
                      <circle cx={p.x} cy={p.y} r="22" fill="url(#cityEmber)" />
                      <circle className="city-ping" cx={p.x} cy={p.y} r="11" />
                      <circle className="city-singular" cx={p.x} cy={p.y} r="5" />
                    </g>
                  );
                }),
            )}

          {you && (
            <>
              <circle className="city-you-halo" cx={you.x} cy={you.y} r="24" />
              <circle className="city-you" cx={you.x} cy={you.y} r="8" />
            </>
          )}
        </g>

        {view && (
          <text className="map-credit" x={W - 10} y={H - BOTTOM - 8} textAnchor="end">
            {VECTOR_TILES_URL ? VECTOR_ATTRIBUTION : TILE_ATTRIBUTION}
          </text>
        )}
      </svg>

      {/* Labels as HTML, on plates, because type over a glow is type you cannot read. */}
      {plates.map(({ cluster: c, x, y }) => (
        <button
          key={c.label + c.echoes.length}
          className={c.singular > 0 ? "city-plate city-plate-rare" : "city-plate"}
          style={{ left: `${x}px`, top: `${y}px` }}
          onClick={() => onGo(c)}
        >
          {c.label} · {c.echoes.length}
        </button>
      ))}

      <header className="city-head">
        <button className="city-back" onClick={onClose} aria-label="Back to the map">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14.5 5L8 12l6.5 7" />
          </svg>
        </button>
        <span className="city-where">
          {clusters.length === 1 ? clusters[0]!.label : `${clusters.length} places`}
        </span>
        <span className="city-count mono">
          {total} {total === 1 ? "echo" : "echoes"}
        </span>
      </header>

      <div className="city-legend">
        <span className="mono">Few</span>
        <span className="city-ramp" aria-hidden="true" />
        <span className="mono">Many</span>
        <span className="city-dot" aria-hidden="true" />
        <span className="mono city-worth">Singular</span>
      </div>

      {pick && (
        <div className="city-card">
          <p className="city-card-kick mono">{at ? "Closest to you" : "The most of them"}</p>
          <div className="city-card-row">
            <span className="city-card-text">
              <b>{pick.label}</b>
              <span className="mono">
                {pick.echoes.length} {pick.echoes.length === 1 ? "echo" : "echoes"}
                {pick.singular > 0 && <> · {pick.singular} singular</>}
                {" · "}
                {across(pick)}
              </span>
            </span>
            <button className="city-go" onClick={() => onGo(pick)}>
              Go
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * How big it is, said as a distance rather than as a walking time.
 *
 * A time would need a route, a pace and a guess at how long somebody stands still
 * listening, and all three would be invented. "1.2km across" is measured, and a person
 * reading it knows their own pace better than we do.
 */
function across(c: EchoCluster): string {
  const km = c.spreadKm * 2;
  if (km < 0.1) return "one spot";
  if (km < 1) return `${Math.round((km * 1000) / 50) * 50}m across`;
  return `${km.toFixed(1)}km across`;
}

function mean(points: readonly LatLng[]): LatLng {
  let lat = 0;
  let lng = 0;
  for (const p of points) {
    lat += p.lat;
    lng += p.lng;
  }
  return { lat: lat / points.length, lng: lng / points.length };
}
