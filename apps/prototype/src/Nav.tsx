/**
 * The tab bar.
 *
 * The design's, minus Stories until there is a library to browse.
 *
 * The names are worth more than they look, and they are better than the ones they replace.
 * "Listening" says what the screen is *for* where "Plan" said what you do on it — and what
 * you do on it is choose what goes in your ears, which is also what the now-playing
 * transport is about, so one word covers both. "Saved" is what a person calls the place
 * their things are, where "Collection" is what a product manager calls it.
 *
 * Settings absorbs Privacy rather than hiding it. Privacy had its own tab because two of
 * its switches delete data the moment they are used, and that reasoning was sound about the
 * *switches* and wrong about the tab: a bottom-bar slot is scarce, and nobody has ever gone
 * looking for a privacy screen anywhere but settings.
 */

export type Tab = "map" | "listening" | "saved" | "settings";

interface Props {
  readonly tab: Tab;
  readonly onChange: (tab: Tab) => void;
  readonly foundCount: number;
  readonly chosenCount: number;
}

export function Nav({ tab, onChange, foundCount, chosenCount }: Props) {
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
      <button className={tab === "saved" ? "on" : ""} onClick={() => onChange("saved")}>
        <svg viewBox="0 0 24 24">
          <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
        Saved
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
