/**
 * The collection, kept in the browser.
 *
 * IndexedDB rather than `localStorage`, for one reason that matters and one that will:
 * `localStorage` is synchronous and blocks the main thread, which on a phone means the map
 * stutters every time an echo opens; and it caps out around 5 MB, which a few thousand
 * records plus whatever else the app keeps would eventually reach.
 *
 * The interesting part of this file is the failure handling, because storage fails far more
 * often than people expect. Private browsing disables it entirely in some browsers. A
 * listener can deny quota, or have none left. Safari evicts whole origins after a week of
 * not visiting. Every one of those is a normal Tuesday, not an exception — so every path
 * here resolves rather than throws, and a load that cannot read returns an empty collection
 * instead of taking the app down with it.
 *
 * What it will not do is pretend. A failed *save* rejects, because the engine surfaces that
 * as an error the listener can be told about, and silently losing somebody's collection
 * while showing them a number that goes up is worse than admitting the storage is broken.
 */

import type { CaptureRecord, CollectionStore } from "@echofinders/core";

const DB_NAME = "echo-finders";
const DB_VERSION = 1;
const STORE = "collection";

/**
 * One store per journey key.
 *
 * Collections are per-route in the prototype because switching modes starts a new journey
 * with its own captures. A real build keys this by listener, not by route — but the seam is
 * the same, and the engine neither knows nor cares which.
 */
export class IndexedDbCollection implements CollectionStore {
  private db: Promise<IDBDatabase | null> | null = null;

  constructor(private readonly key: string) {}

  async load(): Promise<readonly CaptureRecord[]> {
    const db = await this.open();
    if (!db) return [];
    try {
      const stored = await request<{ key: string; records: CaptureRecord[] } | undefined>(
        db.transaction(STORE, "readonly").objectStore(STORE).get(this.key),
      );
      return stored?.records ?? [];
    } catch {
      // A collection we cannot read is a collection the listener has effectively lost. Say
      // nothing and start clean rather than refusing to open the app.
      return [];
    }
  }

  async save(records: readonly CaptureRecord[]): Promise<void> {
    const db = await this.open();
    if (!db) throw new Error("No storage available in this browser");
    await request(
      db
        .transaction(STORE, "readwrite")
        .objectStore(STORE)
        .put({ key: this.key, records: [...records] }),
    );
  }

  async clear(): Promise<void> {
    const db = await this.open();
    if (!db) return;
    try {
      await request(db.transaction(STORE, "readwrite").objectStore(STORE).delete(this.key));
    } catch {
      // Nothing useful to do, and a delete that fails leaves no worse state than before.
    }
  }

  /** Opened once, lazily, and never retried: a browser that refuses will refuse again. */
  private open(): Promise<IDBDatabase | null> {
    this.db ??= new Promise((resolve) => {
      if (typeof indexedDB === "undefined") {
        resolve(null);
        return;
      }
      let settled = false;
      const done = (db: IDBDatabase | null) => {
        if (settled) return;
        settled = true;
        resolve(db);
      };

      try {
        const open = indexedDB.open(DB_NAME, DB_VERSION);
        open.onupgradeneeded = () => {
          if (!open.result.objectStoreNames.contains(STORE)) {
            open.result.createObjectStore(STORE, { keyPath: "key" });
          }
        };
        open.onsuccess = () => done(open.result);
        open.onerror = () => done(null);
        // Fires when another tab holds an older version open. Nothing to wait for.
        open.onblocked = () => done(null);
        // Private browsing in some builds neither resolves nor errors — it simply never
        // calls back, and an app that awaits it hangs on a blank screen forever.
        setTimeout(() => done(null), 3000);
      } catch {
        done(null);
      }
    });
    return this.db;
  }
}

/** Promisify one IDB request. */
function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}
