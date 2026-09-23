/**
 * The script, line by line, with the one you are hearing marked.
 *
 * Two jobs, and the second is the one that matters. It is the accessible surface — the
 * thing a deaf listener, or somebody in a quiet carriage, gets instead of the audio, and
 * ADR-0001 treats it as a requirement rather than a nicety. And it is a way *into* an echo:
 * tap a line and the narration jumps there, which turns a two-minute story into something
 * you can skim.
 *
 * Line timings come from `transcript-lines`, shared with the player's line-step buttons so
 * that a "line" means the same thing in both places. They are estimated from character
 * counts today and measured by the ElevenLabs render tomorrow; this component keeps working
 * unchanged either way, because it reads lines and offsets rather than the estimate.
 */

import { useMemo, useState } from "react";
import type { Echo } from "@echofinders/core";
import { splitScript } from "./transcript-lines";

export interface TranscriptProps {
  readonly echo: Echo;
  readonly simple: boolean;
  /** 0–1 through the echo. */
  readonly progress: number;
  readonly onSeek: (fraction: number) => void;
}

export function Transcript({ echo, simple, progress, onSeek }: TranscriptProps) {
  const [query, setQuery] = useState("");
  const script = (simple ? echo.simple?.script : echo.script) ?? echo.script ?? "";
  const lines = useMemo(() => splitScript(script), [script]);

  const current = lines.findIndex((l) => progress >= l.from && progress < l.to);
  const matching = query.trim()
    ? lines.filter((l) => l.text.toLowerCase().includes(query.trim().toLowerCase()))
    : lines;

  return (
    <div className="transcript">
      <label className="tsearch">
        <svg viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-4.3-4.3" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search this transcript"
          aria-label="Search this transcript"
        />
      </label>

      {echo.tags && echo.tags.length > 0 && (
        <div className="tkeys">
          {echo.tags.slice(0, 4).map((tag) => (
            <button
              key={tag}
              className={query === tag ? "tkey on" : "tkey"}
              onClick={() => setQuery(query === tag ? "" : tag)}
            >
              {tag.replace(/-/g, " ")}
            </button>
          ))}
        </div>
      )}

      <p className="tkicker">
        {simple ? "Plain-language cut" : "Full telling"} · tap a line to jump
        {!echo.renders?.[0]?.transcript && <> · timings estimated</>}
      </p>

      <div className="tlines">
        {matching.map((line) => (
          <button
            key={line.index}
            className={line.index === current ? "tline tline-on" : "tline"}
            onClick={() => onSeek(line.from)}
          >
            {line.text}
          </button>
        ))}
        {matching.length === 0 && <p className="empty">Nothing in this echo matches.</p>}
      </div>
    </div>
  );
}
