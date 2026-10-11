/**
 * Where to go next, while you are walking to an echo.
 *
 * The line on the map is the real instruction; this says the one thing a glance needs:
 * the next turn and how far to it, then how long the whole walk is. Outside the areas with
 * street files it says the direction and the distance instead, and the hand-off to the
 * phone's own maps app is always there for anyone who would rather.
 */

import type { Echo, Turn } from "@echofinders/core";
import { mapsLink, walkDistance, walkTime, type Directions } from "./directions";

interface Props {
  readonly echo: Echo;
  readonly directions: Directions;
  /** Compass bearing from you to the echo, for the case with no street route. */
  readonly bearingDeg: number | null;
  readonly onEnd: () => void;
  /** On a planned walk: which stop this is, of how many. */
  readonly step?: { readonly at: number; readonly of: number };
}

const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

type Glyph = Turn["direction"] | "arrive" | "compass";

function nextStep(turns: readonly Turn[], metres: number): { say: string; inM: number | null; glyph: Glyph } {
  const turn = turns[0];
  if (!turn) {
    return metres < 40
      ? { say: "Almost there", inM: null, glyph: "arrive" }
      : { say: "Straight on to it", inM: metres, glyph: "straight" };
  }
  const how = turn.direction === "straight" ? "Carry on" : `Turn ${turn.direction}`;
  return { say: turn.onto ? `${how} onto ${turn.onto}` : how, inM: turn.fromStartM, glyph: turn.direction };
}

/** The turn as an arrow, so a glance is enough. */
function Arrow({ glyph }: { glyph: Glyph }) {
  const d: Record<Glyph, string> = {
    straight: "M12 20V5M7 10l5-5 5 5",
    left: "M17 20v-7a3 3 0 0 0-3-3H6M10 6l-4 4 4 4",
    right: "M7 20v-7a3 3 0 0 1 3-3h8M14 6l4 4-4 4",
    "slight left": "M15 20v-6L8 7M8 13V7h6",
    "slight right": "M9 20v-6l7-7M16 13V7h-6",
    arrive: "M12 21s6-5.4 6-10a6 6 0 1 0-12 0c0 4.6 6 10 6 10zM12 9.5v.01",
    compass: "M12 12l4-7-7 4z",
  };
  return (
    <svg className={`dirbar-arrow dirbar-arrow-${glyph.replace(" ", "-")}`} viewBox="0 0 24 24" aria-hidden="true">
      {glyph === "compass" && <circle cx="12" cy="12" r="8.5" />}
      <path d={d[glyph]} />
    </svg>
  );
}

export function DirectionsBar({ echo, directions, bearingDeg, onEnd, step }: Props) {
  let say: string;
  let inM: number | null = null;
  let glyph: Glyph = "compass";
  let total: string;
  if (directions.kind === "route") {
    ({ say, inM, glyph } = nextStep(directions.route.turns, directions.route.metres));
    total = `${walkTime(directions.route.seconds)} · ${walkDistance(directions.route.metres)}`;
  } else if (directions.kind === "unrouted") {
    const heading = bearingDeg === null ? null : COMPASS[Math.round(((bearingDeg % 360) + 360) % 360 / 45) % 8];
    say = heading ? `Head ${heading}` : "Head towards it";
    total = `${walkDistance(directions.metres)} as the crow flies`;
  } else {
    say = "Finding the way…";
    total = "";
  }

  return (
    <div className="dirbar" role="status" aria-live="polite">
      <div className="dirbar-main">
        <Arrow glyph={glyph} />
        <div className="dirbar-say">
          <strong>
            {say}
            {inM !== null && <span className="dirbar-in"> in {walkDistance(inM)}</span>}
          </strong>
          <span className="dirbar-to">
            {step && <span className="dirbar-step">Stop {step.at} of {step.of} · </span>}
            {total && <>{total} · </>}
            {echo.title}
          </span>
        </div>
        <button className="dirbar-end" onClick={onEnd} aria-label={step ? "End the walk" : "Stop directions"}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <a
        className="dirbar-maps"
        href={mapsLink(echo.point.at, echo.point.place ?? echo.title)}
        target="_blank"
        rel="noreferrer"
      >
        Open in Maps
      </a>
    </div>
  );
}
