/**
 * Building the bundle an aircraft carries before pushback.
 *
 * Everything the passenger will hear is chosen on the ground. In flight there is no
 * bandwidth worth the name, and no ranking API to call (ADR-0003). The package therefore
 * has to anticipate not just what the passenger will hear, but what they *might* hear
 * after changing their mind at 30,000 feet.
 *
 * The neat part is that it does not have to guess the final running order. Because this
 * engine is pure TypeScript with no I/O, it runs unchanged in the passenger's browser. So
 * the package ships *candidates plus geometry*, and the client re-runs `buildPlaylist`
 * locally whenever a filter changes — a passenger switching on true crime over Virginia
 * gets a freshly sequenced flight instantly, offline.
 */

import type {
  Route,
  LatLng,
  ListenerProfile,
  Echo,
  EchoCategory,
} from "../types.js";
import { ECHO_CATEGORIES, hasAudio, renderFor } from "../types.js";
import { presetFor } from "../modes.js";
import {
  buildRouteGeometry,
  corridorBoundingBox,
  findEchoesAlongRoute,
  type CorridorHit,
} from "../geo/corridor.js";
import type { BoundingBox } from "../geo/great-circle.js";
import { buildPlaylist } from "../ranking/playlist.js";

export interface EchoJourneyOptions {
  /**
   * Size ceiling in bytes. Defaults to the mode preset: a quarter of a gigabyte for a
   * long flight, a fraction of that for a walking tour that should download over mobile
   * data without the listener thinking about it.
   */
  readonly maxBytes?: number;
  /** Bitrate assumed when an echo has no measured `audioBytes`. Mono Opus speech. */
  readonly bitrateKbps?: number;
  /** Corridor half-width in km. */
  readonly maxCrossTrackKm?: number;
  /**
   * Ages the package must serve. One playlist is guaranteed for every category at every
   * one of these ages, so switching filters in flight can never hit an empty shelf.
   */
  readonly audienceAges?: readonly number[];
  /** Categories to carry. Defaults to everything the library has. */
  readonly categories?: readonly EchoCategory[];
  /** Cap on points in the map polyline. */
  readonly maxPathPoints?: number;
  /**
   * Which narrators this package carries. Defaults to one — whichever render comes first.
   *
   * The honest cost of a narrator picker lives here. Every voice offered is a complete
   * second copy of every audio file, so a package carrying two voices is twice the size and
   * fits half as many echoes into the same budget. Worth offering; worth deciding rather
   * than discovering when a package will not fit on an aircraft.
   */
  readonly voiceIds?: readonly string[];
}

const DEFAULTS = {
  bitrateKbps: 64,
  // A young child, an older child, the true-crime threshold, and an adult.
  audienceAges: [6, 12, 16, 35] as readonly number[],
  maxPathPoints: 300,
} as const;

export interface PackagedEcho {
  readonly echo: Echo;
  readonly alongTrackKm: number;
  readonly crossTrackKm: number;
  readonly estimatedBytes: number;
  /** True if some coverage profile scheduled it, rather than merely tolerating it. */
  readonly essential: boolean;
}

export interface EchoJourney {
  readonly formatVersion: 1;
  readonly routeId: string;
  readonly plan: Route;
  /** Decimated great-circle polyline for the map. */
  readonly path: readonly LatLng[];
  readonly bounds: BoundingBox;
  readonly echoes: readonly PackagedEcho[];
  readonly totalBytes: number;
  readonly budgetBytes: number;
  /** Echoes inside the corridor that the budget could not fit. */
  readonly droppedCount: number;
  readonly builtAt: string;
}

/**
 * Assemble the package for one flight.
 *
 * Selection runs in two passes. First the essentials: every echo that some plausible
 * passenger would actually be scheduled, which is what guarantees a coherent flight for a
 * child, for a true-crime listener, and for everyone in between. Only then is the
 * remaining budget spent on depth — extra material for skipping, for filter changes, and
 * for the long stretches where the corridor is thin.
 *
 * Doing it in that order matters: a naive "best echoes until full" pass can spend the
 * entire budget on adult history and leave a seven-year-old with nothing.
 */
