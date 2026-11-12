/**
 * The saver: one for the whole app, held above the navigator like the narrator, so a save
 * carries on while you browse, and so Settings and the trip sheet see the same progress.
 *
 * - **Saving.** A pack's manifest lists its parts; the parts not yet on the phone download
 *   three at a time (`SAVE_CONCURRENCY`), each recorded in the manifest the moment it is in
 *   place. That record is what makes a save resumable.
 * - **Restarts.** At launch, half downloaded files are swept away and every pack still
 *   marked `saving` carries on from its manifest, as soon as the network allows.
 * - **Wi-Fi.** With "Save only on Wi-Fi" on, a save waits off Wi-Fi and pauses when Wi-Fi
 *   is lost, and resumes when it comes back.
 * - **Updates.** Each time the phone is on Wi-Fi, every saved pack is planned again against
 *   the library and picks up new or changed echoes and drops retired ones (`diffPack`).
 * - **Stop and Remove.** Both cancel what is in flight and delete the pack's files, except
 *   files another saved pack also holds.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NetworkStateType, useNetworkState, type NetworkState } from "expo-network";
import { ECHOES } from "../library";
import {
  SAVE_CONCURRENCY,
  applyDiff,
  diffPack,
  echoesFor,
  isDiffEmpty,
  manifestFor,
  maySaveNow,
  orphanedKeys,
  pendingParts,
  planPack,
  progressOf,
  runPool,
  withPartSaved,
  type Connection,
  type ManifestPart,
  type PackManifest,
  type PackPlan,
  type PackSource,
} from "./plan";
import {
  deleteFiles,
  deletePackRecords,
  downloadPart,
  readManifests,
  readSettings,
  storage,
  sweep,
  writeEchoData,
  writeManifest,
  writeSettings,
  type OfflineSettings,
} from "./store";
import { sourceOf } from "./sources";

/** How long to wait before trying failed files again. */
const RETRY_MS = 60_000;

export interface PackProgress {
  readonly savedBytes: number;
  readonly totalBytes: number;
  readonly fraction: number;
}

interface Packs {
  /** Every pack on the phone, saving or saved, newest first. */
  readonly packs: readonly PackManifest[];
  readonly settings: OfflineSettings;
  readonly setWifiOnly: (on: boolean) => void;
  readonly connection: Connection;
  /** Whether a pack still saving is held back by the network right now. */
  readonly waiting: boolean;
  readonly storage: { readonly usedBytes: number; readonly freeBytes: number };
  /** Live progress for a pack being saved, counting the files in flight. */
  readonly progressOf: (packId: string) => PackProgress | null;
  readonly packById: (packId: string) => PackManifest | undefined;
  /** What saving this would take, before it is saved. */
  readonly plan: (source: PackSource) => PackPlan;
  readonly save: (source: PackSource) => void;
  /** Stop a save in progress; what it had saved is removed. */
  readonly stop: (packId: string) => void;
  readonly remove: (packId: string) => void;
}

const PacksContext = createContext<Packs | null>(null);

function connectionOf(state: NetworkState): Connection {
  if (!state.isConnected || state.type === undefined) return "none";
  if (state.type === NetworkStateType.WIFI || state.type === NetworkStateType.ETHERNET) return "wifi";
  if (state.type === NetworkStateType.NONE || state.type === NetworkStateType.UNKNOWN) return "none";
  return "cellular";
}

function byNewest(list: readonly PackManifest[]): PackManifest[] {
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
}

interface Job {
  readonly controller: AbortController;
  /** Set when the listener stopped or removed the pack, rather than the network pausing it. */
  discard: boolean;
}

