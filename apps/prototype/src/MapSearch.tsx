/**
 * Search, at the top of the map: the first thing on the screen.
 *
 * James (2026-11-10): "When someone is searching you have to make that box stand out ... it
 * has to be really easy to search, then go or save an echo." It lived inside the trip menu,
 * one tap and a scroll away, so most people never knew it was there. Now it is the map's
 * first row, drawn like the first run's box (a running border, a slow pulse, a blinking
 * caret) so it reads as the way in that it is, with the trip and the echoes filter under it.
 *
 * Typing turns the map screen into the results, as the approved board draws them: CITIES,
 * each one tap to go and look there, then ECHOES, each with Go (the map, on that echo's
 * card) and Save right on the row. The ✕ or Escape puts the map back.
 *
 * The lookup is `place-search.ts`'s, the same one the first run and "Where are you?" use.
 * Browsing is not being there: Go moves the map, it does not unlock anything.
 */

import { useEffect, useRef, useState } from "react";
import type { Echo } from "@echofinders/core";
import { loadZips, searchCities, searchEchoes, type EchoHit, type PlaceHit } from "./place-search";

export interface MapSearchProps {
  readonly library: readonly Echo[];
  /** What is saved, so each echo's Save says whether it already is. */
  readonly saved: ReadonlySet<string>;
  /** Look at a city or ZIP code. */
  readonly onLook: (hit: PlaceHit) => void;
  /** The map, on this echo, its card open. */
  readonly onGo: (echo: Echo) => void;
  readonly onSave: (echo: Echo) => void;
}

export function MapSearch({ library, saved, onLook, onGo, onSave }: MapSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  /** The row just saved, which says where it went: the toast is under these results. */
  const [justSaved, setJustSaved] = useState<string | null>(null);
  const [table, setTable] = useState<ReadonlyMap<string, { lat: number; lng: number }> | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  const typed = query.trim();
  const cities = typed.length >= 2 ? searchCities(query, table ?? new Map(), library, 4) : [];
  const echoes: readonly EchoHit[] = typed.length >= 2 ? searchEchoes(query, library, 6) : [];
  const waiting = /^\d{2,5}$/.test(typed) && table === null;

  const close = () => {
    setOpen(false);
    setQuery("");
    setJustSaved(null);
    input.current?.blur();
  };

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open]);

  return (
    <div
      className={open ? "msearch open" : "msearch"}
      // Leaving the search with nothing typed puts the map back: an empty results layer
      // would sit over the map's controls with nothing in it (found by audit:controls).
      onBlur={(e) => {
        if (query.trim()) return;
        const to = e.relatedTarget as Node | null;
        if (to && e.currentTarget.contains(to)) return;
        setOpen(false);
      }}
    >
      <div className="fr-trace msearch-trace">
        <label className="fr-search msearch-field">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M16.5 16.5L21 21" />
          </svg>
          {!query && <span className="fr-caret" aria-hidden="true" />}
          <input
            ref={input}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            placeholder="Search a city or ZIP"
            aria-label="Search a city, place or ZIP code"
            aria-expanded={open}
            aria-controls="msearch-results"
            value={query}
            onFocus={() => {
              setOpen(true);
              if (!table) void loadZips().then(setTable);
            }}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (cities[0]) {
                onLook(cities[0]);
                close();
              } else if (echoes[0]) {
                onGo(echoes[0].echo);
                close();
              }
            }}
          />
          {open && (
            <button
              className="msearch-close"
              // The ✕ sits inside the field's <label>: without this, the label's own click
              // focused the box again after close(), and the results came straight back.
              onClick={(e) => {
                e.preventDefault();
                close();
              }}
              aria-label="Close search"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 7l10 10M17 7L7 17" />
              </svg>
            </button>
          )}
        </label>
      </div>

      {open && (
        <div className="msearch-results" id="msearch-results" role="region" aria-label="Search results">
          {typed.length < 2 && <p className="msearch-empty">A city, a place, or a ZIP code.</p>}
          {waiting && <p className="msearch-empty">Finding ZIP codes…</p>}
          {!waiting && typed.length >= 2 && cities.length === 0 && echoes.length === 0 && (
            <p className="msearch-empty">Nothing by that name or ZIP code yet.</p>
          )}

          {cities.length > 0 && (
            <section className="msearch-group" aria-label="Cities">
              <h2 className="msearch-head">Cities</h2>
              {cities.map((hit) => (
                <button
                  key={hit.label + hit.at.lat}
                  className="msearch-city"
                  onClick={() => {
                    onLook(hit);
                    close();
                  }}
                >
                  <span className="msearch-tile" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M4 20V9l4-3v14M8 20V4l5 3v13M13 20v-9l4-2 3 2v9M2 20h20" />
                    </svg>
                  </span>
                  <span className="msearch-words">
                    <b>{hit.label}</b>
                    <small>
                      {hit.detail}
                      {hit.pass ? " · City Pass" : ""}
                    </small>
                  </span>
                  <svg className="msearch-chev" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </section>
          )}

          {echoes.length > 0 && (
            <section className="msearch-group" aria-label="Echoes">
              <h2 className="msearch-head">Echoes</h2>
              {echoes.map(({ echo, town }) => {
                const isSaved = saved.has(echo.id);
                return (
                  <div key={echo.id} className="msearch-echo">
                    <span className="msearch-orb" aria-hidden="true" />
                    <span className="msearch-words">
                      <b>{echo.title}</b>
                      <small>{town}</small>
                      {isSaved && justSaved === echo.id && (
                        <small className="msearch-note" role="status">
                          Saved to My Echoes
                        </small>
                      )}
                    </span>
                    <button
                      className="msearch-go"
                      aria-label={`Go to ${echo.title}`}
                      onClick={() => {
                        onGo(echo);
                        close();
                      }}
                    >
                      Go
                    </button>
                    <button
                      className={isSaved ? "msearch-save on" : "msearch-save"}
                      aria-label={isSaved ? `Saved: ${echo.title}` : `Save ${echo.title}`}
                      aria-pressed={isSaved}
                      onClick={() => {
                        setJustSaved(isSaved ? null : echo.id);
                        onSave(echo);
                      }}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M7 4h10v16l-5-4-5 4z" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
