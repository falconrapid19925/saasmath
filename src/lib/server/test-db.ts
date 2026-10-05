/**
 * Shared in-memory SQLite harness for the server write-path seam tests
 * (processAttempt, /api/sync, shop writes). Mirrors src/db/schema.ts by hand —
 * when you change the schema, change the CREATE TABLE statements here too and
 * run npm run db:push for the real dev.db.
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { schema } from "../../db";
import { children, shopItems, skills, subscriptions } from "../../db/schema";
import type { StepParams } from "../../lib/engine/types";
import { recordServedTask } from "./served";

export const ADDSUB_STEP: StepParams = {
  step: 1,
  params: { itemCount: 4, min: 1, max: 20, operation: "add", regroup: false },
};

/** Fixture SCT for the harness skills: 8 s/item x 4 items x step-1 factor 1. */
export const FIXTURE_SCT_SECONDS = 32;

/** Record a served task through the real seam (as /api/session/next would). */
export function serveTask(
  db: ReturnType<typeof makeDb>["db"],
  childId: string,
  skillId: string,
  overrides: {
    step?: number;
    seed?: number;
    kind?: "progression" | "review" | "cpa";
    sctSeconds?: number;
  } = {},
) {
  recordServedTask(db, {
    childId,
    skillId,
    step: overrides.step ?? 1,
    seed: overrides.seed ?? 42,
    kind: overrides.kind ?? "progression",
    sctSeconds: overrides.sctSeconds ?? FIXTURE_SCT_SECONDS,
  });
}

export function makeDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  sqlite.exec(`
    CREATE TABLE skills (
      id TEXT PRIMARY KEY,
      grade INTEGER NOT NULL,
      strand TEXT NOT NULL,
      title_id TEXT NOT NULL,
      family TEXT NOT NULL,
      steps TEXT NOT NULL,
      prereq_ids TEXT NOT NULL DEFAULT '[]',
      base_sct_seconds_per_item REAL NOT NULL,
      cpa_models TEXT NOT NULL DEFAULT '[]',
      is_free_island INTEGER NOT NULL DEFAULT 0,
      order_index INTEGER NOT NULL
    );
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
    CREATE TABLE attempts (
      id TEXT PRIMARY KEY,
      child_id TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      step INTEGER NOT NULL,
      seed INTEGER NOT NULL,
      items TEXT NOT NULL,
      answers TEXT NOT NULL,
      correct_count INTEGER NOT NULL,
      total INTEGER NOT NULL,
      time_ms INTEGER NOT NULL,
      sct_seconds REAL NOT NULL,
      gate_result TEXT NOT NULL,
      createdAt INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX attempts_child_skill_seed_time_unique
      ON attempts (child_id, skill_id, seed, time_ms);
    CREATE TABLE mastery (
      child_id TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'Baru',
      step INTEGER NOT NULL DEFAULT 1,
      cpa_mode INTEGER NOT NULL DEFAULT 0,
      fluency_flag INTEGER NOT NULL DEFAULT 0,
      elo_rating REAL NOT NULL DEFAULT 1000,
      elo_n INTEGER NOT NULL DEFAULT 0,
      ease REAL NOT NULL DEFAULT 2.5,
      interval_days REAL NOT NULL DEFAULT 0,
      due_at INTEGER,
      reps INTEGER NOT NULL DEFAULT 0,
      updatedAt INTEGER NOT NULL,
      PRIMARY KEY (child_id, skill_id)
    );
    CREATE TABLE streaks (
      child_id TEXT PRIMARY KEY,
      current INTEGER NOT NULL DEFAULT 0,
      best INTEGER NOT NULL DEFAULT 0,
      freezes_left INTEGER NOT NULL DEFAULT 2,
      last_completed_date TEXT
    );
    CREATE TABLE stars_ledger (
      id TEXT PRIMARY KEY,
      child_id TEXT NOT NULL,
      delta INTEGER NOT NULL,
      reason TEXT NOT NULL,
      createdAt INTEGER NOT NULL
    );
    CREATE TABLE subscriptions (
      child_id TEXT PRIMARY KEY,
      plan TEXT NOT NULL DEFAULT 'free',
      status TEXT NOT NULL DEFAULT 'active',
      trial_ends_at INTEGER,
      createdAt INTEGER NOT NULL
    );
    CREATE TABLE served_tasks (
      id TEXT PRIMARY KEY,
      child_id TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      step INTEGER NOT NULL,
      seed INTEGER NOT NULL,
      kind TEXT NOT NULL,
      sct_seconds REAL NOT NULL,
      served_at INTEGER NOT NULL,
      consumed_at INTEGER
    );
    CREATE INDEX served_tasks_child_idx
      ON served_tasks (child_id, skill_id, step, seed);
    CREATE TABLE placement_results (
      id TEXT PRIMARY KEY,
      child_id TEXT NOT NULL,
      items TEXT NOT NULL,
      placed_skill TEXT NOT NULL,
      placed_step INTEGER NOT NULL,
      createdAt INTEGER NOT NULL
    );
    CREATE TABLE shop_items (
      id TEXT PRIMARY KEY,
      name_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      price_stars INTEGER NOT NULL,
      emoji_or_color TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE inventory (
      child_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      PRIMARY KEY (child_id, item_id)
    );
  `);
  return { sqlite, db };
}

