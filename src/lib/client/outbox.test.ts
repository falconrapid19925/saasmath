import { describe, expect, it, vi } from "vitest";

import {
  chunkBatch,
  dueForRetry,
  evictOverflow,
  flushOutbox,
  MemoryLastTaskStore,
  MemoryOutboxStore,
  newOutboxRecord,
  nextRetryDelayMs,
  partitionByResults,
  sortForFlush,
  splitPendingFailed,
  type OutboxRecord,
  type SyncAttempt,
} from "./outbox";
import type { TaskDescriptor } from "@/lib/client/view-models";

function fakeAttempt(seed: number): SyncAttempt {
  return {
    skillId: "k4-mult-1digit",
    step: 1,
    seed,
    answers: [{ kind: "integer", value: 42 }, null],
    timeMs: 30_000,
    completedAt: "2026-10-04T01:00:00.000Z",
  };
}

function makeRecord(id: string, createdAt: string, seed = 1): OutboxRecord {
  return {
    id,
    createdAt,
    tries: 0,
    lastTriedAt: null,
    attempt: fakeAttempt(seed),
  };
}

function jsonResponse(body: unknown, ok = true, status?: number): Response {
  return new Response(JSON.stringify(body), {
    status: status ?? (ok ? 200 : 500),
    headers: { "Content-Type": "application/json" },
  });
}

