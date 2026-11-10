/**
 * First run: one screen.
 *
 * It was six. A welcome with three value cards, how are you travelling, which flight or
 * which drive, nine category chips, who is listening, a headphones check, and three
 * permission cards before the map. James cut it to this on purpose (2026-11-10): the old
 * one had "so many words", and every one of those questions has a good default or a
 * home in Settings.
 *
 * What is left is the two ways in. Find echoes near me asks for the location and opens the
 * map where you are; the search box opens the map somewhere else, so a refusal or a
 * listener at home still lands on echoes. Everything the old flow asked now starts at its
 * default: walking, around here, every category on, kids mode off (Settings), no test line.
 *
 * The location prompt still comes from a tap, never cold: on iOS a refusal cannot be asked
 * again, only fixed in Settings, so the words on the button are the reason.
 *
 * Search is `place-search.ts`'s, the same ZIP and place lookup the journey menu and
 * "Where are you?" use, with this screen's own box around it.
 */

import { useState } from "react";
import { FREE_ECHO_LIMIT, type Echo } from "@echofinders/core";
import { loadZips, searchPlaces, type PlaceHit } from "./place-search";

export interface OnboardingProps {
  /** Ask the browser for the location. Resolves once it has answered, either way. */
  readonly onAskLocation: () => Promise<unknown>;
  /** Done, from Find echoes near me: the map, where you are (or asking, if refused). */
  readonly onNearMe: () => void;
  /** Done, from the search box: the map, looking at the place picked. */
  readonly onLook: (hit: PlaceHit) => void;
  /** The library, for searching by place name. */
  readonly library: readonly Echo[];
}

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const FREE = WORDS[FREE_ECHO_LIMIT] ?? String(FREE_ECHO_LIMIT);

export function Onboarding({ onAskLocation, onNearMe, onLook, library }: OnboardingProps) {
  const [asking, setAsking] = useState(false);
  const [query, setQuery] = useState("");
  const [table, setTable] = useState<ReadonlyMap<string, { lat: number; lng: number }> | null>(null);
  const typed = query.trim();
  const hits = typed.length >= 2 ? searchPlaces(query, table ?? new Map(), library, 4) : [];
  const waiting = /^\d{2,5}$/.test(typed) && table === null;

  const nearMe = async () => {
    if (asking) return;
    setAsking(true);
    // Whatever the answer: a refusal still opens the map, which offers the way back in.
    await onAskLocation();
    onNearMe();
  };

  return (
    <div
      className={typed ? "onb fr fr-searching" : "onb fr"}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Echo Finders"
    >
      <div className="fr-hero">
        <span className="fr-orb" aria-hidden="true" />
        <div className="fr-words">
          <h1>Hear what happened here.</h1>
          <p>Headphones in. Start walking.</p>
        </div>
      </div>

      <div className="fr-actions">
        <button className="fr-go" onClick={() => void nearMe()} aria-busy={asking}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M21 3L3 10.5l7.5 3L13.5 21z" />
          </svg>
          Find echoes near me
        </button>

        <div className="fr-trace">
          <label className="fr-search">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M16.5 16.5L21 21" />
            </svg>
            {!query && <span className="fr-caret" aria-hidden="true" />}
            <input
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              spellCheck={false}
              placeholder="Or search a city or ZIP"
              aria-label="Search a city or ZIP code"
              value={query}
              onFocus={() => {
                if (!table) void loadZips().then(setTable);
              }}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || !hits[0]) return;
                e.preventDefault();
                onLook(hits[0]);
              }}
            />
          </label>
        </div>

        {typed.length >= 2 && (
          <div className="fr-hits">
            {waiting && <p className="fr-empty">Finding ZIP codes…</p>}
            {!waiting && hits.length === 0 && (
              <p className="fr-empty">Nothing by that name or ZIP code yet.</p>
            )}
            {hits.map((hit) => (
              <button
                key={hit.label + hit.at.lat}
                className="fr-hit"
                onClick={() => onLook(hit)}
              >
                <b>{hit.label}</b>
                {hit.detail && <small>{hit.detail}</small>}
              </button>
            ))}
          </div>
        )}

        <p className="fr-free">Your first {FREE} echoes are free.</p>
      </div>
    </div>
  );
}
