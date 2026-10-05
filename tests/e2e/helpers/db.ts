/**
 * Direct read access to the e2e run's SQLite database. The webServer serves
 * the exact file tests/e2e/helpers/e2e-env.mjs names (DB_PATH), so specs can
 * assert on what the server actually persisted — "nothing written",
 * ledger/balance reconciliation, pending orders — without going through the
 * API. The only deliberate write helper is seedStars (shop balance setup).
 */

import Database from "better-sqlite3";

import { E2E_DB_PATH } from "./e2e-env.mjs";

let handle: Database.Database | null = null;

function db(): Database.Database {
  if (!handle) {
    handle = new Database(E2E_DB_PATH, { fileMustExist: true });
  }
  return handle;
}

export type ParentRow = { id: string; email: string; name: string };
export type ChildRow = {
  id: string;
  parent_id: string;
  name: string;
  grade: number;
  avatar: string | null;
  stars_balance: number;
};
export type LedgerEntry = { delta: number; reason: string };

export function getParentByEmail(email: string): ParentRow {
  const row = db()
    .prepare("SELECT id, email, name FROM parents WHERE email = ?")
    .get(email.toLowerCase());
  if (!row) throw new Error(`e2e db: no parent ${email}`);
  return row as ParentRow;
}

export function getChildByName(name: string): ChildRow {
  const row = db().prepare("SELECT * FROM children WHERE name = ?").get(name);
  if (!row) throw new Error(`e2e db: no child named ${name}`);
  return row as ChildRow;
}

export function starsBalance(childId: string): number {
  const row = db()
    .prepare("SELECT stars_balance FROM children WHERE id = ?")
    .get(childId) as { stars_balance: number } | undefined;
  if (!row) throw new Error(`e2e db: no child ${childId}`);
  return row.stars_balance;
}

/** Ledger invariant (plan 4.2): sum(delta) must equal children.stars_balance. */
export function starsLedgerSum(childId: string): number {
  const row = db()
    .prepare("SELECT COALESCE(SUM(delta), 0) AS total FROM stars_ledger WHERE child_id = ?")
    .get(childId) as { total: number };
  return row.total;
}

export function starsLedgerEntries(childId: string): LedgerEntry[] {
  return db()
    .prepare(
      "SELECT delta, reason FROM stars_ledger WHERE child_id = ? ORDER BY createdAt, id",
    )
    .all(childId) as LedgerEntry[];
}

export function countAttempts(childId: string, skillId?: string): number {
  const row = skillId
    ? (db()
        .prepare("SELECT COUNT(*) AS n FROM attempts WHERE child_id = ? AND skill_id = ?")
        .get(childId, skillId) as { n: number })
    : (db()
        .prepare("SELECT COUNT(*) AS n FROM attempts WHERE child_id = ?")
        .get(childId) as { n: number });
  return row.n;
}

export function countServedTasks(childId: string, skillId?: string): number {
  const row = skillId
    ? (db()
        .prepare("SELECT COUNT(*) AS n FROM served_tasks WHERE child_id = ? AND skill_id = ?")
        .get(childId, skillId) as { n: number })
    : (db()
        .prepare("SELECT COUNT(*) AS n FROM served_tasks WHERE child_id = ?")
        .get(childId) as { n: number });
  return row.n;
}

export type OrderRow = {
  order_id: string;
  child_id: string;
  plan: string;
  months: number;
  amount_idr: number;
  status: string;
  paid_at: number | null;
};

export function getOrder(orderId: string): OrderRow {
  const row = db().prepare("SELECT * FROM orders WHERE order_id = ?").get(orderId);
  if (!row) throw new Error(`e2e db: no order ${orderId}`);
  return row as OrderRow;
}

export function getSubscription(childId: string): {
  plan: string;
  status: string;
  trial_ends_at: number | null;
} {
  const row = db().prepare("SELECT * FROM subscriptions WHERE child_id = ?").get(childId);
  if (!row) throw new Error(`e2e db: no subscription for ${childId}`);
  return row as { plan: string; status: string; trial_ends_at: number | null };
}

export function inventoryItemIds(childId: string): string[] {
  return (
    db()
      .prepare("SELECT item_id FROM inventory WHERE child_id = ?")
      .all(childId) as { item_id: string }[]
  ).map((row) => row.item_id);
}

export function equippedItemId(childId: string): string | null {
  const row = db()
    .prepare("SELECT avatar FROM children WHERE id = ?")
    .get(childId) as { avatar: string | null } | undefined;
  if (!row) throw new Error(`e2e db: no child ${childId}`);
  return row.avatar;
}

/** The first seeded skill of `grade` that sits OUTSIDE the free island. */
export function firstPaywalledSkill(grade: number): {
  id: string;
  itemCountStep1: number;
} {
  const row = db()
    .prepare(
      "SELECT id, steps FROM skills WHERE grade = ? AND is_free_island = 0 ORDER BY order_index LIMIT 1",
    )
    .get(grade) as { id: string; steps: string } | undefined;
  if (!row) throw new Error(`e2e db: no paywalled skill for grade ${grade}`);
  const steps = JSON.parse(row.steps) as { params: { itemCount?: number } }[];
  return { id: row.id, itemCountStep1: steps[0]?.params.itemCount ?? 0 };
}

/**
 * Grant a starting wallet the way the seed does: one ledger entry mirrored
 * by the balance increment, so the ledger-reconciliation invariant holds for
 * anything the shop spec spends. createdAt uses the drizzle timestamp mode
 * unit (seconds, matching what the server writes).
 */
export function seedStars(childId: string, amount: number): void {
  const database = db();
  database
    .prepare("UPDATE children SET stars_balance = stars_balance + ? WHERE id = ?")
    .run(amount, childId);
  database
    .prepare(
      "INSERT INTO stars_ledger (id, child_id, delta, reason, createdAt) VALUES (?, ?, ?, 'seed_bonus', ?)",
    )
    .run(crypto.randomUUID(), childId, amount, Math.floor(Date.now() / 1000));
}
