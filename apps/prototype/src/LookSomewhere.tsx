import { useState } from "react";
import type { Echo } from "@echofinders/core";
import { loadZips, searchPlaces, type PlaceHit } from "./place-search";

/**
 * A ZIP code or a place, typed: the map goes and looks there.
 *
 * Under "Around here" in the journey menu because it is the same kind of choice: where the
 * map is looking, with no route. And on "Where are you?" (`Nowhere.tsx`), which asked the
 * question with only a location button to answer it. The ZIP list is fetched the first
 * time this box is used, not before.
 */
export function LookSomewhere({
  library,
  onPick,
  limit,
}: {
  readonly library: readonly Echo[];
  readonly onPick: (hit: PlaceHit) => void;
  /** How many results to list: fewer where the box shares a screen with other things. */
  readonly limit?: number;
}) {
  const [query, setQuery] = useState("");
  const [table, setTable] = useState<ReadonlyMap<string, { lat: number; lng: number }> | null>(null);
  const hits = query.trim().length >= 2 ? searchPlaces(query, table ?? new Map(), library, limit) : [];
  const waiting = /^\d{2,5}$/.test(query.trim()) && table === null;
  return (
    <div className="jmenu-look">
      <label className="jmenu-look-field">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4.5 4.5" />
        </svg>
        <input
          type="search"
          inputMode="search"
          autoComplete="off"
          placeholder="ZIP code or place"
          aria-label="Look somewhere else: a ZIP code or a place"
          value={query}
          onFocus={() => {
            if (!table) void loadZips().then(setTable);
          }}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || !hits[0]) return;
            // Kept here: picking closes the menu and puts focus back on the chip, and the
            // same Enter then landed on the chip and opened the menu again, over the place
            // just found (found 2026-10-12). A phone keyboard's Search key is this Enter.
            e.preventDefault();
            onPick(hits[0]);
          }}
        />
      </label>
      {waiting && <p className="jmenu-empty">Finding ZIP codes…</p>}
      {!waiting && query.trim().length >= 2 && hits.length === 0 && (
        <p className="jmenu-empty">Nothing by that name or ZIP code yet.</p>
      )}
      {hits.map((hit) => (
        <button key={hit.label + hit.at.lat} className="jmenu-item jmenu-hit" onClick={() => onPick(hit)}>
          <span>
            {hit.label}
            {hit.detail && <small>{hit.detail}</small>}
          </span>
        </button>
      ))}
    </div>
  );
}
