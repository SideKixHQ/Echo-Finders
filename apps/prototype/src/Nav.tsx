/**
 * The tab bar.
 *
 * Three, not four. "Listening" was never a place: it was a decision about a journey —
 * which echoes should play themselves as you reach them — and as a top level destination
 * it competed with the map for the same job and lost, because on the map you can simply
 * press play. It survives as a control on the package screen, where you are already
 * deciding what to carry.
 *
 * Found and Saved were two halves of one idea. Echoes you stood on and echoes you meant to
 * are both *yours*; one is a record and the other is an intention, and a person holds them
 * in the same mental drawer. One tab, sections inside it.
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
 *
 * THREE AGAIN: Map, My Echoes, Settings. Settings went behind an icon on My Echoes for a
 * while, and the icon was the sliders everyone reads as "filter", so people tapped it to
 * filter their echoes and landed in settings with no way back. James's call: settings is
 * a tab, and the icon on My Echoes filters echoes.
 */

import { memo } from "react";

export type Tab = "map" | "echoes" | "settings";

interface Props {
  readonly tab: Tab;
  readonly onChange: (tab: Tab) => void;
  readonly foundCount: number;
}

/*
 * `aria-current="page"` rather than `aria-pressed`: these are not three switches, they are
 * three destinations and you are at one of them. Without it the highlight is the only thing
 * saying where you are, and the highlight is not readable by anything but an eye.
 */
function NavInner({ tab, onChange, foundCount }: Props) {
  return (
    <nav className="nav">
      <button
        className={tab === "map" ? "on" : ""}
        onClick={() => onChange("map")}
        aria-current={tab === "map" ? "page" : undefined}
      >
        <svg viewBox="0 0 24 24">
          <path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3-6-3zM9 3v15M15 6v15" />
        </svg>
        Map
      </button>
      <button
        className={tab === "echoes" ? "on" : ""}
        onClick={() => onChange("echoes")}
        aria-current={tab === "echoes" ? "page" : undefined}
      >
        <svg viewBox="0 0 24 24">
          <path d="M12 21.5s7-5.7 7-11.1A7 7 0 0 0 5 10.4c0 5.4 7 11.1 7 11.1z" />
          <path d="M9 10.2l2.2 2.2L15 8.6" />
        </svg>
        My Echoes
        {foundCount > 0 && <span className="badge">{foundCount}</span>}
      </button>
      <button
        className={tab === "settings" ? "on" : ""}
        onClick={() => onChange("settings")}
        aria-current={tab === "settings" ? "page" : undefined}
      >
        <svg viewBox="0 0 24 24">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
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
