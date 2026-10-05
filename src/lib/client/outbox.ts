/**
 * Offline submission outbox (plan section 6): graded attempts are queued in
 * IndexedDB and POSTed to /api/sync when the device is back online. UI shows
 * "tersimpan lokal, akan disinkronkan" while the queue is non-empty.
 *
 * /api/sync contract (src/app/api/sync/route.ts): the server re-grades from
 * the regenerated set, so a queued attempt carries only
 *   { skillId, step, seed, answers, timeMs, completedAt }
 * Batches POST { attempts: [...] } (oldest first, max 10) and the response is
 * index-aligned: { results: [{ status: "applied" | "duplicate" | "rejected" }] }.
 * applied/duplicate remove the record. Permanently rejected records — a 4xx
 * response (expired session, paywall) or a per-record "rejected" — retry up
 * to MAX_OUTBOX_TRIES and then dead-letter (status "failed") so SyncIndicator
 * can surface them; network-class failures (5xx, fetch throws) retry forever.
 *
 * All queue logic (ordering, capacity eviction, result partitioning, retry
 * backoff, batching) is pure and unit-testable via MemoryOutboxStore.
 */

import type { Answer } from "@/lib/engine/types";
import type { TaskDescriptor } from "@/lib/client/view-models";

/** One graded attempt, as stored offline and shipped to /api/sync. */
export type SyncAttempt = {
  skillId: string;
  step: number;
  /** Canonical set seed (setSeed output) — the set regenerates from this. */
  seed: number;
  /** First-pass answers, null = skipped; the server re-grades these. */
  answers: (Answer | null)[];
  /** Wall-clock time the child took, in ms (incl. self-correction). */
  timeMs: number;
  /** Client completion timestamp (ISO); used for streak day attribution. */
  completedAt: string;
};

export type OutboxRecord = {
  /** Client-generated uuid. */
  id: string;
  createdAt: string;
  tries: number;
  lastTriedAt: string | null;
  attempt: SyncAttempt;
  /**
   * "failed" = dead-lettered: the server permanently rejected this record
   * (4xx response or per-record "rejected" result) on MAX_OUTBOX_TRIES
   * distinct tries, so it is no longer retried. Absent = still pending.
   */
  status?: "pending" | "failed";
};

/**
 * How many times a permanently-rejected record (4xx / "rejected" result) is
 * retried before it dead-letters. Network-class failures (5xx, fetch throws)
 * keep retrying forever — the outage may recover.
 */
export const MAX_OUTBOX_TRIES = 5;

/** Index-aligned per-attempt outcome from POST /api/sync. */
export type SyncResultStatus = "applied" | "duplicate" | "rejected";

/**
 * One applied attempt's authoritative server verdict (subset of the
 * /api/sync response): the recomputed gate decision and stars awarded.
 */
export type SyncOutcome = {
  status: SyncResultStatus;
  gate?: import("@/lib/engine/types").GateDecision;
  starsAwarded?: number;
};

export type SyncResponse = { results: SyncOutcome[] };

// ---------------------------------------------------------------------------
// Store abstraction
// ---------------------------------------------------------------------------

export interface OutboxStore {
  getAll(): Promise<OutboxRecord[]>;
  put(record: OutboxRecord): Promise<void>;
  delete(id: string): Promise<void>;
}

const DB_NAME = "saasmath-outbox";
const DB_VERSION = 2;
const STORE_NAME = "pending";
const LAST_SET_STORE = "lastSet";

/** Opens the shared offline DB; the upgrade creates both object stores. */
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(LAST_SET_STORE)) {
        db.createObjectStore(LAST_SET_STORE, { keyPath: "childKey" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB.open failed"));
  });
}

/** IndexedDB-backed store. Constructor does no IO; opening happens lazily. */
export class IdbOutboxStore implements OutboxStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDb();
    }
    return this.dbPromise;
  }

  private async tx<T>(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const request = fn(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("indexedDB request failed"));
    });
  }

  getAll(): Promise<OutboxRecord[]> {
    return this.tx("readonly", (store) => store.getAll() as IDBRequest<OutboxRecord[]>);
  }

  put(record: OutboxRecord): Promise<void> {
    return this.tx("readwrite", (store) => store.put(record) as IDBRequest<IDBValidKey>).then(
      () => undefined,
    );
  }

  delete(id: string): Promise<void> {
    return this.tx("readwrite", (store) => store.delete(id) as IDBRequest<undefined>).then(
      () => undefined,
    );
  }
}

