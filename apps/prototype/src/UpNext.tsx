/**
 * What is coming up on this route.
 *
 * An offer, never a start. It matters most in the air, where it is the only thing a
 * listener can act on: walking or driving you can go to an echo, but at 35,000 feet the
 * route is fixed and choosing what to hear before it goes past *is* the interaction.
 *
 * The lead time is the useful part. "In 4 min" tells somebody whether to start it now or
 * wait until they are over the thing, which is a judgement only they can make — and the
 * reason this is a list with buttons rather than a queue that fills itself.
 */

import type { Echo, Upcoming } from "@echofinders/core";

export interface UpNextProps {
  readonly items: readonly Upcoming[];
  readonly onPlay: (echo: Echo) => void;
}

export function UpNext({ items, onPlay }: UpNextProps) {
  if (items.length === 0) return null;

  return (
    <div className="upnext">
      <span className="upnext-head">Coming up</span>
      <ul>
        {items.map((item) => (
          <li key={item.echo.id}>
            <button onClick={() => onPlay(item.echo)}>
              <span className="upnext-when">{lead(item.inS)}</span>
              <span className="upnext-title">{item.echo.title}</span>
              <span className="upnext-play" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Coarse on purpose, and the same instinct as the distances on the map: a number ticking
 * down invites staring at a screen, which is what the whole design is arranged to avoid.
 */
function lead(seconds: number): string {
  if (seconds < 90) return "now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 6) / 10;
  return `${hours} hr`;
}
