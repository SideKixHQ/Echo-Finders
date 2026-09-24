/**
 * What is around you, as a rose rather than a map.
 *
 * The screen half of the walking mode (`docs/05-walking.md`). It shows exactly what the ears
 * are being told and nothing more: you at the centre facing up, every echo in range at its
 * true bearing, distance as radius, category as colour, sealed as an outline and synced as a
 * fill. A glance confirms the hum rather than replacing it.
 *
 * Deliberately not a map. There are no streets on it, because a street map at this scale
 * answers "which way round the block" and the question on foot is "which way do I turn my
 * body". The street map is still one tap away for the moments you genuinely want to orient,
 * it is just no longer what you are handed by default.
 *
 * It rotates with you, so up is always the way you are facing. That is the whole reason it
 * can be read without stopping: a north-up rose has to be mentally rotated before it means
 * anything, and nobody does that while walking. North is marked on the ring instead, so the
 * one thing a north-up map gives you is not lost.
 */

import type { Echo } from "@echofinders/core";
import { CATEGORY_ICON, CATEGORY_LABEL } from "./categories";

export interface RoseEcho {
  readonly echo: Echo;
  readonly bearingDeg: number;
  readonly distanceKm: number;
  readonly sealed: boolean;
}

export interface RoseProps {
  readonly items: readonly RoseEcho[];
  /** Degrees clockwise from true north, or null when there is no compass. */
  readonly headingDeg: number | null;
  readonly accuracyDeg: number;
  /** iOS will not give a heading until somebody taps a button that asks for it. */
  readonly needsCompass: boolean;
  readonly onAskCompass: () => void;
  readonly selectedId: string | null;
  readonly onSelect: (echoId: string) => void;
  /** Whether the hum is on, and the switch for it. */
  readonly humming: boolean;
  readonly onHum: (on: boolean) => void;
}

/** The outermost ring, in kilometres. Matches what the hum will carry. */
const RANGE_KM = 1.2;
/**
 * How many marks the dial will draw.
 *
 * Twelve was unreadable: a dozen echoes three hundred metres away in the same direction is
 * one clump, not twelve bearings, and a dial you cannot read is worse than no dial. Eight
 * nearest, which is twice what the ears carry and about what a 300px circle holds.
 */
const MAX_MARKS = 8;
const SIZE = 300;
const CENTRE = SIZE / 2;
const EDGE = 128;
/** Inside this the rose is "here" rather than a direction, so pins stop chasing the centre. */
const HUB = 34;