/** In-memory store for tests, SSR and private-mode fallbacks. */
export class MemoryOutboxStore implements OutboxStore {
  private map = new Map<string, OutboxRecord>();

  getAll(): Promise<OutboxRecord[]> {
    return Promise.resolve([...this.map.values()]);
  }
  put(record: OutboxRecord): Promise<void> {
    this.map.set(record.id, record);
    return Promise.resolve();
  }
  delete(id: string): Promise<void> {
    this.map.delete(id);
    return Promise.resolve();
  }
}

// ---------------------------------------------------------------------------
// Last offered set (cold-start offline replay, plan section 6)
// ---------------------------------------------------------------------------

/**
 * The most recently OFFERED set per child, kept beside the outbox so a cold
 * start with no network can still replay the last drill. Keyed by the child
 * handle the player receives (its display name) — the outbox DB is
 * origin-scoped, so per-child slotting relies on the login flow switching
 * children deliberately.
 */
export interface LastTaskStore {
  get(childKey: string): Promise<TaskDescriptor | null>;
  put(childKey: string, task: TaskDescriptor): Promise<void>;
}

interface StoredLastTask {
  childKey: string;
  savedAt: string;
  task: TaskDescriptor;
}

/** IndexedDB-backed (same DB as the outbox, `lastSet` store). */
export class IdbLastTaskStore implements LastTaskStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDb();
    }
    return this.dbPromise;
  }

  private async tx<T>(
    fn: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(LAST_SET_STORE, "readonly");
      const request = fn(transaction.objectStore(LAST_SET_STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("indexedDB request failed"));
    });
  }

  async get(childKey: string): Promise<TaskDescriptor | null> {
    const stored = await this.tx((store) =>
      store.get(childKey) as IDBRequest<StoredLastTask | undefined>,
    );
    return stored?.task ?? null;
  }

  async put(childKey: string, task: TaskDescriptor): Promise<void> {
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(LAST_SET_STORE, "readwrite");
      const request = transaction.objectStore(LAST_SET_STORE).put({
        childKey,
        savedAt: new Date().toISOString(),
        task,
      } satisfies StoredLastTask);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("indexedDB request failed"));
    });
  }
}

/** In-memory store for tests, SSR and private-mode fallbacks. */
export class MemoryLastTaskStore implements LastTaskStore {
  private map = new Map<string, TaskDescriptor>();

  async get(childKey: string): Promise<TaskDescriptor | null> {
    return this.map.get(childKey) ?? null;
  }
  async put(childKey: string, task: TaskDescriptor): Promise<void> {
    this.map.set(childKey, task);
  }
}

let sharedLastTaskStore: LastTaskStore | null = null;

/** IndexedDB when available; in-memory fallback (private mode / SSR / tests). */
export function getLastTaskStore(): LastTaskStore {
  if (!sharedLastTaskStore) {
    sharedLastTaskStore =
      typeof window !== "undefined" && "indexedDB" in window
        ? new IdbLastTaskStore()
        : new MemoryLastTaskStore();
  }
  return sharedLastTaskStore;
}

/**
 * Best-effort save of the set the child was just offered — storage failures
 * must never break the load path that calls it.
 */
export async function saveLastOfferedTask(
  childKey: string,
  task: TaskDescriptor,
): Promise<void> {
  try {
    await getLastTaskStore().put(childKey, task);
  } catch {
    // Offline storage unavailable (evicted, private mode): replay simply
    // won't be offered later.
  }
}

