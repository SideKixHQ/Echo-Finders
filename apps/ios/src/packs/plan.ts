/**
 * Download packs, the pure half: what a pack holds, how big it will be, and what changed.
 *
 * A pack is a place (a City Pass city, or a named area) or a route (a drive, a walk, a
 * flight), saved to the phone so its echoes play with no signal (ADR-0003: the flight
 * client does zero network I/O, and a drive through the mountains is not much better).
 *
 * Everything here is plain TypeScript over the engine's types: no Expo, no file system, no
 * React. The store (`store.ts`) and the saver (`saver.ts`) do the I/O; this decides what
 * they do it to, and it is what the tests in `test/ios/packs.test.ts` cover.
 *
 * A pack is a list of PARTS, each one file at a URL: an echo's rendered audio, and the map's
 * files for its streets (`kind: "tiles"`, planned on the map's side, `mapPack.ts`, through
 * `PackPartPlanner`). A file is stored once whatever number of packs hold it, and is
 * deleted only when none does (`orphanedKeys`).
 */
import { cityAt, distanceKm, findEchoesAlongRoute, type City, type Echo, type LatLng, type Route } from "@echofinders/core";

/** Where the rendered narration is served (the web app's own site; see `library.ts`). */
export const AUDIO_ORIGIN = "https://echo-finders.vercel.app";

/** The pack format. Bump when a manifest written by an older build can no longer be read. */
export const PACK_FORMAT_VERSION = 1;

/** What an echo with no measured `audioBytes` is taken to weigh: today's library average. */
export const FALLBACK_ECHO_BYTES = 1_300_000;

/** How many files download at once. */
export const SAVE_CONCURRENCY = 3;

// --- What a pack is of ------------------------------------------------------------------

/** A circle on the map with a name, for a place that is not (yet) a City Pass city. */
export interface Area {
  readonly id: string;
  readonly name: string;
  readonly centre: LatLng;
  readonly radiusKm: number;
}

export type PackSource =
  | { readonly kind: "city"; readonly city: City }
  | { readonly kind: "area"; readonly area: Area }
  | { readonly kind: "route"; readonly route: Route };

