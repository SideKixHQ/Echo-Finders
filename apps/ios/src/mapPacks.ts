/**
 * Puts the map into download packs: the map side's `PackPartPlanner`, registered once at
 * launch (`app/_layout.tsx` imports this file), so a pack saves its streets, the world,
 * the coast and the label glyphs beside its audio, and the map draws with no signal.
 *
 * What it plans is `mapPartsFor` (`mapPack.ts`); this file only gathers what that needs:
 *
 *   - the site's list of squares, kept on the phone from the last time it was read, and
 *     read again from the site the first time a pack is planned;
 *   - real sizes, by a HEAD request per file the first time it is planned, asking for the
 *     file uncompressed so `Content-Length` is the size it will have on the phone. Until
 *     an answer comes the known sizes stand in (`KNOWN_BYTES`).
 *
 * When either arrives, plans are made again (`partPlannersChanged`), so the size on the
 * Offline echoes screen and the save sheet corrects itself, and saved packs pick up their
 * squares at their next update.
 */
import { partPlannersChanged, registerPartPlanner } from "./packs/plan";
import { MAP_FONTSTACKS, savedStreetSquares, streetSquares } from "./basemap";
import { mapPartsFor, siteUrlOf } from "./mapPack";

let squares: readonly string[] | null = savedStreetSquares();
let reading = false;
const measured = new Map<string, number>();
const asking = new Set<string>();
let pending: ReturnType<typeof setTimeout> | null = null;

/** One fresh plan for a burst of answers, not one per answer. */
function changed() {
  if (pending) return;
  pending = setTimeout(() => {
    pending = null;
    partPlannersChanged();
  }, 250);
}

function readSquares() {
  if (reading) return;
  reading = true;
  streetSquares()
    .then((list) => {
      const before = squares?.join("|");
      squares = list;
      if (list.join("|") !== before) changed();
    })
    .catch(() => undefined)
    .finally(() => {
      reading = false;
    });
}

function measure(key: string) {
  if (measured.has(key) || asking.has(key)) return;
  asking.add(key);
  fetch(siteUrlOf(key), { method: "HEAD", headers: { "Accept-Encoding": "identity" } })
    .then((r) => {
      const bytes = Number(r.headers.get("content-length"));
      if (r.ok && Number.isFinite(bytes) && bytes > 0) {
        measured.set(key, bytes);
        changed();
      }
    })
    .catch(() => undefined)
    .finally(() => asking.delete(key));
}

let readOnce = false;

registerPartPlanner(
  (_source, echoes) => {
    // The list from the phone plans at once; the site's is read once a launch, in case
    // a city has been added since.
    if (!readOnce) {
      readOnce = true;
      readSquares();
    } else if (!squares) readSquares();
    const parts = mapPartsFor(echoes, { squares, fontstacks: MAP_FONTSTACKS, measured: (key) => measured.get(key) });
    for (const part of parts) measure(part.key);
    return parts;
  },
  // Until the list is known, an update would drop every saved square, so it waits.
  { ready: () => squares !== null },
);