export function buildEchoJourney(
  plan: Route,
  library: readonly Echo[],
  options: EchoJourneyOptions = {},
): EchoJourney {
  const preset = presetFor(plan.mode);
  const maxBytes = options.maxBytes ?? preset.packageBudgetBytes;
  const bitrateKbps = options.bitrateKbps ?? DEFAULTS.bitrateKbps;
  const audienceAges = options.audienceAges ?? DEFAULTS.audienceAges;
  const categories = options.categories ?? ECHO_CATEGORIES;

  const geometry = buildRouteGeometry(plan);

  // Narrow to the corridor once. Every coverage playlist below then works over this small
  // set rather than rescanning a library that may hold the whole country.
  const hits = findEchoesAlongRoute(plan, library, {
    maxCrossTrackKm: options.maxCrossTrackKm,
  });
  const corridor = hits.map((hit) => hit.echo);
  const hitById = new Map<string, CorridorHit>(hits.map((hit) => [hit.echo.id, hit]));

  // --- Pass 1: what every plausible passenger actually hears --------------------------
  const coverage = coverageProfiles(categories, audienceAges).map((profile) =>
    buildPlaylist(plan, corridor, profile, {
      maxCrossTrackKm: options.maxCrossTrackKm,
      requireAudio: true,
    }).items.map((item) => item.echo.id),
  );

  const essentialOrder = interleave(coverage);
  const essential = new Set(essentialOrder);

  // --- Pass 2: spend what is left on depth -------------------------------------------
  const sizeOf = (echo: Echo) => estimateBytes(echo, bitrateKbps, options.voiceIds);

  const packaged: PackagedEcho[] = [];
  let totalBytes = 0;

  const take = (hit: CorridorHit, isEssential: boolean): boolean => {
    const bytes = sizeOf(hit.echo);
    if (totalBytes + bytes > maxBytes) return false;
    totalBytes += bytes;
    packaged.push({
      echo: hit.echo,
      alongTrackKm: hit.alongTrackKm,
      crossTrackKm: hit.crossTrackKm,
      estimatedBytes: bytes,
      essential: isEssential,
    });
    return true;
  };

  let dropped = 0;
  for (const id of essentialOrder) {
    const hit = hitById.get(id);
    if (hit && !take(hit, true)) dropped++;
  }

  // Extras in quality order, so a squeezed budget loses the weakest material first.
  const extras = hits
    .filter((hit) => !essential.has(hit.echo.id) && hasAudio(hit.echo))
    .sort((a, b) => b.echo.quality - a.echo.quality);

  for (const hit of extras) {
    if (!take(hit, false)) dropped++;
  }

  // Keep the manifest in the order the aircraft meets the echoes: it is the order the
  // client wants for the map, and it makes a package diff legible to a human.
  packaged.sort((a, b) => a.alongTrackKm - b.alongTrackKm);

  return {
    formatVersion: 1,
    routeId: plan.id,
    plan,
    path: decimate(geometry.points, options.maxPathPoints ?? DEFAULTS.maxPathPoints),
    bounds: corridorBoundingBox(geometry, options.maxCrossTrackKm ?? preset.corridorKm),
    echoes: packaged,
    totalBytes,
    budgetBytes: maxBytes,
    droppedCount: dropped,
    builtAt: new Date().toISOString(),
  };
}

/**
 * One profile per category per age tier.
 *
 * Deliberately single-category: a passenger who turns everything off except true crime is
 * the hardest case to serve, because the scheduler's variety rules no longer help spread
 * the material out. If the package satisfies that, it satisfies any mixture of categories.
 */
function coverageProfiles(
  categories: readonly EchoCategory[],
  ages: readonly number[],
): ListenerProfile[] {
  const profiles: ListenerProfile[] = [];
  for (const category of categories) {
    for (const age of ages) {
      // "immersive" so coverage is generous: the package should hold more than any one
      // passenger will hear, not exactly enough for an average one.
      profiles.push({ categories: [category], age, density: "immersive" });
    }
  }
  return profiles;
}

/**
 * Merge the coverage playlists round-robin: every audience's first echo, then every
 * audience's second, and so on.
 *
 * Taking them list by list instead would order the essentials by whatever order the
 * categories happen to be declared in — and a budget that runs out partway through would
 * silently starve whichever audience sits at the end of that list. (It did exactly that:
 * `kids` is last in `ECHO_CATEGORIES`, and a tight package contained no children's
 * echoes at all.) Round-robin makes a squeeze degrade every audience together.
 */
function interleave(lists: readonly (readonly string[])[]): string[] {
  const longest = lists.reduce((max, list) => Math.max(max, list.length), 0);
  const seen = new Set<string>();
  const merged: string[] = [];

  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      const id = list[i];
      if (id === undefined || seen.has(id)) continue;
      seen.add(id);
      merged.push(id);
    }
  }

  return merged;
}

/**
 * How much room this echo takes, for the narrators the package carries.
 *
 * Sums every requested voice rather than measuring one, because that is what actually lands
 * on the device. Measured sizes are used where a render has them; the bitrate assumption
 * covers anything not yet rendered.
 */
export function estimateBytes(
  echo: Echo,
  bitrateKbps: number,
  voiceIds?: readonly string[],
): number {
  const bytesPerSecond = Math.round((bitrateKbps * 1000) / 8);
  const renders = echo.renders ?? [];

  if (renders.length === 0) return bytesPerSecond * echo.durationS;

  const wanted = voiceIds?.length
    ? voiceIds.map((id) => renderFor(renders, id)).filter((r) => r !== undefined)
    : [renders[0]!];

  // Distinct renders only: asking for two voices where only one exists must not bill twice
  // for the same file.
  const distinct = new Map(wanted.map((r) => [r!.audioKey, r!]));

  let total = 0;
  for (const render of distinct.values()) {
    total += render.audioBytes ?? bytesPerSecond * render.durationS;
  }
  return total;
}

/**
 * Thin a polyline to at most `max` points by even sampling.
 *
 * Even sampling rather than Douglas-Peucker on purpose: a great circle has no corners to
 * preserve, so the clever algorithm buys nothing here and costs a dependency.
 */
function decimate(points: readonly LatLng[], max: number): LatLng[] {
  if (points.length <= max) return [...points];

  const step = (points.length - 1) / (max - 1);
  const out: LatLng[] = [];
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]!);
  return out;
}
