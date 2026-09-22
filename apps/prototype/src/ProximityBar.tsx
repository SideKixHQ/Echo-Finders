/**
 * The haptic, made visible.
 *
 * Someone with the phone pocketed feels the hot-and-cold guidance and never sees this.
 * Someone looking at the screen needs the same information — and on an iPhone web build,
 * where there is no vibration API at all (ADR-0011), this is the *only* feedback there is.
 *
 * Same rhythm, same meaning: the bar pulses in time with the cue the engine emitted, so
 * both channels are saying one thing rather than two.
 */

import type { Guidance, HapticCue } from "@echofinders/core";

interface Props {
  readonly guidance: Guidance | null;
  readonly cue: HapticCue | null;
}

export function ProximityBar({ guidance, cue }: Props) {
  if (!guidance || !cue || cue.kind === "none") {
    return <div className="proximity proximity-idle" aria-hidden="true" />;
  }

  const metres = guidance.distanceKm * 1000;

  return (
    <div className={`proximity proximity-${cue.kind}`}>
      <div
        className="proximity-pulse"
        /*
          The cue's own interval drives the animation, so the bar and the buzz keep time.

          Arrival has no rhythm — `intervalMs` is `Infinity`, because it is one long
          confirmation rather than a pulse train — and formatting that gave CSS
          "Infinityms", which browsers discard silently. So the one moment the bar exists
          to mark was the one moment it was not animating to the cue at all.
        */
        style={{
          animationDuration: Number.isFinite(cue.intervalMs)
            ? `${Math.max(cue.intervalMs, 200)}ms`
            : `${Math.max(400, cue.pulseMs * 3)}ms`,
          ...(Number.isFinite(cue.intervalMs) ? {} : { animationIterationCount: 1 }),
        }}
      />
      <div className="proximity-label">
        <span className="proximity-kind">{labelFor(cue.kind)}</span>
        <span className="proximity-distance">{coarseDistance(metres)}</span>
      </div>
    </div>
  );
}

function labelFor(kind: HapticCue["kind"]): string {
  switch (kind) {
    case "arrived":
      return "You're here";
    case "close":
      return "Very close";
    case "warmer":
      return "Getting warmer";
    case "colder":
      return "Colder";
    default:
      return "Something nearby";
  }
}

/**
 * Deliberately coarse.
 *
 * A live metre count ticking down invites staring at the screen, which is precisely what
 * the whole design is arranged to avoid. "About 200 metres" tells a walker everything they
 * can act on.
 */
function coarseDistance(metres: number): string {
  if (metres < 20) return "right here";
  if (metres < 60) return "a few steps";
  if (metres < 120) return "about 100m";
  if (metres < 250) return "about 200m";
  if (metres < 450) return "a few minutes";
  return "further on";
}
