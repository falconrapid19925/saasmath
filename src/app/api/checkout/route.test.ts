/**
 * Route tests for POST /api/checkout — the parent-side payment entry. The
 * flow the audit asked for: each checkout persists a pending order row (the
 * webhook's resolution key) and never touches the subscription row, so a
 * re-checkout cannot demote an already-active subscription. cookies() and the
 * DB are mocked at their boundaries; Midtrans runs in stub mode (no server
 * key), so the checkout must answer with the documented placeholder payload.
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { children, orders, subscriptions } from "@/db/schema";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";

import { POST } from "./route";

// Session tokens need a signing secret (src/lib/auth.ts reads it per call).
process.env.AUTH_SECRET ??= "t".repeat(32);

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock("@/db", () => ({ getDb: mocks.getDb }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

const cookieJar = new Map<string, string>();

function makeDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite);
  sqlite.exec(`
    CREATE TABLE children (
      id TEXT PRIMARY KEY,
      parent_id TEXT NOT NULL,
      name TEXT NOT NULL,
      grade INTEGER NOT NULL,
      avatar TEXT,
      pin_hash TEXT NOT NULL,
      stars_balance INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL
    );
    CREATE TABLE subscriptions (
      child_id TEXT PRIMARY KEY,
      plan TEXT NOT NULL DEFAULT 'free',
      status TEXT NOT NULL DEFAULT 'active',
      trial_ends_at INTEGER,
      createdAt INTEGER NOT NULL
    );
    CREATE TABLE orders (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      child_id TEXT NOT NULL,
      plan TEXT NOT NULL,
      months INTEGER NOT NULL,
      amount_idr INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      createdAt INTEGER NOT NULL,
      paid_at INTEGER
    );
    CREATE UNIQUE INDEX orders_order_id_unique ON orders (order_id);
  `);
  return { sqlite, db };
}

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/checkout", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

async function addChild(
  db: ReturnType<typeof makeDb>["db"],
  childId: string,
  parentId: string,
) {
  await db.insert(children).values({
    id: childId,
    parentId,
    name: "Budi",
    grade: 4,
    pinHash: "scrypt:00:00",
  });
}

describe("POST /api/checkout", () => {
  let db: ReturnType<typeof makeDb>["db"];
  let sqlite: ReturnType<typeof makeDb>["sqlite"];
  let originalServerKey: string | undefined;

  beforeEach(() => {
    const made = makeDb();
    db = made.db;
    sqlite = made.sqlite;
    mocks.getDb.mockReturnValue(db);
    cookieJar.clear();
    cookieJar.set(
      SESSION_COOKIE_NAME,
      createSessionToken({ sub: "parent-1", role: "parent" }),
    );
    mocks.cookies.mockResolvedValue({
      get: (name: string) =>
        cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
      set: (name: string, value: string) => void cookieJar.set(name, value),
      delete: (name: string) => void cookieJar.delete(name),
    });
    originalServerKey = process.env.MIDTRANS_SERVER_KEY;
    delete process.env.MIDTRANS_SERVER_KEY;
  });

  afterEach(() => {
    sqlite.close();
    if (originalServerKey === undefined) delete process.env.MIDTRANS_SERVER_KEY;
    else process.env.MIDTRANS_SERVER_KEY = originalServerKey;
  });

  it("persists a pending order and returns the stub checkout payload", async () => {
    await addChild(db, "child-co-1", "parent-1");

    const res = await post({ childId: "child-co-1", months: 1 });
    expect(res.status).toBe(202);
    const body = (await res.json()) as {
      orderId: string;
      mode: string;
      snapUrl: string | null;
      amountIdr: number;
      plan: string;
      notes: string[];
    };
    expect(body.orderId).toMatch(/^SAASMATH-/);
    expect(body.mode).toBe("stub");
    expect(body.snapUrl).toBeNull();
    // Plan section 7 pricing: bulanan Rp49.000.
    expect(body.amountIdr).toBe(49_000);
    expect(body.plan).toBe("bulanan");
    // The note must describe the current flow: a pending ORDER was recorded
    // (no subscription row is written at checkout any more).
    expect(body.notes.join(" ")).toContain("order");
    expect(body.notes.join(" ")).not.toContain("subscription dibuat");

    const rows = await db.select().from(orders);
    expect(rows.length).toBe(1);
    expect(rows[0]!.orderId).toBe(body.orderId);
    expect(rows[0]!.childId).toBe("child-co-1");
    expect(rows[0]!.status).toBe("pending");
    expect(rows[0]!.amountIdr).toBe(49_000);
  });

  it("keeps every checkout attempt as its own order row", async () => {
    await addChild(db, "child-co-2", "parent-1");

    const first = await post({ childId: "child-co-2", months: 3 });
    const second = await post({ childId: "child-co-2", months: 3 });
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    const firstBody = (await first.json()) as { orderId: string };
    const secondBody = (await second.json()) as { orderId: string };
    expect(secondBody.orderId).not.toBe(firstBody.orderId);

    const rows = await db.select().from(orders);
    expect(rows.length).toBe(2);
    // Plan section 7 pricing: 3 bulan Rp129.000.
    expect(rows.every((r) => r.amountIdr === 129_000)).toBe(true);
  });

  it("does not demote an active subscription when checking out again", async () => {
    await addChild(db, "child-co-3", "parent-1");
    await db
      .insert(subscriptions)
      .values({ childId: "child-co-3", plan: "bulanan", status: "active" });

    const res = await post({ childId: "child-co-3", months: 12 });
    expect(res.status).toBe(202);

    const rows = await db.select().from(subscriptions);
    expect(rows.length).toBe(1);
    expect(rows[0]!.status).toBe("active");
    expect(rows[0]!.plan).toBe("bulanan");
    expect(rows[0]!.trialEndsAt).toBeNull();
  });

  it("starts the 7-day trial when a free child checks out for the first time", async () => {
    await addChild(db, "child-trial-1", "parent-1");
    await db
      .insert(subscriptions)
      .values({ childId: "child-trial-1", plan: "free", status: "active" });

    const t0 = Date.now();
    const res = await post({ childId: "child-trial-1", months: 1 });
    expect(res.status).toBe(202);

    const [row] = await db.select().from(subscriptions);
    expect(row!.plan).toBe("trial");
    expect(row!.trialEndsAt).not.toBeNull();
    // Plan section 5: the trial lasts 7 days from checkout initiation. The
    // timestamp column stores whole seconds, so allow the sub-second loss.
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const elapsedToEnd = row!.trialEndsAt!.getTime() - t0;
    expect(elapsedToEnd).toBeGreaterThanOrEqual(sevenDaysMs - 1_000);
    expect(elapsedToEnd).toBeLessThan(sevenDaysMs + 5_000);
  });

  it("sets the trial exactly once — a later checkout does not extend it", async () => {
    await addChild(db, "child-trial-2", "parent-1");
    await db
      .insert(subscriptions)
      .values({ childId: "child-trial-2", plan: "free", status: "active" });

    await post({ childId: "child-trial-2", months: 1 });
    const [first] = await db.select().from(subscriptions);
    const firstEnds = first!.trialEndsAt!.getTime();

    await post({ childId: "child-trial-2", months: 3 });
    const [second] = await db.select().from(subscriptions);
    expect(second!.plan).toBe("trial");
    expect(second!.trialEndsAt!.getTime()).toBe(firstEnds);
  });

  it("rejects a child the parent does not own with 404", async () => {
    await addChild(db, "child-other", "parent-2");

    const res = await post({ childId: "child-other", months: 1 });
    expect(res.status).toBe(404);
    expect((await db.select().from(orders)).length).toBe(0);
  });

  it("requires a parent session", async () => {
    await addChild(db, "child-co-4", "parent-1");
    cookieJar.clear();

    const res = await post({ childId: "child-co-4", months: 1 });
    expect(res.status).toBe(401);
    expect((await db.select().from(orders)).length).toBe(0);
  });
});
