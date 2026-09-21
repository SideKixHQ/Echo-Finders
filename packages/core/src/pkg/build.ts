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
  FlightPlan,
  LatLng,
  ListenerProfile,
  Story,
  StoryCategory,
} from "../types.js";
import { STORY_CATEGORIES } from "../types.js";
import {
  buildRouteGeometry,
  corridorBoundingBox,
  findStoriesAlongRoute,
  type CorridorHit,
} from "../geo/corridor.js";
import type { BoundingBox } from "../geo/great-circle.js";
import { buildPlaylist } from "../ranking/playlist.js";

export interface RoutePackageOptions {
  /**
   * Size ceiling in bytes. The default is sized for a three-hour domestic flight over a
   * shared cabin connection, or a slot on an onboard server holding dozens of routes.
   */
  readonly maxBytes?: number;
  /** Bitrate assumed when a story has no measured `audioBytes`. Mono Opus speech. */
  readonly bitrateKbps?: number;
  /** Corridor half-width in km. */
  readonly maxCrossTrackKm?: number;
  /**
   * Ages the package must serve. One playlist is guaranteed for every category at every
   * one of these ages, so switching filters in flight can never hit an empty shelf.
   */
  readonly audienceAges?: readonly number[];
  /** Categories to carry. Defaults to everything the library has. */
  readonly categories?: readonly StoryCategory[];
  /** Cap on points in the map polyline. */
  readonly maxPathPoints?: number;
}

const DEFAULTS = {
  maxBytes: 250 * 1024 * 1024,
  bitrateKbps: 64,
  // A young child, an older child, the true-crime threshold, and an adult.
  audienceAges: [6, 12, 16, 35] as readonly number[],
  maxPathPoints: 300,
} as const;

export interface PackagedStory {
  readonly story: Story;
  readonly alongTrackKm: number;
  readonly crossTrackKm: number;
  readonly estimatedBytes: number;
  /** True if some coverage profile scheduled it, rather than merely tolerating it. */
  readonly essential: boolean;
}

export interface RoutePackage {
  readonly formatVersion: 1;
  readonly flightId: string;
  readonly plan: FlightPlan;
  /** Decimated great-circle polyline for the map. */
  readonly path: readonly LatLng[];
  readonly bounds: BoundingBox;
  readonly stories: readonly PackagedStory[];
  readonly totalBytes: number;
  readonly budgetBytes: number;
  /** Stories inside the corridor that the budget could not fit. */
  readonly droppedCount: number;
  readonly builtAt: string;
}

/**
 * Assemble the package for one flight.
 *
 * Selection runs in two passes. First the essentials: every story that some plausible
 * passenger would actually be scheduled, which is what guarantees a coherent flight for a
 * child, for a true-crime listener, and for everyone in between. Only then is the
 * remaining budget spent on depth — extra material for skipping, for filter changes, and
 * for the long stretches where the corridor is thin.
 *
 * Doing it in that order matters: a naive "best stories until full" pass can spend the
 * entire budget on adult history and leave a seven-year-old with nothing.
 */
export function buildRoutePackage(
  plan: FlightPlan,
  library: readonly Story[],
  options: RoutePackageOptions = {},
): RoutePackage {
  const maxBytes = options.maxBytes ?? DEFAULTS.maxBytes;
  const bitrateKbps = options.bitrateKbps ?? DEFAULTS.bitrateKbps;
  const audienceAges = options.audienceAges ?? DEFAULTS.audienceAges;
  const categories = options.categories ?? STORY_CATEGORIES;

  const geometry = buildRouteGeometry(plan);

  // Narrow to the corridor once. Every coverage playlist below then works over this small
  // set rather than rescanning a library that may hold the whole country.
  const hits = findStoriesAlongRoute(plan, library, {
    maxCrossTrackKm: options.maxCrossTrackKm,
  });
  const corridor = hits.map((hit) => hit.story);
  const hitById = new Map<string, CorridorHit>(hits.map((hit) => [hit.story.id, hit]));

  // --- Pass 1: what every plausible passenger actually hears --------------------------
  const coverage = coverageProfiles(categories, audienceAges).map((profile) =>
    buildPlaylist(plan, corridor, profile, {
      maxCrossTrackKm: options.maxCrossTrackKm,
      requireAudio: true,
    }).items.map((item) => item.story.id),
  );

  const essentialOrder = interleave(coverage);
  const essential = new Set(essentialOrder);

  // --- Pass 2: spend what is left on depth -------------------------------------------
  const sizeOf = (story: Story) => estimateBytes(story, bitrateKbps);

  const packaged: PackagedStory[] = [];
  let totalBytes = 0;

  const take = (hit: CorridorHit, isEssential: boolean): boolean => {
    const bytes = sizeOf(hit.story);
    if (totalBytes + bytes > maxBytes) return false;
    totalBytes += bytes;
    packaged.push({
      story: hit.story,
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
    .filter((hit) => !essential.has(hit.story.id) && hit.story.audioKey)
    .sort((a, b) => b.story.quality - a.story.quality);

  for (const hit of extras) {
    if (!take(hit, false)) dropped++;
  }

  // Keep the manifest in the order the aircraft meets the stories: it is the order the
  // client wants for the map, and it makes a package diff legible to a human.
  packaged.sort((a, b) => a.alongTrackKm - b.alongTrackKm);

  return {
    formatVersion: 1,
    flightId: plan.id,
    plan,
    path: decimate(geometry.points, options.maxPathPoints ?? DEFAULTS.maxPathPoints),
    bounds: corridorBoundingBox(geometry, options.maxCrossTrackKm ?? 80),
    stories: packaged,
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
  categories: readonly StoryCategory[],
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
 * Merge the coverage playlists round-robin: every audience's first story, then every
 * audience's second, and so on.
 *
 * Taking them list by list instead would order the essentials by whatever order the
 * categories happen to be declared in — and a budget that runs out partway through would
 * silently starve whichever audience sits at the end of that list. (It did exactly that:
 * `kids` is last in `STORY_CATEGORIES`, and a tight package contained no children's
 * stories at all.) Round-robin makes a squeeze degrade every audience together.
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

/** Measured size when we have it, otherwise the bitrate assumption. */
export function estimateBytes(story: Story, bitrateKbps: number): number {
  if (story.audioBytes !== undefined) return story.audioBytes;
  return Math.round((bitrateKbps * 1000) / 8) * story.durationS;
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
