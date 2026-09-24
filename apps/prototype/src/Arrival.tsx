/**
 * The end of a journey.
 *
 * The design gives this a whole screen and it earns one: it is the only moment the product
 * gets to say what just happened. A walk that simply stops is an app you used; a walk that
 * tells you where you have been is a thing you did.
 *
 * The numbers are the real ones — echoes heard, minutes of narration, places saved — and
 * the sentence above them names the places rather than counting them, because "you walked
 * past Bowling Green and Federal Hall" is a memory and "3 echoes" is a score. The tiles
 * carry the score for anybody who wants it.
 *
 * The card at the bottom suggests another route from the library rather than an
 * advertisement. There is a real commercial slot here in the design, and it will need the
 * disclosure `Sponsorship` mandates when something is actually sold into it — a suggestion
 * the product makes about its own content needs no such thing, and conflating the two is
 * exactly how an interface teaches people to distrust it.
 */

import type { CaptureEvent, Echo, Route } from "@echofinders/core";
import { CATEGORY_LABEL } from "./categories";
import { shareText } from "./share";

export interface ArrivalProps {
  readonly route: Route;
  readonly heard: readonly CaptureEvent[];
  readonly saved: readonly Echo[];
  readonly suggestion: Route | null;
  readonly suggestionCount: number;
  readonly onSuggestion: (route: Route) => void;
  readonly onAgain: () => void;
}

export function Arrival({
  route,
  heard,
  saved,
  suggestion,
  suggestionCount,
  onSuggestion,
  onAgain,
}: ArrivalProps) {
  const minutes = Math.max(1, Math.round(heard.reduce((t, c) => t + c.echo.durationS, 0) / 60));
  const places = [...new Set(heard.map((c) => c.echo.point.place.split(",")[0]!.trim()))];
  const rarest = [...new Set(heard.map((c) => c.echo.category))];

  return (
    <div className="arrival">
      <header className="arr-head">
        <h2>{headline(route.mode)}</h2>
        <p>
          {heard.length === 0 ? (
            <>You reached {route.destination.name} without opening anything. It is all still there.</>
          ) : (
            <>
              You passed <b>{places.slice(0, 2).join(" and ")}</b>
              {places.length > 2 && <> and {places.length - 2} more</>}, and opened{" "}
              <b>
                {heard.length} {heard.length === 1 ? "echo" : "echoes"}
              </b>{" "}
              on the way to {route.destination.name}.
            </>
          )}
        </p>
      </header>

      <div className="tiles">
        <Tile n={heard.length} label={heard.length === 1 ? "Story" : "Stories"} />
        <Tile n={minutes} label={minutes === 1 ? "Minute" : "Minutes"} />
        <Tile n={saved.length} label="Saved" />
      </div>

      {rarest.length > 0 && (
        <p className="arr-cats">
          {rarest.map((c) => (
            <span key={c} className={`arr-cat cat-${c}`}>
              <span className="chip-dot" />
              {CATEGORY_LABEL[c]}
            </span>
          ))}
        </p>
      )}

      {suggestion && (
        <button className="arr-next" onClick={() => onSuggestion(suggestion)}>
          <strong>{nextLine(suggestion)}</strong>
          <small>
            {suggestion.name ?? suggestion.id} · {suggestionCount}{" "}
            {suggestionCount === 1 ? "echo" : "echoes"} · already downloaded
          </small>
        </button>
      )}

      <div className="arr-acts">
        <button className="arr-pri" onClick={onAgain}>
          {saved.length > 0 ? `Save ${saved.length} to your map` : "Walk it again"}
        </button>
        {/* This had no handler at all: a button that answered a tap with silence, on the
            one screen somebody might actually want to tell someone about. */}
        <button
          className="arr-ghost"
          onClick={() =>
            void shareText(
              `${heard.length} echoes on ${route.name ?? route.id}`,
              `I walked ${route.name ?? route.id} and heard ${heard.length} ${
                heard.length === 1 ? "story" : "stories"
              } along the way, on Echo Finders.`,
            )
          }
        >
          Share
        </button>
      </div>
    </div>
  );
}

function Tile({ n, label }: { n: number; label: string }) {
  return (
    <div className="tile">
      <b>{n}</b>
      <span>{label}</span>
    </div>
  );
}

const headline = (mode: Route["mode"]) =>
  mode === "flight"
    ? "Your flight, on the ground"
    : mode === "driving"
      ? "Your drive, parked up"
      : "Your walk, finished";

const nextLine = (route: Route) =>
  route.mode === "walking"
    ? `Somewhere to walk next?`
    : route.mode === "driving"
      ? `Another road worth the detour?`
      : `Another route worth listening to?`;