export function PacksProvider({ children }: { children: ReactNode }) {
  const network = useNetworkState();
  const connection = connectionOf(network);

  // Launch: read what is on the phone and sweep up after any crash, once, before the first
  // render, so Settings never shows an empty list that then fills.
  const [onPhone] = useState(() => {
    const found = readManifests();
    sweep(found);
    return found;
  });
  // The manifests, as a ref the saver mutates and as state the screens render.
  const manifests = useRef(new Map(onPhone.map((m) => [m.id, m])));
  const [packs, setPacks] = useState<readonly PackManifest[]>(() => byNewest(onPhone));
  const [settings, setSettings] = useState<OfflineSettings>(() => readSettings());
  const [space, setSpace] = useState(() => storage());
  const [inFlight, setInFlight] = useState<Readonly<Record<string, number>>>({});
  const [retryTick, setRetryTick] = useState(0);
  const jobs = useRef(new Map<string, Job>());
  const flight = useRef(new Map<string, Map<string, number>>());
  const lastPaint = useRef(0);

  const publish = useCallback(() => {
    setPacks(byNewest([...manifests.current.values()]));
    setSpace(storage());
  }, []);

  const put = useCallback(
    (manifest: PackManifest) => {
      manifests.current.set(manifest.id, manifest);
      writeManifest(manifest);
      publish();
    },
    [publish],
  );

  const paintProgress = useCallback((force = false) => {
    const now = Date.now();
    if (!force && now - lastPaint.current < 250) return;
    lastPaint.current = now;
    const next: Record<string, number> = {};
    for (const [packId, files] of flight.current) {
      let sum = 0;
      for (const bytes of files.values()) sum += bytes;
      next[packId] = sum;
    }
    setInFlight(next);
  }, []);

  /** Delete a pack and every file of it no other pack holds. */
  const discard = useCallback(
    (packId: string) => {
      const manifest = manifests.current.get(packId);
      manifests.current.delete(packId);
      deletePackRecords(packId);
      if (manifest) deleteFiles(orphanedKeys([...manifests.current.values()], manifest.parts.map((p) => p.key)));
      publish();
    },
    [publish],
  );

  const run = useCallback(
    (packId: string) => {
      if (jobs.current.has(packId)) return;
      const start = manifests.current.get(packId);
      if (!start || start.state !== "saving") return;
      const job: Job = { controller: new AbortController(), discard: false };
      jobs.current.set(packId, job);
      const files = new Map<string, number>();
      flight.current.set(packId, files);
      const signal = job.controller.signal;

      const fetchOne = async (part: ManifestPart) => {
        files.set(part.key, 0);
        try {
          const bytes = await downloadPart(part, signal, (written) => {
            files.set(part.key, written);
            paintProgress();
          });
          const current = manifests.current.get(packId);
          if (signal.aborted || !current) return;
          put(withPartSaved(current, part.key, bytes, Date.now()));
        } finally {
          files.delete(part.key);
        }
      };

      void runPool(pendingParts(start), SAVE_CONCURRENCY, fetchOne, signal).then(({ failed }) => {
        jobs.current.delete(packId);
        flight.current.delete(packId);
        paintProgress(true);
        if (job.discard) discard(packId);
        else if (failed.length > 0) setTimeout(() => setRetryTick((n) => n + 1), RETRY_MS);
        // Paused by the network: look again now, in case it came back while this unwound.
        else setRetryTick((n) => n + 1);
      });
    },
    [discard, paintProgress, put],
  );

  // Updates: on Wi-Fi, bring every saved pack up to the library.
  useEffect(() => {
    if (connection !== "wifi") return;
    for (const manifest of [...manifests.current.values()]) {
      if (manifest.state !== "saved" || jobs.current.has(manifest.id)) continue;
      const source = sourceOf(manifest);
      if (!source) continue;
      const plan = planPack(source, ECHOES);
      const diff = diffPack(manifest, plan);
      if (isDiffEmpty(diff)) continue;
      const next = applyDiff(manifest, plan, diff, Date.now());
      writeEchoData(next.id, echoesFor(source, ECHOES));
      put(next);
      deleteFiles(orphanedKeys([...manifests.current.values()], diff.removed));
    }
  }, [connection, put]);

  // Saving runs while the network allows it, and pauses when it does not.
  const allowed = maySaveNow(connection, settings.wifiOnly);
  useEffect(() => {
    if (!allowed) {
      for (const job of jobs.current.values()) job.controller.abort();
      return;
    }
    for (const manifest of packs) if (manifest.state === "saving") run(manifest.id);
  }, [allowed, packs, retryTick, run]);

  // Leaving: stop every transfer (the manifests already say where each got to).
  useEffect(() => {
    const running = jobs.current;
    return () => {
      for (const job of running.values()) job.controller.abort();
    };
  }, []);

  const save = useCallback(
    (source: PackSource) => {
      const plan = planPack(source, ECHOES);
      const existing = manifests.current.get(plan.id);
      if (existing) {
        const diff = diffPack(existing, plan);
        if (!isDiffEmpty(diff)) put(applyDiff(existing, plan, diff, Date.now()));
        return;
      }
      writeEchoData(plan.id, echoesFor(source, ECHOES));
      put(manifestFor(plan, Date.now()));
    },
    [put],
  );

  const stopOrRemove = useCallback(
    (packId: string) => {
      const job = jobs.current.get(packId);
      if (job) {
        // The job deletes the pack once its transfers have unwound.
        job.discard = true;
        job.controller.abort();
        return;
      }
      discard(packId);
    },
    [discard],
  );

  const setWifiOnly = useCallback((on: boolean) => {
    const next = { wifiOnly: on };
    setSettings(next);
    writeSettings(next);
  }, []);

  const plan = useCallback((source: PackSource) => planPack(source, ECHOES), []);

  const value = useMemo<Packs>(() => {
    const byId = new Map(packs.map((p) => [p.id, p]));
    return {
      packs,
      settings,
      setWifiOnly,
      connection,
      waiting: !allowed && packs.some((p) => p.state === "saving"),
      storage: space,
      packById: (id) => byId.get(id),
      progressOf: (id) => {
        const manifest = byId.get(id);
        if (!manifest) return null;
        const base = progressOf(manifest);
        const saved = Math.min(base.totalBytes, base.savedBytes + (inFlight[id] ?? 0));
        return { savedBytes: saved, totalBytes: base.totalBytes, fraction: base.totalBytes > 0 ? saved / base.totalBytes : 1 };
      },
      plan,
      save,
      stop: stopOrRemove,
      remove: stopOrRemove,
    };
  }, [allowed, connection, inFlight, packs, plan, save, setWifiOnly, settings, space, stopOrRemove]);

  return <PacksContext.Provider value={value}>{children}</PacksContext.Provider>;
}

export function usePacks(): Packs {
  const packs = useContext(PacksContext);
  if (!packs) throw new Error("usePacks outside PacksProvider");
  return packs;
}
