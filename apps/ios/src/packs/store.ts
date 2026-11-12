/**
 * Where packs live on the phone: the app's documents directory, which iOS does not clear
 * when storage runs low (the cache directory it does, which would empty a pack mid flight).
 *
 *   offline/settings.json          { wifiOnly }
 *   offline/packs/<pack id>.json   the manifest (`PackManifest` in `plan.ts`)
 *   offline/packs/<pack id>.echoes.json   the pack's echoes, as the library had them
 *   offline/files/<file name>      one file per part, shared by every pack that holds it
 *   offline/files/<file name>.part a file still downloading
 *
 * A part downloads to `.part` and is moved into place only when complete, so a file under
 * its own name is always whole. A `.part` left by a crash or a force quit is deleted at
 * launch, and the manifest, which records each part only once it is in place, says what
 * is left to fetch.
 */
import { Directory, File, Paths } from "expo-file-system";
import type { Echo } from "@echofinders/core";
import { fileNameForKey, parseManifest, type PackManifest, type PackPart } from "./plan";

const root = () => new Directory(Paths.document, "offline");
const packsDir = () => new Directory(root(), "packs");
const filesDir = () => new Directory(root(), "files");

function ensureDirs(): void {
  for (const dir of [root(), packsDir(), filesDir()]) {
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  }
}

// --- Settings ---------------------------------------------------------------------------

export interface OfflineSettings {
  /** Save only on Wi-Fi. On by default: a city is hundreds of megabytes. */
  readonly wifiOnly: boolean;
}

export const DEFAULT_SETTINGS: OfflineSettings = { wifiOnly: true };

export function readSettings(): OfflineSettings {
  try {
    const file = new File(root(), "settings.json");
    if (!file.exists) return DEFAULT_SETTINGS;
    const raw = JSON.parse(file.textSync()) as Partial<OfflineSettings>;
    return { wifiOnly: raw.wifiOnly !== false };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function writeSettings(settings: OfflineSettings): void {
  try {
    ensureDirs();
    writeText(new File(root(), "settings.json"), JSON.stringify(settings));
  } catch {
    /* The switch still holds for this session. */
  }
}

// --- Manifests --------------------------------------------------------------------------

/** Every pack on the phone. One that cannot be read is dropped, with its files left to `sweep`. */
export function readManifests(): PackManifest[] {
  try {
    ensureDirs();
    return packsDir()
      .list()
      .filter((entry): entry is File => entry instanceof File && /^[^.]+\.json$/.test(entry.name))
      .flatMap((file) => {
        try {
          const manifest = parseManifest(JSON.parse(file.textSync()));
          if (manifest) return [manifest];
        } catch {
          /* fall through */
        }
        file.delete();
        return [];
      });
  } catch {
    return [];
  }
}

export function writeManifest(manifest: PackManifest): void {
  ensureDirs();
  writeText(new File(packsDir(), `${manifest.id}.json`), JSON.stringify(manifest));
}

/** The echoes a pack holds, kept beside it so the pack stands on its own. */
export function writeEchoData(packId: string, echoes: readonly Echo[]): void {
  ensureDirs();
  writeText(new File(packsDir(), `${packId}.echoes.json`), JSON.stringify(echoes));
}

export function deletePackRecords(packId: string): void {
  for (const name of [`${packId}.json`, `${packId}.echoes.json`]) {
    const file = new File(packsDir(), name);
    if (file.exists) file.delete();
  }
}

/**
 * Write through a temporary file and a move, so a crash mid write leaves the old copy, not
 * half of a new one.
 */
function writeText(file: File, text: string): void {
  const tmp = new File(file.parentDirectory, `${file.name}.tmp`);
  if (tmp.exists) tmp.delete();
  tmp.create();
  tmp.writeSync(text);
  tmp.moveSync(file, { overwrite: true });
}

// --- Files ------------------------------------------------------------------------------

function fileFor(key: string): File {
  return new File(filesDir(), fileNameForKey(key));
}

/**
 * The saved copy of a part, as a `file://` URI, or null when it is not on the phone.
 * What the player asks before it reaches for the network.
 */
export function localUriFor(key: string): string | null {
  try {
    const file = fileFor(key);
    return file.exists ? file.uri : null;
  } catch {
    return null;
  }
}

export function deleteFiles(keys: readonly string[]): void {
  for (const key of keys) {
    try {
      const file = fileFor(key);
      if (file.exists) file.delete();
    } catch {
      /* Already gone, or going: `sweep` catches anything left. */
    }
  }
}

/**
 * At launch: delete every half downloaded `.part`, and every file no manifest holds (left
 * by a Remove the app was killed in the middle of).
 */
export function sweep(manifests: readonly PackManifest[]): void {
  try {
    ensureDirs();
    const held = new Set(manifests.flatMap((m) => m.parts.map((p) => fileNameForKey(p.key))));
    for (const entry of filesDir().list()) {
      if (!(entry instanceof File)) continue;
      if (entry.name.endsWith(".part") || entry.name.endsWith(".tmp") || !held.has(entry.name)) entry.delete();
    }
  } catch {
    /* Nothing to sweep, or nothing we can do. */
  }
}

/**
 * Fetch one part: into `.part`, then moved into place. Resolves with the file's real size.
 * Rejects when the request fails or `signal` aborts, leaving no file under the part's name.
 */
export async function downloadPart(
  part: PackPart,
  signal: AbortSignal,
  onProgress: (bytesWritten: number) => void,
): Promise<number> {
  ensureDirs();
  const target = fileFor(part.key);
  const partial = new File(filesDir(), `${target.name}.part`);
  if (partial.exists) partial.delete();
  try {
    await File.downloadFileAsync(part.url, partial, {
      idempotent: true,
      signal,
      onProgress: ({ bytesWritten }) => onProgress(bytesWritten),
    });
    if (signal.aborted) throw new Error("stopped");
    partial.moveSync(target, { overwrite: true });
    return target.size;
  } catch (error) {
    if (partial.exists) partial.delete();
    throw error;
  }
}

// --- Space ------------------------------------------------------------------------------

/** Bytes the saved files take, and bytes free on the phone. */
export function storage(): { usedBytes: number; freeBytes: number } {
  let used = 0;
  try {
    const dir = filesDir();
    used = dir.exists ? (dir.size ?? 0) : 0;
  } catch {
    used = 0;
  }
  let free = 0;
  try {
    free = Paths.availableDiskSpace;
  } catch {
    free = 0;
  }
  return { usedBytes: used, freeBytes: free };
}
