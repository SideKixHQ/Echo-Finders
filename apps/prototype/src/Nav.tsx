/**
 * The tab bar.
 *
 * Four. The design prototype's five (Map, Listening, Saved, Stories, Settings) assumed a
 * seated passenger with a five-hour flight; on foot, Map and Collection carry almost
 * everything, and Privacy is here rather than buried because two of its switches delete
 * data the moment they are used.
 *
 * Plan earns the fourth because choosing what to hear is a *separate moment* from
 * travelling — you do it sitting down before the gate closes, not while walking — and a
 * thing done at a different time than everything else needs somewhere of its own.
 */

export type Tab = "map" | "plan" | "collection" | "privacy";

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
      <button className={tab === "plan" ? "on" : ""} onClick={() => onChange("plan")}>
        <svg viewBox="0 0 24 24">
          <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
        Plan
        {chosenCount > 0 && <span className="badge">{chosenCount}</span>}
      </button>
      <button className={tab === "collection" ? "on" : ""} onClick={() => onChange("collection")}>
        <svg viewBox="0 0 24 24">
          <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
        Collection
        {foundCount > 0 && <span className="badge">{foundCount}</span>}
      </button>
      <button className={tab === "privacy" ? "on" : ""} onClick={() => onChange("privacy")}>
        <svg viewBox="0 0 24 24">
          <path d="M12 3l8 3v6c0 4.5-3.2 7.9-8 9-4.8-1.1-8-4.5-8-9V6z" />
        </svg>
        Privacy
      </button>
    </nav>
  );
}