export function Rose({
  items,
  headingDeg,
  accuracyDeg,
  needsCompass,
  onAskCompass,
  selectedId,
  onSelect,
  humming,
  onHum,
}: RoseProps) {
  const heading = headingDeg ?? 0;
  const trustworthy = headingDeg !== null && accuracyDeg <= 45;

  return (
    <div className="rose">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="rose-dial" role="img" aria-label="What is around you">
        {/* Range rings. Three, labelled, because "how far is that" is the second question. */}
        {[0.25, 0.6, 1].map((fraction) => (
          <circle
            key={fraction}
            className="rose-ring"
            cx={CENTRE}
            cy={CENTRE}
            r={HUB + (EDGE - HUB) * fraction}
          />
        ))}

        {/*
          North, on the ring, rotating as you turn. The rose is heading-up so it can be read
          without stopping; this is the one thing a north-up map gives you that we would
          otherwise lose.
        */}
        <g transform={`rotate(${-heading} ${CENTRE} ${CENTRE})`}>
          <line className="rose-north" x1={CENTRE} y1={CENTRE - EDGE - 10} x2={CENTRE} y2={CENTRE - EDGE + 2} />
          <text className="rose-north-mark" x={CENTRE} y={CENTRE - EDGE - 14} textAnchor="middle">
            N
          </text>
        </g>

        {/* You, and which way you are facing. Up, always. */}
        <g className={trustworthy ? "rose-me" : "rose-me rose-me-lost"}>
          <circle className="rose-me-halo" cx={CENTRE} cy={CENTRE} r="20" />
          <circle className="rose-me-dot" cx={CENTRE} cy={CENTRE} r="7" />
          {trustworthy && (
            <path className="rose-me-cone" d={cone(CENTRE, CENTRE, accuracyDeg)} />
          )}
        </g>

        {placed(items, trustworthy ? heading : 0).map(({ item, x, y }) => {
          const on = selectedId === item.echo.id;
          return (
            <g
              key={item.echo.id}
              className={`rose-echo cat-${item.echo.category}${item.sealed ? " rose-sealed" : ""}${on ? " rose-on" : ""}`}
              transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
              onClick={() => onSelect(item.echo.id)}
              role="button"
              aria-label={`${CATEGORY_LABEL[item.echo.category]}, ${item.echo.title}, ${label(item.distanceKm)}`}
            >
              {/* A group has no geometry, so this is the only reason a tap lands. */}
              <circle className="rose-hit" r="22" />
              <circle className="rose-mark" r="13" />
              <g className="rose-glyph" transform="translate(-7 -7) scale(0.583)">
                {CATEGORY_ICON[item.echo.category]}
              </g>
            </g>
          );
        })}
      </svg>

      <div className="rose-foot">
        {needsCompass ? (
          /*
            Without a heading every bearing on this dial is a guess, so it says so and asks
            once, from a tap, which is the only way iOS will ever grant it.
          */
          <button className="rose-ask" onClick={onAskCompass}>
            Use the compass
            <small>Bearings need it. Without one this is a list of distances.</small>
          </button>
        ) : (
          <button
            className={humming ? "rose-hum on" : "rose-hum"}
            onClick={() => onHum(!humming)}
            aria-pressed={humming}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 12h2.5l2-6 3 12 2.5-8 1.5 4H20" />
            </svg>
            {humming ? "Listening for echoes" : "Listen for echoes"}
            <small>
              {humming
                ? "Put it in your pocket. Each one hums from where it is."
                : "Headphones in, and the street starts humming."}
            </small>
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Where each mark goes, with collisions pushed apart.
 *
 * Bearing is the angle and distance is the radius, which is the right mapping and which
 * clumps badly in the one case that happens most: several echoes down the same street at
 * about the same distance. They genuinely *are* in the same direction, so the answer is not
 * to move them somewhere untrue, it is to stop them sitting exactly on top of each other.
 * Each one is nudged around the ring by the smallest amount that separates it, in the order
 * they are drawn, so the nearest keeps its true bearing and the rest give way.
 */
function placed(items: readonly RoseEcho[], heading: number) {
  const out: { item: RoseEcho; x: number; y: number }[] = [];
  const nearest = items.slice().sort((a, b) => a.distanceKm - b.distanceKm).slice(0, MAX_MARKS);
  for (const item of nearest) {
    const radius = HUB + (EDGE - HUB) * Math.min(1, item.distanceKm / RANGE_KM);
    let bearing = item.bearingDeg - heading;
    for (let attempt = 0; attempt < 24; attempt++) {
      const radians = (bearing * Math.PI) / 180;
      // Screen up is negative y, and a bearing is clockwise from up, so this is the whole
      // conversion: sin across, minus cos down.
      const x = CENTRE + Math.sin(radians) * radius;
      const y = CENTRE - Math.cos(radians) * radius;
      const clash = out.some((other) => Math.hypot(other.x - x, other.y - y) < 27);
      if (!clash) {
        out.push({ item, x, y });
        break;
      }
      // Alternating outward, so a pair splits either side of the truth rather than both
      // drifting one way.
      const step = Math.ceil((attempt + 1) / 2) * (attempt % 2 === 0 ? 1 : -1);
      bearing = item.bearingDeg - heading + step * (1600 / radius);
    }
  }
  return out;
}

/** The heading's own uncertainty, drawn. A cone you can see is a claim you can judge. */
function cone(cx: number, cy: number, accuracyDeg: number): string {
  const half = (Math.min(60, Math.max(6, accuracyDeg)) * Math.PI) / 180 / 2;
  const reach = 46;
  const x1 = cx + Math.sin(-half) * reach;
  const y1 = cy - Math.cos(-half) * reach;
  const x2 = cx + Math.sin(half) * reach;
  const y2 = cy - Math.cos(half) * reach;
  return `M${cx} ${cy} L${x1.toFixed(1)} ${y1.toFixed(1)} A${reach} ${reach} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z`;
}

/** Coarse, like every other distance here, for the same reason: no staring while walking. */
function label(km: number): string {
  const metres = km * 1000;
  if (metres < 950) return `${Math.round(metres / 50) * 50}m away`;
  return `${km.toFixed(1)}km away`;
}
