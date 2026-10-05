/**
 * Route tests for POST /api/webhooks/midtrans — the payment activation
 * boundary. Midtrans posts an HTTP notification; the webhook must only honor
 * it when signature_key matches sha512(order_id + status_code + gross_amount +
 * server_key) (Midtrans' documented formula — computed here independently),
 * the order_id resolves to a persisted order, and the gross amount matches the
 * order. Settlement then flips the order to paid and activates the child's
 * subscription; failures/expiry never touch the subscription. cookies() and
 * the DB are mocked at their boundaries.
 */

import { createHash } from "node:crypto";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { schema } from "@/db";
import { children, orders, subscriptions } from "@/db/schema";
import { createOrder } from "@/lib/server/midtrans";

import { POST } from "./route";

const SERVER_KEY = "webhook-test-server-key";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDb: mocks.getDb,
}));

/** Midtrans' documented notification signature, built here from first principles. */
function sign(orderId: string, statusCode: string, grossAmount: string): string {
  return createHash("sha512")
    .update(`${orderId}${statusCode}${grossAmount}${SERVER_KEY}`)
    .digest("hex");
}

function makeDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
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

type TestDb = ReturnType<typeof makeDb>["db"];

const BUNDLE_PRICE = {
  months: 6 as const,
  priceIdr: 229_000,
  plan: "bundle" as const,
  labelId: "Paket 6 bulan",
};

async function seedOrder(db: TestDb, childId: string) {
  await db
    .insert(children)
    .values({ id: childId, parentId: "parent-1", name: "Budi", grade: 4, pinHash: "scrypt:00:00" });
  return createOrder(db, { childId, price: BUNDLE_PRICE });
}