export async function seedChild(
  db: ReturnType<typeof makeDb>["db"],
  childId: string,
  subscription: { plan: "free" | "bulanan"; status: "pending" | "active" } | null,
) {
  // Two-skill island fixture: one free, one paywalled. Same addsub family and
  // SCT estimate so grading behavior is identical across the pair.
  await db
    .insert(skills)
    .values([
      {
        id: "free-skill",
        grade: 4,
        strand: "Bilangan",
        titleId: "Latihan Bebas",
        family: "addsub",
        steps: [ADDSUB_STEP],
        baseSctSecondsPerItem: 8,
        isFreeIsland: true,
        orderIndex: 1,
      },
      {
        id: "paid-skill",
        grade: 4,
        strand: "Bilangan",
        titleId: "Latihan Berbayar",
        family: "addsub",
        steps: [ADDSUB_STEP],
        baseSctSecondsPerItem: 8,
        isFreeIsland: false,
        orderIndex: 2,
      },
    ])
    .onConflictDoNothing();
  await db.insert(children).values({
    id: childId,
    parentId: "parent-1",
    name: "Budi",
    grade: 4,
    pinHash: "scrypt:00:00",
    starsBalance: 0,
  });
  if (subscription) {
    await db
      .insert(subscriptions)
      .values({ childId, plan: subscription.plan, status: subscription.status });
  }
}

/** A priced shop item for purchase tests. */
export async function seedShopItem(
  db: ReturnType<typeof makeDb>["db"],
  item: { id: string; priceStars: number; emojiOrColor?: { emoji?: string; color?: string } },
) {
  await db.insert(shopItems).values({
    id: item.id,
    nameId: "Item Uji",
    kind: "avatar",
    priceStars: item.priceStars,
    emojiOrColor: item.emojiOrColor ?? {},
  });
}

/**
 * A free-island addsub skill with two steps (authored convention: the max
 * widens per step), so ladder-advance and ladder-complete behavior are both
 * reachable through processAttempt.
 */
export async function seedTwoStepFreeSkill(
  db: ReturnType<typeof makeDb>["db"],
  id = "free-two-step",
) {
  await db
    .insert(skills)
    .values({
      id,
      grade: 4,
      strand: "Bilangan",
      titleId: "Tangga Dua Langkah",
      family: "addsub",
      steps: [
        { step: 1, params: { itemCount: 4, min: 1, max: 20, operation: "add", regroup: false } },
        { step: 2, params: { itemCount: 4, min: 1, max: 50, operation: "add", regroup: false } },
      ],
      baseSctSecondsPerItem: 8,
      isFreeIsland: true,
      orderIndex: 3,
    })
    .onConflictDoNothing();
}