/** One id per thing saved, safe as a file name: `city-new-york`, `route-jfk-mia`. */
export function packIdOf(source: PackSource): string {
  const raw =
    source.kind === "city" ? source.city.id : source.kind === "area" ? source.area.id : source.route.id;
  return `${source.kind}-${raw.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

/** What the pack is called on screen. */
export function packNameOf(source: PackSource): string {
  if (source.kind === "city") return source.city.name;
  if (source.kind === "area") return source.area.name;
  return routeName(source.route);
}

export function routeName(route: Route): string {
  return route.name ?? `${route.origin.name} to ${route.destination.name}`;
}

// --- Parts ----------------------------------------------------------------------------

/** The kinds of file a pack carries: an echo's audio, or a map file (see `PackPartPlanner`). */
export type PackPartKind = "audio" | "tiles";

/** One file a pack needs, before it is saved. */
export interface PackPart {
  readonly kind: PackPartKind;
  /**
   * The file's identity, and its path under the pack store. For audio this is the render's
   * `audioKey` (`audio/<echo id>/<voice id>.mp3`), so two packs that share an echo share
   * its file. A tiles planner should use something as stable, say `map/echoes/8-75-102.pmtiles`.
   */
  readonly key: string;
  readonly url: string;
  /** Bytes, before download: measured where the library says, estimated where not. */
  readonly estimatedBytes: number;
  /** The size the library measured, when it did (`audioBytes`). What an update compares. */
  readonly libraryBytes?: number;
  /** The echo this part plays, for audio. */
  readonly echoId?: string;
}

/**
 * The hook the map uses to put its offline tiles into a pack.
 *
 * Given what is being saved, return the extra files it needs (`kind: "tiles"`). They are
 * downloaded, counted, updated and removed exactly like audio. Register one with
 * `registerPartPlanner` at startup; with none registered, packs hold audio only.
 */
export type PackPartPlanner = (source: PackSource, echoes: readonly Echo[]) => readonly PackPart[];

const partPlanners: PackPartPlanner[] = [];
const readiness = new Map<PackPartPlanner, () => boolean>();
const changeListeners = new Set<() => void>();

/**
 * `ready`, when given, says whether the planner knows enough yet to plan (the map's needs
 * its list of squares). Until every planner is ready, saved packs are not updated, so a
 * planner that does not know yet cannot make an update drop files it would have kept.
 */
export function registerPartPlanner(planner: PackPartPlanner, options: { ready?: () => boolean } = {}): () => void {
  partPlanners.push(planner);
  if (options.ready) readiness.set(planner, options.ready);
  partPlannersChanged();
  return () => {
    const i = partPlanners.indexOf(planner);
    if (i >= 0) partPlanners.splice(i, 1);
    readiness.delete(planner);
    partPlannersChanged();
  };
}

/** Whether every registered planner can plan now. */
export function partPlannersReady(): boolean {
  for (const ready of readiness.values()) if (!ready()) return false;
  return true;
}

/** Called by a planner when what it would plan has changed: it learnt a list, or a size. */
export function partPlannersChanged(): void {
  for (const listener of changeListeners) listener();
}

/** Hear when plans should be made again. Returns the way to stop hearing. */
export function onPartPlannersChanged(listener: () => void): () => void {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

// --- Planning -------------------------------------------------------------------------

/** The rendered file for an echo, as the phone plays it (`speech/` stand ins are not files). */
export function audioPartOf(echo: Echo): PackPart | null {
  const render = echo.renders?.find((r) => r.audioKey.startsWith("audio/"));
  if (!render) return null;
  const measured = render.audioBytes && render.audioBytes > 0 ? render.audioBytes : undefined;
  return {
    kind: "audio",
    key: render.audioKey,
    url: `${AUDIO_ORIGIN}/${render.audioKey}`,
    estimatedBytes: measured ?? FALLBACK_ECHO_BYTES,
    ...(measured !== undefined ? { libraryBytes: measured } : {}),
    echoId: echo.id,
  };
}

/** Only approved echoes with a recording go into a pack. */
export function isPackable(echo: Echo): boolean {
  return echo.editorial === "approved" && audioPartOf(echo) !== null;
}

/**
 * The echoes a pack holds, in a stable order.
 *
 * A city holds what a City Pass for it opens: an echo is in the first city whose circle it
 * falls in (`cityAt`), the same rule the entitlement uses, so a pack never holds an echo
 * its pass does not cover. An area is its circle. A route is its corridor, at its mode's
 * width (`findEchoesAlongRoute`), in the order you pass them.
 */
export function echoesFor(source: PackSource, library: readonly Echo[]): Echo[] {
  const packable = library.filter(isPackable);
  switch (source.kind) {
    case "city":
      return packable.filter((e) => cityAt(e.point.at)?.id === source.city.id);
    case "area":
      return packable.filter((e) => distanceKm(source.area.centre, e.point.at) <= source.area.radiusKm);
    case "route":
      return findEchoesAlongRoute(source.route, packable)
        .sort((a, b) => a.alongTrackKm - b.alongTrackKm)
        .map((hit) => hit.echo);
  }
}

export interface PackPlan {
  readonly id: string;
  readonly kind: PackSource["kind"];
  readonly sourceId: string;
  readonly name: string;
  readonly echoIds: readonly string[];
  readonly parts: readonly PackPart[];
  readonly estimatedBytes: number;
}

export function planPack(
  source: PackSource,
  library: readonly Echo[],
  planners: readonly PackPartPlanner[] = partPlanners,
): PackPlan {
  const echoes = echoesFor(source, library);
  const parts: PackPart[] = [];
  const seen = new Set<string>();
  const add = (part: PackPart) => {
    if (seen.has(part.key)) return;
    seen.add(part.key);
    parts.push(part);
  };
  for (const echo of echoes) {
    const part = audioPartOf(echo);
    if (part) add(part);
  }
  for (const planner of planners) for (const part of planner(source, echoes)) add(part);
  return {
    id: packIdOf(source),
    kind: source.kind,
    sourceId: source.kind === "city" ? source.city.id : source.kind === "area" ? source.area.id : source.route.id,
    name: packNameOf(source),
    echoIds: echoes.map((e) => e.id),
    parts,
    estimatedBytes: parts.reduce((sum, p) => sum + p.estimatedBytes, 0),
  };
}

// --- The manifest -----------------------------------------------------------------------

/** A part as the manifest records it: `bytes` is the real size, once it is on the phone. */
export interface ManifestPart extends PackPart {
  readonly bytes?: number;
}

/**
 * What is written beside a pack's files, and read back at launch.
 *
 * `state` is `saving` from the first file to the last, and stays `saving` across a restart,
 * which is how an interrupted save is found and carried on. `saved` once every part is on
 * the phone.
 */
export interface PackManifest {
  readonly version: number;
  readonly id: string;
  readonly kind: PackSource["kind"];
  readonly sourceId: string;
  readonly name: string;
  readonly state: "saving" | "saved";
  readonly echoIds: readonly string[];
  readonly parts: readonly ManifestPart[];
  /** Real bytes on the phone: the sum of every saved part. */
  readonly bytes: number;
  /** When the pack was first complete, epoch ms; null until it is. */
  readonly savedAt: number | null;
  /** When anything in it last changed, epoch ms. */
  readonly updatedAt: number;
}

export function isPartSaved(part: ManifestPart): boolean {
  return typeof part.bytes === "number";
}

/** A new manifest for a plan, nothing saved yet. */
export function manifestFor(plan: PackPlan, nowMs: number): PackManifest {
  const empty = plan.parts.length === 0;
  return {
    version: PACK_FORMAT_VERSION,
    id: plan.id,
    kind: plan.kind,
    sourceId: plan.sourceId,
    name: plan.name,
    state: empty ? "saved" : "saving",
    echoIds: plan.echoIds,
    parts: plan.parts.map((p) => ({ ...p })),
    bytes: 0,
    savedAt: empty ? nowMs : null,
    updatedAt: nowMs,
  };
}

/** Record one part as saved, with its real size; `saved` when it was the last. */
export function withPartSaved(manifest: PackManifest, key: string, bytes: number, nowMs: number): PackManifest {
  const parts = manifest.parts.map((p) => (p.key === key ? { ...p, bytes } : p));
  const done = parts.every(isPartSaved);
  return {
    ...manifest,
    parts,
    bytes: parts.reduce((sum, p) => sum + (p.bytes ?? 0), 0),
    state: done ? "saved" : "saving",
    savedAt: done ? (manifest.savedAt ?? nowMs) : manifest.savedAt,
    updatedAt: nowMs,
  };
}

/** The parts still to fetch. */
export function pendingParts(manifest: PackManifest): ManifestPart[] {
  return manifest.parts.filter((p) => !isPartSaved(p));
}

/** Saving progress: real bytes for what is saved, the estimate for what is not. */
export function progressOf(manifest: PackManifest): { savedBytes: number; totalBytes: number; fraction: number } {
  let saved = 0;
  let total = 0;
  for (const p of manifest.parts) {
    if (isPartSaved(p)) {
      saved += p.bytes ?? 0;
      total += p.bytes ?? 0;
    } else total += p.estimatedBytes;
  }
  return { savedBytes: saved, totalBytes: total, fraction: total > 0 ? saved / total : 1 };
}

/** Reads a manifest written by any build, or null when it is not one this build can use. */
export function parseManifest(raw: unknown): PackManifest | null {
  if (typeof raw !== "object" || raw === null) return null;
  const m = raw as Partial<PackManifest>;
  if (m.version !== PACK_FORMAT_VERSION) return null;
  if (typeof m.id !== "string" || typeof m.name !== "string" || typeof m.sourceId !== "string") return null;
  if (m.kind !== "city" && m.kind !== "area" && m.kind !== "route") return null;
  if (m.state !== "saving" && m.state !== "saved") return null;
  if (!Array.isArray(m.parts) || !Array.isArray(m.echoIds)) return null;
  const parts = m.parts.filter(
    (p): p is ManifestPart =>
      typeof p === "object" &&
      p !== null &&
      (p.kind === "audio" || p.kind === "tiles") &&
      typeof p.key === "string" &&
      typeof p.url === "string" &&
      typeof p.estimatedBytes === "number",
  );
  return {
    version: m.version,
    id: m.id,
    kind: m.kind,
    sourceId: m.sourceId,
    name: m.name,
    state: m.state,
    echoIds: m.echoIds.filter((id): id is string => typeof id === "string"),
    parts,
    bytes: parts.reduce((sum, p) => sum + (p.bytes ?? 0), 0),
    savedAt: typeof m.savedAt === "number" ? m.savedAt : null,
    updatedAt: typeof m.updatedAt === "number" ? m.updatedAt : 0,
  };
}

// --- Updating ---------------------------------------------------------------------------

export interface PackDiff {
  /** Parts in the plan the pack does not have: new echoes, and new renders of old ones. */
  readonly added: readonly PackPart[];
  /** Keys the pack has that the plan no longer wants: echoes retired, or re-voiced. */
  readonly removed: readonly string[];
  /** Same key, but the library now measures it at a different size: fetch it again. */
  readonly changed: readonly PackPart[];
  readonly unchanged: number;
}

/**
 * What it takes to bring a saved pack up to the library: compared by echo and audio key
 * (an echo's file is `audio/<id>/<voice>.mp3`, so a new voice is a new key), and by size
 * where the library has measured one, which catches a re-render in the same voice.
 */
export function diffPack(manifest: PackManifest, plan: PackPlan): PackDiff {
  const have = new Map(manifest.parts.map((p) => [p.key, p]));
  const want = new Map(plan.parts.map((p) => [p.key, p]));
  const added: PackPart[] = [];
  const changed: PackPart[] = [];
  let unchanged = 0;
  for (const part of plan.parts) {
    const old = have.get(part.key);
    if (!old) added.push(part);
    else if (isPartSaved(old) && part.libraryBytes !== undefined && old.bytes !== part.libraryBytes) changed.push(part);
    else unchanged++;
  }
  const removed = manifest.parts.filter((p) => !want.has(p.key)).map((p) => p.key);
  return { added, removed, changed, unchanged };
}

export function isDiffEmpty(diff: PackDiff): boolean {
  return diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0;
}

/**
 * The manifest after an update: kept parts keep their saved size, added and changed parts
 * are pending, removed parts are gone. `saving` again when anything is pending.
 */
export function applyDiff(manifest: PackManifest, plan: PackPlan, diff: PackDiff, nowMs: number): PackManifest {
  const have = new Map(manifest.parts.map((p) => [p.key, p]));
  const refetch = new Set(diff.changed.map((p) => p.key));
  const parts: ManifestPart[] = plan.parts.map((p) => {
    const old = have.get(p.key);
    return old && isPartSaved(old) && !refetch.has(p.key) ? { ...p, bytes: old.bytes } : { ...p };
  });
  const done = parts.every(isPartSaved);
  return {
    ...manifest,
    name: plan.name,
    echoIds: plan.echoIds,
    parts,
    bytes: parts.reduce((sum, p) => sum + (p.bytes ?? 0), 0),
    state: done ? "saved" : "saving",
    savedAt: manifest.savedAt ?? (done ? nowMs : null),
    updatedAt: nowMs,
  };
}

/**
 * Of `candidates`, the files no remaining pack holds, so they can be deleted: a file two
 * packs share stays until neither holds it.
 */
export function orphanedKeys(manifests: readonly PackManifest[], candidates: readonly string[]): string[] {
  const held = new Set(manifests.flatMap((m) => m.parts.map((p) => p.key)));
  return candidates.filter((key) => !held.has(key));
}

/**
 * The real size of a file another pack already saved under `key`, or null when none has.
 * A file packs share (the world map, the label glyphs) is fetched once: the next pack to
 * want it records it as saved at that size, and nothing downloads.
 */
export function savedBytesOf(manifests: readonly PackManifest[], key: string): number | null {
  for (const m of manifests) {
    for (const p of m.parts) if (p.key === key && isPartSaved(p)) return p.bytes ?? null;
  }
  return null;
}

/**
 * What saving a plan adds to the phone: every part no pack has saved yet. The first pack
 * pays for the files every pack shares; the next one only for its own.
 */
export function bytesToSave(plan: PackPlan, manifests: readonly PackManifest[]): number {
  return plan.parts.reduce((sum, p) => sum + (savedBytesOf(manifests, p.key) === null ? p.estimatedBytes : 0), 0);
}

/** A part's key as one flat file name, so the store needs no nested folders. */
export function fileNameForKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]/g, "_");
}

// --- Network ----------------------------------------------------------------------------

export type Connection = "wifi" | "cellular" | "none";

/** May a pack fetch files now? Never with no connection; on cellular only if allowed. */
export function maySaveNow(connection: Connection, wifiOnly: boolean): boolean {
  if (connection === "none") return false;
  return connection === "wifi" || !wifiOnly;
}

// --- Words ------------------------------------------------------------------------------

/** "85 MB", "1.3 MB", "41 GB": decimal units, as iPhone Storage counts them. */
export function formatBytes(bytes: number): string {
  const mb = bytes / 1_000_000;
  if (mb >= 1000) {
    const gb = mb / 1000;
    return `${gb >= 10 ? Math.round(gb) : Number(gb.toFixed(1))} GB`;
  }
  if (mb >= 10) return `${Math.round(mb)} MB`;
  if (mb >= 0.1) return `${Number(mb.toFixed(1))} MB`;
  return bytes > 0 ? "0.1 MB" : "0 MB";
}

/** "1 echo", "216 echoes". */
export function echoCount(n: number): string {
  return `${n} ${n === 1 ? "echo" : "echoes"}`;
}

/** "saved today", "saved yesterday", "saved 3 Nov". In the phone's own time zone. */
export function savedWhen(savedAt: number, nowMs: number): string {
  const day = (ms: number) => {
    const d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const days = Math.round((day(nowMs) - day(savedAt)) / 86_400_000);
  if (days <= 0) return "saved today";
  if (days === 1) return "saved yesterday";
  const d = new Date(savedAt);
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()];
  return `saved ${d.getDate()} ${month}`;
}

/** The line under a saved place: "216 echoes · 300 MB · saved today". */
export function savedLine(manifest: PackManifest, nowMs: number): string {
  const when = manifest.savedAt ? ` · ${savedWhen(manifest.savedAt, nowMs)}` : "";
  return `${echoCount(manifest.echoIds.length)} · ${formatBytes(manifest.bytes)}${when}`;
}

/** "41 of 85 MB", or "0.4 of 1.2 GB": one unit for both numbers, the larger's. */
export function formatMbPair(a: number, b: number): string {
  if (b >= 1e9) return `${Number((a / 1e9).toFixed(1))} of ${Number((b / 1e9).toFixed(1))} GB`;
  const mb = (n: number) => {
    const v = n / 1e6;
    return v >= 10 ? String(Math.round(v)) : String(Number(v.toFixed(1)));
  };
  return `${mb(a)} of ${mb(b)} MB`;
}

// --- Running a few at a time -----------------------------------------------------------

/**
 * Runs `work` over `items`, at most `limit` at once, stopping early when `signal` aborts.
 * Resolves when every started item has settled; a failed item is reported, not thrown, so
 * one bad file does not stop the rest.
 */
export async function runPool<T>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<void>,
  signal?: { readonly aborted: boolean },
): Promise<{ failed: T[] }> {
  const failed: T[] = [];
  let next = 0;
  const lane = async () => {
    while (next < items.length && !signal?.aborted) {
      const item = items[next++] as T;
      try {
        await work(item);
      } catch {
        if (!signal?.aborted) failed.push(item);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane));
  return { failed };
}
