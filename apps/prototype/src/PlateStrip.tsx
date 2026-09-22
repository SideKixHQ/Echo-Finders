/**
 * "There is a photograph of this."
 *
 * The invitation to the camera, and deliberately not a fifth grey button in the action row.
 * A button says *an action is available*; a sepia plate with a year on it says *somebody
 * stood here in 1905 and you can stand in their footprints*, which is the actual offer and
 * the only reason anybody would raise a phone in the street.
 *
 * Hidden entirely when there is no plate. A row that says "Then & now — unavailable" is a
 * worse screen than one that never mentioned it.
 */

import type { Echo } from "@echofinders/core";
import { platePng } from "./archive-plate";

export function PlateStrip({ echo, onOpen }: { readonly echo: Echo; readonly onOpen: (echo: Echo) => void }) {
  const photo = echo.archive?.[0];
  if (!photo) return null;
  const more = (echo.archive?.length ?? 0) - 1;

  return (
    <button
      className="plate-strip"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(echo);
      }}
    >
      <span className="plate-thumb">
        <img src={platePng(photo.imageKey, "then")} alt="" draggable={false} />
        {more > 0 && <em>+{more}</em>}
      </span>
      <span className="plate-text">
        <strong>Then &amp; now</strong>
        <small>{photo.caption ?? echo.point.place}{photo.year ? ` · ${photo.year}` : ""}</small>
      </span>
      <span className="plate-cam" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M4 8h3l1.6-2.2h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
          <circle cx="12" cy="13.5" r="3.4" />
        </svg>
      </span>
    </button>
  );
}