describe("queue ordering and capacity", () => {
  it("sorts oldest-first by createdAt then id", () => {
    const sorted = sortForFlush([
      makeRecord("b", "2026-10-02T00:00:00.000Z"),
      makeRecord("a", "2026-10-02T00:00:00.000Z"),
      makeRecord("c", "2026-10-01T00:00:00.000Z"),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(["c", "a", "b"]);
  });

  it("evicts oldest records beyond the cap, keeping the newest", () => {
    const records = Array.from({ length: 5 }, (_, i) =>
      makeRecord(`r${i}`, new Date(Date.UTC(2026, 9, i + 1)).toISOString()),
    );
    const kept = evictOverflow(records, 3);
    expect(kept.map((r) => r.id)).toEqual(["r2", "r3", "r4"]);
    expect(evictOverflow(records, 10)).toHaveLength(5);
  });
});

describe("chunkBatch", () => {
  it("chunks to the /api/sync batch size of 10", () => {
    const records = Array.from({ length: 23 }, (_, i) =>
      makeRecord(`r${i}`, new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString()),
    );
    const chunks = chunkBatch(records);
    expect(chunks.map((c) => c.length)).toEqual([10, 10, 3]);
  });
});

describe("partitionByResults", () => {
  it("treats applied and duplicate as done, rejected as retry", () => {
    const batch = [makeRecord("a", "t1"), makeRecord("b", "t2"), makeRecord("c", "t3")];
    const { done, retry } = partitionByResults(batch, [
      { status: "applied" },
      { status: "duplicate" },
      { status: "rejected" },
    ]);
    expect(done.map((r) => r.id)).toEqual(["a", "b"]);
    expect(retry.map((r) => r.id)).toEqual(["c"]);
  });

  it("keeps records whose result is missing (defensive)", () => {
    const batch = [makeRecord("a", "t1"), makeRecord("b", "t2")];
    const { done, retry } = partitionByResults(batch, [{ status: "applied" }]);
    expect(done.map((r) => r.id)).toEqual(["a"]);
    expect(retry.map((r) => r.id)).toEqual(["b"]);
  });
});

describe("retry backoff", () => {
  it("doubles from 30s and caps at 15m", () => {
    const base = makeRecord("x", "t");
    expect(nextRetryDelayMs(base)).toBe(30_000);
    expect(nextRetryDelayMs({ ...base, tries: 1 })).toBe(60_000);
    expect(nextRetryDelayMs({ ...base, tries: 2 })).toBe(120_000);
    expect(nextRetryDelayMs({ ...base, tries: 10 })).toBe(900_000);
  });

  it("dueForRetry waits out the backoff window", () => {
    const now = new Date("2026-10-04T00:00:00.000Z");
    const fresh = makeRecord("fresh", "2026-10-02T00:00:00.000Z");
    const cooled = makeRecord("cooled", "2026-10-01T00:00:00.000Z");
    const waiting = makeRecord("waiting", "2026-10-01T00:00:00.000Z");
    waiting.tries = 1;
    waiting.lastTriedAt = "2026-10-03T23:59:45.000Z"; // 15s ago, backoff is 60s
    cooled.lastTriedAt = "2026-10-03T23:58:00.000Z"; // 120s ago

    const due = dueForRetry([fresh, cooled, waiting], now);
    expect(due.map((r) => r.id)).toEqual(["cooled", "fresh"]);
  });
});

describe("flushOutbox", () => {
  it("posts { attempts } and drops applied/duplicate records", async () => {
    const store = new MemoryOutboxStore();
    await store.put(makeRecord("a", "2026-10-01T00:00:00.000Z"));
    await store.put(makeRecord("b", "2026-10-02T00:00:00.000Z"));

    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ results: [{ status: "applied" }, { status: "duplicate" }] }));
    const result = await flushOutbox(store, fetchImpl, new Date("2026-10-04T00:00:00.000Z"));

    expect(result.status).toBe("synced");
    expect(result.syncedCount).toBe(2);
    expect(await store.getAll()).toHaveLength(0);

    // Payload shape matches /api/sync: attempts only (server re-grades).
    const body = JSON.parse((fetchImpl.mock.calls[0]?.[1] as RequestInit).body as string) as {
      attempts: SyncAttempt[];
    };
    expect(body.attempts).toHaveLength(2);
    expect(body.attempts[0]).toMatchObject({
      skillId: "k4-mult-1digit",
      step: 1,
      timeMs: 30_000,
      completedAt: "2026-10-04T01:00:00.000Z",
    });
    expect(body.attempts[0].answers).toEqual([{ kind: "integer", value: 42 }, null]);
    // Oldest first.
    expect(body.attempts[0].seed).toBe(1);
  });

  it("keeps and bumps rejected records", async () => {
    const store = new MemoryOutboxStore();
    await store.put(makeRecord("a", "2026-10-01T00:00:00.000Z"));
    await store.put(makeRecord("b", "2026-10-02T00:00:00.000Z"));
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ results: [{ status: "applied" }, { status: "rejected" }] }),
    );

    const result = await flushOutbox(store, fetchImpl, new Date("2026-10-04T00:00:00.000Z"));
    expect(result.status).toBe("partial");
    const remaining = await store.getAll();
    expect(remaining.map((r) => r.id)).toEqual(["b"]);
    expect(remaining[0].tries).toBe(1);
  });

  it("reports offline and bumps tries on a non-OK response", async () => {
    const store = new MemoryOutboxStore();
    await store.put(makeRecord("a", "2026-10-01T00:00:00.000Z"));
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false));

    const result = await flushOutbox(store, fetchImpl, new Date("2026-10-04T00:00:00.000Z"));
    expect(result.status).toBe("offline");
    expect(result.failedCount).toBe(1);
    expect((await store.getAll())[0].tries).toBe(1);
  });

  it("reports error when fetch throws", async () => {
    const store = new MemoryOutboxStore();
    await store.put(makeRecord("a", "2026-10-01T00:00:00.000Z"));
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await flushOutbox(store, fetchImpl, new Date("2026-10-04T00:00:00.000Z"));
    expect(result.status).toBe("error");
    expect(result.failedCount).toBe(1);
  });

  it("is idle when nothing is due", async () => {
    const store = new MemoryOutboxStore();
    const rec = makeRecord("a", "2026-10-01T00:00:00.000Z");
    rec.lastTriedAt = "2026-10-04T00:00:00.000Z"; // just tried
    await store.put(rec);

    const fetchImpl = vi.fn();
    const result = await flushOutbox(store, fetchImpl, new Date("2026-10-04T00:00:00.000Z"));
    expect(result.status).toBe("idle");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends batches of at most 10", async () => {
    const store = new MemoryOutboxStore();
    for (let i = 0; i < 12; i++) {
      await store.put(makeRecord(`r${i}`, new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(), i + 1));
    }
    const fetchImpl = vi.fn(async (_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string) as {
        attempts: unknown[];
      };
      return jsonResponse({
        results: body.attempts.map(() => ({ status: "applied" })),
      });
    });

    const result = await flushOutbox(store, fetchImpl, new Date("2026-10-04T00:00:00.000Z"));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("synced");
    expect(result.syncedCount).toBe(12);
  });

  it("shares one in-flight promise when consumers flush concurrently", async () => {
    const store = new MemoryOutboxStore();
    await store.put(makeRecord("a", "2026-10-01T00:00:00.000Z"));

    let release!: (res: Response) => void;
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );

    const first = flushOutbox(store, fetchImpl, new Date("2026-10-04T00:00:00.000Z"));
    const second = flushOutbox(store, fetchImpl, new Date("2026-10-04T00:00:00.000Z"));
    // One network round-trip, not two racing batches.
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));

    release(jsonResponse({ results: [{ status: "applied" }] }));
    const [r1, r2] = await Promise.all([first, second]);
    expect(r1).toBe(r2); // literally the same flight
    expect(r1.syncedCount).toBe(1);
    expect(await store.getAll()).toHaveLength(0);
  });

  it("starts a fresh flight once the previous flush settled", async () => {
    const store = new MemoryOutboxStore();
    const fetchImpl = vi.fn(async () => jsonResponse({ results: [{ status: "applied" }] }));
    const now = new Date("2026-10-04T00:00:00.000Z");

    await store.put(makeRecord("a", "2026-10-01T00:00:00.000Z"));
    await flushOutbox(store, fetchImpl, now); // flight #1 settles
    await store.put(makeRecord("b", "2026-10-02T00:00:00.000Z"));
    const second = await flushOutbox(store, fetchImpl, now); // must not be swallowed by the settled flight
    expect(second.syncedCount).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("flushes different stores independently", async () => {
    const storeA = new MemoryOutboxStore();
    const storeB = new MemoryOutboxStore();
    await storeA.put(makeRecord("a", "2026-10-01T00:00:00.000Z"));
    await storeB.put(makeRecord("b", "2026-10-01T00:00:00.000Z"));
    const fetchImpl = vi.fn(async () => jsonResponse({ results: [{ status: "applied" }] }));

    const now = new Date("2026-10-04T00:00:00.000Z");
    await Promise.all([flushOutbox(storeA, fetchImpl, now), flushOutbox(storeB, fetchImpl, now)]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(await storeA.getAll()).toHaveLength(0);
    expect(await storeB.getAll()).toHaveLength(0);
  });
});

describe("newOutboxRecord", () => {
  it("creates a fresh record with a unique id", () => {
    const now = new Date("2026-10-04T00:00:00.000Z");
    const r1 = newOutboxRecord(fakeAttempt(1), now);
    const r2 = newOutboxRecord(fakeAttempt(2), now);
    expect(r1.id).not.toEqual(r2.id);
    expect(r1.tries).toBe(0);
    expect(r1.lastTriedAt).toBeNull();
    expect(r1.attempt.seed).toBe(1);
  });
});

describe("failure classification", () => {
  const START = Date.UTC(2026, 9, 4); // 2026-10-04T00:00:00Z

  it("splits the store into pending and dead-lettered counts for the sync UI", () => {
    const pending = makeRecord("p", "2026-10-01T00:00:00.000Z");
    const failed = makeRecord("f", "2026-10-02T00:00:00.000Z");
    failed.tries = 5;
    failed.status = "failed";
    expect(splitPendingFailed([pending, failed, pending])).toEqual({
      pendingCount: 2,
      failedCount: 1,
    });
  });

  /**
   * Flush n times, each `now` advanced past the record's next backoff
   * window; returns the `now` of the following (n+1th) due moment.
   */
  async function flushRepeatedly(
    store: MemoryOutboxStore,
    fetchImpl: typeof fetch,
    n: number,
  ): Promise<number> {
    let now = START;
    for (let i = 0; i < n; i++) {
      await flushOutbox(store, fetchImpl, new Date(now));
      now += nextRetryDelayMs({ ...makeRecord("a", "t"), tries: i + 1 });
    }
    return now;
  }

  it("dead-letters a record after 5 tries when the server answers 4xx", async () => {
    const store = new MemoryOutboxStore();
    await store.put(makeRecord("a", "2026-10-01T00:00:00.000Z"));
    // 401 = expired session: the server actively rejects; retrying cannot fix it.
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "Child authentication required" }, false, 401));

    const now = await flushRepeatedly(store, fetchImpl, 4);
    let record = (await store.getAll())[0];
    expect(record.tries).toBe(4);
    expect(record.status).toBeUndefined();

    const fifth = await flushOutbox(store, fetchImpl, new Date(now));
    expect(fifth.failedCount).toBe(1);
    record = (await store.getAll())[0];
    expect(record.tries).toBe(5);
    expect(record.status).toBe("failed");
  });

  it("stops retrying dead-lettered records entirely", async () => {
    const store = new MemoryOutboxStore();
    const record = makeRecord("a", "2026-10-01T00:00:00.000Z");
    record.tries = 5;
    record.status = "failed";
    await store.put(record);

    const fetchImpl = vi.fn();
    const result = await flushOutbox(store, fetchImpl, new Date(START + 7 * 24 * 60 * 60_000));
    expect(result.status).toBe("idle");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("dead-letters per-record rejected results after 5 tries too", async () => {
    const store = new MemoryOutboxStore();
    await store.put(makeRecord("a", "2026-10-01T00:00:00.000Z"));
    // Fresh Response per call: a Response body can only be read once.
    const fetchImpl = vi.fn(async () => jsonResponse({ results: [{ status: "rejected" }] }));

    const now = await flushRepeatedly(store, fetchImpl, 4);
    expect(((await store.getAll())[0]).status).toBeUndefined();
    await flushOutbox(store, fetchImpl, new Date(now));
    const record = (await store.getAll())[0];
    expect(record.tries).toBe(5);
    expect(record.status).toBe("failed");
  });

  it("keeps retrying network-class failures (5xx) beyond 5 tries", async () => {
    const store = new MemoryOutboxStore();
    await store.put(makeRecord("a", "2026-10-01T00:00:00.000Z"));
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false, 503));

    const now = await flushRepeatedly(store, fetchImpl, 5);
    const record = (await store.getAll())[0];
    expect(record.tries).toBe(5);
    expect(record.status).toBeUndefined();

    // Still due once the backoff passes — a transient outage recovers.
    const sixth = await flushOutbox(store, fetchImpl, new Date(now));
    expect(sixth.status).toBe("offline");
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });

  it("reports 4xx-only failures as partial, not offline", async () => {
    const store = new MemoryOutboxStore();
    await store.put(makeRecord("a", "2026-10-01T00:00:00.000Z"));
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: "forbidden" }, false, 403));
    const result = await flushOutbox(store, fetchImpl, new Date(START));
    expect(result.status).toBe("partial");
  });
});