function notify(body: Record<string, unknown>): Promise<Response> {
  return POST(
    new Request("http://localhost/api/webhooks/midtrans", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

function notification(input: {
  orderId: string;
  statusCode?: string;
  grossAmount?: string;
  transactionStatus: string;
  fraudStatus?: string;
}) {
  const statusCode = input.statusCode ?? "200";
  const grossAmount = input.grossAmount ?? "229000.00";
  return {
    order_id: input.orderId,
    status_code: statusCode,
    gross_amount: grossAmount,
    signature_key: sign(input.orderId, statusCode, grossAmount),
    transaction_status: input.transactionStatus,
    ...(input.fraudStatus ? { fraud_status: input.fraudStatus } : {}),
  };
}

describe("POST /api/webhooks/midtrans", () => {
  let db: TestDb;
  let sqlite: ReturnType<typeof makeDb>["sqlite"];

  beforeEach(() => {
    const made = makeDb();
    db = made.db;
    sqlite = made.sqlite;
    mocks.getDb.mockReturnValue(db);
    process.env.MIDTRANS_SERVER_KEY = SERVER_KEY;
  });

  afterEach(() => {
    sqlite.close();
    delete process.env.MIDTRANS_SERVER_KEY;
  });

  it("activates the subscription and marks the order paid on verified settlement", async () => {
    const order = await seedOrder(db, "child-wh-1");

    const res = await notify(notification({ orderId: order.orderId, transactionStatus: "settlement" }));
    expect(res.status).toBe(200);

    const [paid] = await db.select().from(orders);
    expect(paid!.status).toBe("paid");
    expect(paid!.paidAt).not.toBeNull();

    const [sub] = await db.select().from(subscriptions);
    expect(sub!.childId).toBe("child-wh-1");
    expect(sub!.plan).toBe("bundle");
    expect(sub!.status).toBe("active");
  });

  it("also activates on capture with fraud_status accept (card flow)", async () => {
    const order = await seedOrder(db, "child-wh-2");

    const res = await notify(
      notification({ orderId: order.orderId, transactionStatus: "capture", fraudStatus: "accept" }),
    );
    expect(res.status).toBe(200);
    const [sub] = await db.select().from(subscriptions);
    expect(sub!.status).toBe("active");
  });

  it("rejects an invalid signature with 403 and changes nothing", async () => {
    const order = await seedOrder(db, "child-wh-3");

    const res = await notify({
      order_id: order.orderId,
      status_code: "200",
      gross_amount: "229000.00",
      signature_key: "0".repeat(128),
      transaction_status: "settlement",
    });
    expect(res.status).toBe(403);

    const [row] = await db.select().from(orders);
    expect(row!.status).toBe("pending");
    const subs = await db.select().from(subscriptions);
    expect(subs).toHaveLength(1);
    expect(subs[0]!.plan).toBe("trial"); // untouched — checkout started the trial, the webhook must not
  });

  it("answers 404 for an order_id that was never created", async () => {
    const res = await notify(notification({ orderId: "SAASMATH-ghost-1", transactionStatus: "settlement" }));
    expect(res.status).toBe(404);
  });

  it("rejects a gross amount that disagrees with the order despite a valid signature", async () => {
    const order = await seedOrder(db, "child-wh-4");

    const res = await notify(
      notification({ orderId: order.orderId, grossAmount: "1.00", transactionStatus: "settlement" }),
    );
    expect(res.status).toBe(400);

    const [row] = await db.select().from(orders);
    expect(row!.status).toBe("pending");
    const subs = await db.select().from(subscriptions);
    expect(subs).toHaveLength(1);
    expect(subs[0]!.plan).toBe("trial"); // untouched — checkout started the trial, the webhook must not
  });

  it("marks the order failed on expire without touching the subscription", async () => {
    const order = await seedOrder(db, "child-wh-5");

    const res = await notify(notification({ orderId: order.orderId, transactionStatus: "expire" }));
    expect(res.status).toBe(200);

    const [row] = await db.select().from(orders);
    expect(row!.status).toBe("failed");
    expect(row!.paidAt).toBeNull();
    const subs = await db.select().from(subscriptions);
    expect(subs).toHaveLength(1);
    expect(subs[0]!.plan).toBe("trial"); // untouched — checkout started the trial, the webhook must not
  });

  it("leaves the order pending on a pending notification", async () => {
    const order = await seedOrder(db, "child-wh-6");

    const res = await notify(notification({ orderId: order.orderId, transactionStatus: "pending" }));
    expect(res.status).toBe(200);

    const [row] = await db.select().from(orders);
    expect(row!.status).toBe("pending");
    const subs = await db.select().from(subscriptions);
    expect(subs).toHaveLength(1);
    expect(subs[0]!.plan).toBe("trial"); // untouched — checkout started the trial, the webhook must not
  });

  it("keeps a challenged capture from activating", async () => {
    const order = await seedOrder(db, "child-wh-7");

    const res = await notify(
      notification({ orderId: order.orderId, transactionStatus: "capture", fraudStatus: "challenge" }),
    );
    expect(res.status).toBe(200);
    const subs = await db.select().from(subscriptions);
    expect(subs).toHaveLength(1);
    expect(subs[0]!.plan).toBe("trial"); // untouched — checkout started the trial, the webhook must not
    const [row] = await db.select().from(orders);
    expect(row!.status).toBe("pending");
  });

  it("is idempotent: a replayed settlement stays 200 and active", async () => {
    const order = await seedOrder(db, "child-wh-8");
    const first = await notify(notification({ orderId: order.orderId, transactionStatus: "settlement" }));
    expect(first.status).toBe(200);

    const replay = await notify(notification({ orderId: order.orderId, transactionStatus: "settlement" }));
    expect(replay.status).toBe(200);

    const subs = await db.select().from(subscriptions);
    expect(subs).toHaveLength(1);
    expect(subs[0]!.status).toBe("active");
  });

  it("accepts the documented dev_simulate payload in stub mode (no server key)", async () => {
    delete process.env.MIDTRANS_SERVER_KEY;
    const order = await seedOrder(db, "child-wh-dev1");

    const res = await notify({
      dev_simulate: true,
      order_id: order.orderId,
      transaction_status: "settlement",
    });
    expect(res.status).toBe(200);

    const [row] = await db.select().from(orders);
    expect(row!.status).toBe("paid");
    const [sub] = await db.select().from(subscriptions);
    expect(sub!.status).toBe("active");
    expect(sub!.plan).toBe("bundle");
  });

  it("rejects a stub-mode payload without the dev_simulate flag", async () => {
    delete process.env.MIDTRANS_SERVER_KEY;
    const order = await seedOrder(db, "child-wh-dev2");

    const res = await notify({ order_id: order.orderId, transaction_status: "settlement" });
    expect(res.status).toBe(403);

    const [row] = await db.select().from(orders);
    expect(row!.status).toBe("pending");
    const subs = await db.select().from(subscriptions);
    expect(subs).toHaveLength(1);
    expect(subs[0]!.plan).toBe("trial"); // untouched — checkout started the trial, the webhook must not
  });

  it("ignores dev_simulate when a server key is configured — the signature is still required", async () => {
    const order = await seedOrder(db, "child-wh-dev3");

    const res = await notify({
      dev_simulate: true,
      order_id: order.orderId,
      status_code: "200",
      gross_amount: "229000.00",
      signature_key: "f".repeat(128),
      transaction_status: "settlement",
    });
    expect(res.status).toBe(403);

    const [row] = await db.select().from(orders);
    expect(row!.status).toBe("pending");
    const subs = await db.select().from(subscriptions);
    expect(subs).toHaveLength(1);
    expect(subs[0]!.plan).toBe("trial"); // untouched — checkout started the trial, the webhook must not
  });
});
