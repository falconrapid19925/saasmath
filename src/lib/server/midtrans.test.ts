/**
 * Seam tests for order persistence in ./midtrans: every checkout must leave a
 * durable order row keyed by the Midtrans order_id, because the webhook has no
 * other way to answer "which child and plan does this payment settle?" (and to
 * reject replays). Expected prices are the plan-section-7 literals, not
 * CHECKOUT_PRICES recomputed.
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { schema } from "../../db";
import { children } from "../../db/schema";
import { createOrder, getOrderByOrderId } from "./midtrans";

const BULANAN_PRICE = {
  months: 1 as const,
  priceIdr: 49_000,
  plan: "bulanan" as const,
  labelId: "Bulanan",
};

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

async function seedChild(db: ReturnType<typeof makeDb>["db"], childId: string) {
  await db
    .insert(children)
    .values({ id: childId, parentId: "parent-1", name: "Budi", grade: 4, pinHash: "scrypt:00:00" });
}

describe("createOrder", () => {
  let handle: ReturnType<typeof makeDb>;

  beforeEach(() => {
    handle = makeDb();
  });

  afterEach(() => handle.sqlite.close());

  it("persists a pending order carrying the child, plan and price", async () => {
    const { db } = handle;
    await seedChild(db, "child-order-1");

    const order = createOrder(db, { childId: "child-order-1", price: BULANAN_PRICE });

    expect(order.status).toBe("pending");
    expect(order.orderId).toMatch(/^SAASMATH-/);
    expect(order.childId).toBe("child-order-1");
    expect(order.plan).toBe("bulanan");
    expect(order.months).toBe(1);
    expect(order.amountIdr).toBe(49_000);
    expect(order.paidAt).toBeNull();
  });

  it("makes the order findable by its Midtrans order_id", async () => {
    const { db } = handle;
    await seedChild(db, "child-order-2");

    const created = createOrder(db, { childId: "child-order-2", price: BULANAN_PRICE });
    const found = getOrderByOrderId(db, created.orderId);

    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
    expect(found!.amountIdr).toBe(49_000);
  });

  it("returns null for an order_id that was never created", () => {
    const { db } = handle;
    expect(getOrderByOrderId(db, "SAASMATH-nope-1")).toBeNull();
  });
});
