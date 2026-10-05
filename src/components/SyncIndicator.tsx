"use client";

/**
 * Offline sync indicator + outbox hook. Shows "tersimpan lokal, akan
 * disinkronkan" whenever pending submissions sit in IndexedDB, and a visible
 * "gagal disinkronkan" state for dead-lettered records the server permanently
 * rejected. Flushes on reconnect / interval / after each new submission (plan
 * section 6) — flushOutbox itself is single-flight, so concurrent consumers
 * share one flight instead of racing duplicate batches.
 *
 * Queue mechanics (store singleton, enqueue, flush, dead-lettering) live in
 * src/lib/client/outbox.ts so this file exports only the hook and the
 * component (fast-refresh boundary).
 */

import { useCallback, useEffect, useState } from "react";

import {
  dueForRetry,
  flushOutbox,
  getOutboxStore,
  splitPendingFailed,
  type FlushResult,
  type OutboxStore,
} from "@/lib/client/outbox";

export type OutboxStatus = {
  pendingCount: number;
  /** Records dead-lettered after permanent rejection (4xx / "rejected"). */
  failedCount: number;
  online: boolean;
  lastSync: Date | null;
};

/** Shared hook: count pending + failed, flush on events, expose refresh(). */
export function useOutbox(): OutboxStatus & {
  refresh: () => Promise<FlushResult | null>;
  store: OutboxStore;
} {
  const store = getOutboxStore();
  const [status, setStatus] = useState<OutboxStatus>({
    pendingCount: 0,
    failedCount: 0,
    online: true,
    lastSync: null,
  });

  const refresh = useCallback(async (): Promise<FlushResult | null> => {
    const all = await store.getAll();
    const due = dueForRetry(all, new Date());
    setStatus((prev) => ({ ...prev, ...splitPendingFailed(all) }));
    if (due.length === 0 || !navigator.onLine) return null;
    const result = await flushOutbox(store, fetch.bind(globalThis));
    // Re-read after the flush: applied records were deleted, permanently
    // rejected ones dead-lettered, and new submissions may have queued
    // meanwhile — the store is the single source of truth for the counts.
    const after = splitPendingFailed(await store.getAll());
    const syncedAt = result.syncedCount > 0 ? new Date() : null;
    setStatus((prev) => ({
      pendingCount: after.pendingCount,
      failedCount: after.failedCount,
      online: true,
      lastSync: syncedAt ?? prev.lastSync,
    }));
    return result;
  }, [store]);

  useEffect(() => {
    const updateOnline = () =>
      setStatus((prev) => ({ ...prev, online: navigator.onLine }));
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    // Deferred: flush must not setState synchronously inside the effect body.
    const kickoff = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
      window.clearTimeout(kickoff);
    };
  }, [refresh]);

  return { ...status, refresh, store };
}

export function SyncIndicator() {
  const { pendingCount, failedCount, online, lastSync } = useOutbox();

  if (pendingCount === 0 && failedCount === 0 && online) {
    return (
      <p className="px-3 py-1 text-center text-xs text-slate-400">
        {lastSync ? "Semua hasil sudah tersinkron ✓" : "\u00a0"}
      </p>
    );
  }

  // Dead-lettered records must stay visible: the server permanently rejected
  // them, so "akan disinkronkan" would promise something that never happens.
  if (failedCount > 0) {
    const pendingSuffix = pendingCount > 0 ? ` · tersimpan lokal (${pendingCount})` : "";
    const offlineSuffix = !online ? " — kamu sedang offline" : "";
    return (
      <p
        className="bg-rose-100 px-3 py-1 text-center text-xs font-medium text-rose-800"
        role="status"
      >
        Gagal disinkronkan ({failedCount}){pendingSuffix}
        {offlineSuffix}
      </p>
    );
  }

  const tone = !online
    ? "bg-amber-100 text-amber-800"
    : "bg-sky-100 text-sky-800";
  const text = !online
    ? `Tersimpan lokal, akan disinkronkan (${pendingCount}) — kamu sedang offline`
    : `Tersimpan lokal, akan disinkronkan (${pendingCount})`;

  return (
    <p className={`px-3 py-1 text-center text-xs font-medium ${tone}`} role="status">
      {text}
    </p>
  );
}