describe("last offered set (cold-start offline replay)", () => {
  function makeTask(seed: number): TaskDescriptor {
    return {
      kind: "progression",
      reason: "Continuing the ladder on the most recently active skill.",
      skillId: "k4-add-1",
      skillTitle: "k4.add.title",
      strand: "Bilangan",
      step: 3,
      stepCount: 7,
      seed,
      items: [],
      itemCount: 10,
      sctSeconds: 108,
      timed: true,
      cpaMode: false,
      masteryState: "Lancar",
      fluencyFlag: false,
      gateLadder: {
        tightenCycles: 0,
        overTargetStreak: 0,
        tightenedBeatStreak: 0,
        cleanCpaStreak: 0,
      },
    };
  }

  it("stores and reloads the last offered set per child", async () => {
    const store = new MemoryLastTaskStore();
    await store.put("Aya", makeTask(101));
    await store.put("Bima", makeTask(202));

    expect((await store.get("Aya"))?.seed).toBe(101);
    expect((await store.get("Bima"))?.seed).toBe(202);
    expect(await store.get("Citra")).toBeNull();
  });

  it("keeps only the most recent set per child", async () => {
    const store = new MemoryLastTaskStore();
    await store.put("Aya", makeTask(101));
    await store.put("Aya", makeTask(303));

    expect((await store.get("Aya"))?.seed).toBe(303);
  });
});