/** The set to replay offline, or null when nothing was cached yet. */
export async function loadLastOfferedTask(
  childKey: string,
): Promise<TaskDescriptor | null> {
  try {
    return await getLastTaskStore().get(childKey);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Shared queue access (browser singleton; SSR/tests fall back to memory)
// ---------------------------------------------------------------------------

let sharedStore: OutboxStore | null = null;

/** IndexedDB when available; in-memory fallback (private mode / SSR / tests). */
export function getOutboxStore(): OutboxStore {
  if (!sharedStore) {
    sharedStore =
      typeof window !== "undefined" && "indexedDB" in window
        ? new IdbOutboxStore()
        : new MemoryOutboxStore();
  }
  return sharedStore;
}

/** Enqueue one attempt (returns its record id) without flushing yet. */
export async function queueAttempt(attempt: SyncAttempt): Promise<string> {
  const store = getOutboxStore();
  const record = newOutboxRecord(attempt, new Date());
  const all = await store.getAll();
  const kept = evictOverflow([...all, record], 50);
  const keptIds = new Set(kept.map((r) => r.id));
  // Evictions are independent deletes (distinct keys).
  const evicted = all.filter((r) => !keptIds.has(r.id));
  await Promise.all(evicted.map((r) => store.delete(r.id)));
  await store.put(record);
  return record.id;
}

// ---------------------------------------------------------------------------
// Queue logic (pure)
// ---------------------------------------------------------------------------

export function newOutboxRecord(attempt: SyncAttempt, now: Date): OutboxRecord {
  return {
    id: crypto.randomUUID(),
    createdAt: now.toISOString(),
    tries: 0,
    lastTriedAt: null,
    attempt,
  };
}

/** Oldest-first ordering for flushing. */
export function sortForFlush(records: OutboxRecord[]): OutboxRecord[] {
  return [...records].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}

/**
 * Capacity guard: keep the newest `cap` records; drop the oldest beyond that
 * so one long offline stretch cannot exhaust storage.
 */
export function evictOverflow(records: OutboxRecord[], cap: number): OutboxRecord[] {
  const sorted = sortForFlush(records);
  return sorted.length <= cap ? sorted : sorted.slice(sorted.length - cap);
}

/**
 * Split a batch by the index-aligned /api/sync results. applied/duplicate
 * are done (duplicate = the server already has that attempt); rejected
 * records stay queued.
 */
export function partitionByResults(
  batch: OutboxRecord[],
  results: { status: SyncResultStatus }[],
): { done: OutboxRecord[]; retry: OutboxRecord[] } {
  const done: OutboxRecord[] = [];
  const retry: OutboxRecord[] = [];
  batch.forEach((record, i) => {
    const status = results[i]?.status;
    if (status === "applied" || status === "duplicate") done.push(record);
    else retry.push(record);
  });
  return { done, retry };
}

/** /api/sync accepts at most 10 attempts per call. */
export function chunkBatch(records: OutboxRecord[], size = 10): OutboxRecord[][] {
  const chunks: OutboxRecord[][] = [];
  for (let i = 0; i < records.length; i += size) {
    chunks.push(records.slice(i, i + size));
  }
  return chunks;
}

/** Exponential backoff: 30s, 1m, 2m, 4m ... capped at 15 minutes. */
export function nextRetryDelayMs(record: OutboxRecord): number {
  const base = 30_000 * Math.pow(2, Math.min(record.tries, 5));
  return Math.min(base, 15 * 60_000);
}

/** Records ready to send now (never tried, or backoff elapsed). Dead-lettered records never come back. */
export function dueForRetry(records: OutboxRecord[], now: Date): OutboxRecord[] {
  return sortForFlush(records).filter((r) => {
    if (r.status === "failed") return false;
    if (r.lastTriedAt === null) return true;
    return now.getTime() - new Date(r.lastTriedAt).getTime() >= nextRetryDelayMs(r);
  });
}

/** True for statuses the server actively decided — retrying cannot fix them. */
export function isPermanentFailure(status: number): boolean {
  return status >= 400 && status < 500;
}

/** Pending vs dead-lettered split, for the sync indicator UI. */
export function splitPendingFailed(
  records: OutboxRecord[],
): { pendingCount: number; failedCount: number } {
  let failedCount = 0;
  for (const r of records) {
    if (r.status === "failed") failedCount++;
  }
  return { pendingCount: records.length - failedCount, failedCount };
}

// ---------------------------------------------------------------------------
// Flush
// ---------------------------------------------------------------------------

export type FlushResult = {
  syncedCount: number;
  failedCount: number;
  /** "offline" = no network / non-OK response; "error" = unexpected throw. */
  status: "idle" | "synced" | "partial" | "offline" | "error";
  /** Per-record outcomes (applied records carry the server's gate/stars). */
  outcomes: Record<string, SyncOutcome>;
};

/**
 * Bump the try counter; permanently-rejected records dead-letter once the
 * try cap is reached so they stop consuming sync attempts forever.
 */
function touch(record: OutboxRecord, now: Date, permanent: boolean): OutboxRecord {
  const tries = record.tries + 1;
  return {
    ...record,
    tries,
    lastTriedAt: now.toISOString(),
    ...(permanent && tries >= MAX_OUTBOX_TRIES ? { status: "failed" as const } : {}),
  };
}

/**
 * One in-flight flush per store: every consumer (30s interval,
 * visibilitychange, post-submit refresh) racing a flush shares the same
 * promise instead of sending duplicate /api/sync batches. The entry clears
 * when the flight settles, so the next cycle flushes anew.
 */
const inFlightFlushes = new WeakMap<OutboxStore, Promise<FlushResult>>();

/**
 * Send all due records to /api/sync in batches of 10 and apply the results.
 * Single-flight per store. `fetchImpl` is injectable for tests. Applied
 * records carry the server's authoritative gate decision and stars in
 * `outcomes`.
 */
export function flushOutbox(
  store: OutboxStore,
  fetchImpl: typeof fetch,
  now: Date = new Date(),
  endpoint = "/api/sync",
): Promise<FlushResult> {
  const inFlight = inFlightFlushes.get(store);
  if (inFlight) return inFlight;
  const flight = flushDueBatches(store, fetchImpl, now, endpoint).finally(() => {
    inFlightFlushes.delete(store);
  });
  inFlightFlushes.set(store, flight);
  return flight;
}

async function flushDueBatches(
  store: OutboxStore,
  fetchImpl: typeof fetch,
  now: Date,
  endpoint: string,
): Promise<FlushResult> {
  const all = await store.getAll();
  const due = dueForRetry(all, now);
  if (due.length === 0) {
    return { syncedCount: 0, failedCount: 0, status: "idle", outcomes: {} };
  }

  let syncedCount = 0;
  let failedCount = 0;
  let hadNetworkError = false;
  let hadThrow = false;
  const outcomes: Record<string, SyncOutcome> = {};

  // Batches are applied strictly oldest-first (the server folds each batch
  // into the gate ladder, streak, and implausibility history in arrival
  // order), so the loop is intentionally sequential — `for await` makes that
  // ordering explicit.
  for await (const batch of chunkBatch(due)) {
    try {
      const res = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attempts: batch.map((r) => r.attempt),
        }),
      });
      if (res.ok) {
        const body = (await res.json()) as Partial<SyncResponse>;
        const results = Array.isArray(body.results) ? body.results : [];
        // Defensive: a response without per-attempt results is treated as
        // all-applied only when the array is missing entirely (older server).
        const effective =
          results.length === batch.length
            ? results
            : batch.map(() => ({ status: "applied" as const }));
        batch.forEach((record, i) => {
          outcomes[record.id] = effective[i] ?? { status: "rejected" };
        });
        const { done, retry } = partitionByResults(batch, effective);
        syncedCount += done.length;
        failedCount += retry.length;
        // A per-record "rejected" is the server's deliberate verdict on this
        // exact input (it re-grades deterministically from the seed) — same
        // permanent class as a 4xx response.
        // Per-record store writes are independent (distinct keys).
        await Promise.all(done.map((r) => store.delete(r.id)));
        await Promise.all(retry.map((r) => store.put(touch(r, now, true))));
      } else {
        const permanent = isPermanentFailure(res.status);
        if (!permanent) hadNetworkError = true;
        failedCount += batch.length;
        await Promise.all(batch.map((r) => store.put(touch(r, now, permanent))));
      }
    } catch {
      // Fetch throwing = no response at all (offline, DNS, CORS): network-class.
      hadThrow = true;
      failedCount += batch.length;
      await Promise.all(batch.map((r) => store.put(touch(r, now, false))));
    }
  }

  const status: FlushResult["status"] =
    failedCount === 0
      ? "synced"
      : syncedCount > 0
        ? "partial"
        : hadThrow
          ? "error"
          : hadNetworkError
            ? "offline"
            : "partial";
  return { syncedCount, failedCount, status, outcomes };
}
