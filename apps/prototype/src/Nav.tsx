/**
 * The tab bar.
 *
 * The design's, minus Stories until there is a library to browse.
 *
 * The names are worth more than they look, and they are better than the ones they replace.
 * "Listening" says what the screen is *for* where "Plan" said what you do on it — and what
 * you do on it is choose what goes in your ears, which is also what the now-playing
 * transport is about, so one word covers both. "Found" is this product's own verb for a
 * collection — you find echoes — and it leaves the word "Saved" free for the one thing it
 * already meant everywhere else: the echoes you bookmarked to hear.
 *
 * Settings absorbs Privacy rather than hiding it. Privacy had its own tab because two of
 * its switches delete data the moment they are used, and that reasoning was sound about the
 * *switches* and wrong about the tab: a bottom-bar slot is scarce, and nobody has ever gone
 * looking for a privacy screen anywhere but settings.
 */

import { memo } from "react";

export type Tab = "map" | "listening" | "saved" | "settings";

interface Props {
  readonly tab: Tab;
  readonly onChange: (tab: Tab) => void;
  readonly foundCount: number;
  readonly chosenCount: number;
}

function NavInner({ tab, onChange, foundCount, chosenCount }: Props) {
  return (
    <nav className="nav">
      <button className={tab === "map" ? "on" : ""} onClick={() => onChange("map")}>
        <svg viewBox="0 0 24 24">
          <path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3-6-3zM9 3v15M15 6v15" />
        </svg>
        Map
      </button>
      <button className={tab === "listening" ? "on" : ""} onClick={() => onChange("listening")}>
        {/* Headphones, as the design has it — the product's one universal assumption. */}
        <svg viewBox="0 0 24 24">
          <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
          <path d="M4 14a2 2 0 0 1 2-2h1v6H6a2 2 0 0 1-2-2zM20 14a2 2 0 0 0-2-2h-1v6h1a2 2 0 0 0 2-2z" />
        </svg>
        Listening
        {chosenCount > 0 && <span className="badge">{chosenCount}</span>}
      </button>
      {/*
        "Found", not "Saved" — and the rename is a bug fix.

        This tab shows the collection: the places you actually stood. The bookmark button
        on every card, the one on the rail and the sheet's own third tab all mean the other
        thing, the echoes you picked out to listen to. Both were called Saved, both carried
        a count, and the two counts are never the same — the screen said "Saved 0" beside
        "Saved 3" and neither was wrong. A collection is a record of where you have been;
        a saved list is a plan for where you are going.

        The bookmark went with the name. A pin with a tick is the record.
      */}
      <button className={tab === "saved" ? "on" : ""} onClick={() => onChange("saved")}>
        <svg viewBox="0 0 24 24">
          <path d="M12 21.5s7-5.7 7-11.1A7 7 0 0 0 5 10.4c0 5.4 7 11.1 7 11.1z" />
          <path d="M9 10.2l2.2 2.2L15 8.6" />
        </svg>
        Found
        {foundCount > 0 && <span className="badge">{foundCount}</span>}
      </button>
      <button className={tab === "settings" ? "on" : ""} onClick={() => onChange("settings")}>
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3.2" />
          <path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
        </svg>
        Settings
      </button>
    </nav>
  );
}

/*
 * Memoised. Nothing on this component depends on where the listener is, and the app
 * re-renders on every position fix — four times a second, for the life of a walk. Its
 * callbacks are stable in `App`, which is what makes the comparison actually succeed.
 */
export const Nav = memo(NavInner);
