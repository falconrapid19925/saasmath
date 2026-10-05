/**
 * SaasMath database schema — Drizzle ORM over SQLite (dev.db at repo root).
 *
 * Migration path to Supabase Postgres (documented, deliberate): every table
 * uses text primary keys (UUIDs), JSON columns are stored as json-mode text,
 * booleans are integer mode, and timestamps are integer mode Date. To move to
 * Postgres: swap the sqlite-core imports for pg-core, `text({ mode: "json" })`
 * for `jsonb`, `integer({ mode: "boolean" })` for `boolean`, and
 * `integer({ mode: "timestamp" })` for `timestamp` — the table/column shape
 * and the inferred types below are intentionally 1:1 portable.
 *
 * All DB access happens at request time via getDb() in src/db/index.ts —
 * never at module scope or build time.
 */

import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import type { GateDecision, HintModel, Item } from "@/lib/engine/types";
import type { Answer } from "@/lib/engine/types";
import type { StepParams } from "@/lib/engine/types";

// ---------------------------------------------------------------------------
// Enum-ish unions (validated in app code with zod, mirrored here for typing)
// ---------------------------------------------------------------------------

export const GRADES = [4, 5] as const;
export type Grade = (typeof GRADES)[number];

/** Kurikulum Merdeka strands covered at launch (plan section 3.3). */
export const STRANDS = ["Bilangan", "Pengukuran", "Geometri", "Data"] as const;
export type Strand = (typeof STRANDS)[number];

/** Mastery states, Indonesian per the plan (section 4.2). */
export const MASTERY_STATES = ["Baru", "Lancar", "Kuasai"] as const;
export type MasteryState = (typeof MASTERY_STATES)[number];

export const SUBSCRIPTION_PLANS = ["free", "trial", "bulanan", "bundle"] as const;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];

/** Kinds /api/session/next serves (mirrors NextTaskDecision kinds). */
export const SERVED_TASK_KINDS = ["progression", "review", "cpa"] as const;
export type ServedTaskKind = (typeof SERVED_TASK_KINDS)[number];

export const SHOP_ITEM_KINDS = ["avatar", "room"] as const;
export type ShopItemKind = (typeof SHOP_ITEM_KINDS)[number];

const id = () =>
  text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
  integer({ mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date());

// ---------------------------------------------------------------------------
// Accounts: parents own children; children sign in with name + PIN
// ---------------------------------------------------------------------------

export const parents = sqliteTable("parents", {
  id: id(),
  email: text().notNull().unique(),
  /** scrypt hash, format "scrypt:<saltHex>:<hashHex>" (see src/lib/auth.ts). */
  passwordHash: text("password_hash").notNull(),
  name: text().notNull(),
  createdAt: createdAt(),
});

export const children = sqliteTable(
  "children",
  {
    id: id(),
    parentId: text("parent_id")
      .notNull()
      .references(() => parents.id),
    name: text().notNull(),
    grade: integer()
      .notNull()
      .$type<Grade>(),
    /** Current equipped avatar item id (shop_items.id), or null. */
    avatar: text(),
    /** scrypt hash of the child's numeric PIN (same format as parents). */
    pinHash: text("pin_hash").notNull(),
    /** Stars wallet balance; the ledger is stars_ledger (plan section 4.2). */
    starsBalance: integer("stars_balance").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("children_parent_idx").on(t.parentId)],
);

// ---------------------------------------------------------------------------
// Curriculum: skills on a prerequisite graph (plan section 6, data model)
// ---------------------------------------------------------------------------

export const skills = sqliteTable(
  "skills",
  {
    id: text()
      .primaryKey()
      /** e.g. "k4-mult-1digit" — stable across seeds and deploys. */
      .$type<string>(),
    grade: integer()
      .notNull()
      .$type<Grade>(),
    strand: text({ enum: STRANDS }).notNull(),
    /** Skill title in Bahasa Indonesia, e.g. "Perkalian 2 digit x 1 digit". */
    titleId: text("title_id").notNull(),
    /** Generator-family id (see src/lib/engine/families.ts roster). */
    family: text().notNull(),
    /** Parameter presets per difficulty step, index 0 = step 1. */
    steps: text({ mode: "json" })
      .notNull()
      .$type<StepParams[]>(),
    /** Prerequisite skill ids on the prerequisite graph. */
    prereqIds: text("prereq_ids", { mode: "json" })
      .notNull()
      .$defaultFn(() => [] as string[])
      .$type<string[]>(),
    /** Content-author SCT estimate; recalibrates from attempts (plan 3.1). */
    baseSctSecondsPerItem: real("base_sct_seconds_per_item").notNull(),
    /** CPA hint models this skill supports (subset of HintModel). */
    cpaModels: text("cpa_models", { mode: "json" })
      .notNull()
      .$defaultFn(() => [] as HintModel[])
      .$type<HintModel[]>(),
    /** Part of the free tier's first island (plan section 5). */
    isFreeIsland: integer("is_free_island", { mode: "boolean" })
      .notNull()
      .default(false),
    /** Display order within grade+strand ("order" is reserved SQL). */
    orderIndex: integer("order_index").notNull(),
  },
  (t) => [index("skills_grade_strand_idx").on(t.grade, t.strand)],
);

// ---------------------------------------------------------------------------
// Drill loop: attempts, mastery, placement (plan sections 3.1, 6)
// ---------------------------------------------------------------------------

export const attempts = sqliteTable(
  "attempts",
  {
    id: id(),
    childId: text("child_id")
      .notNull()
      .references(() => children.id),
    skillId: text("skill_id")
      .notNull()
      .references(() => skills.id),
    step: integer().notNull(),
    /** Seed the set was generated from (setSeed output) — enables replay/PDF. */
    seed: integer().notNull(),
    /** The exact generated items, for replay and answer keys. */
    items: text({ mode: "json" })
      .notNull()
      .$type<Item[]>(),
    /** Child's submitted answers; null = skipped. */
    answers: text({ mode: "json" })
      .notNull()
      .$type<(Answer | null)[]>(),
    correctCount: integer("correct_count").notNull(),
    total: integer().notNull(),
    timeMs: integer("time_ms").notNull(),
    sctSeconds: real("sct_seconds").notNull(),
    /** The mastery-gate decision computed for this attempt. */
    gateResult: text("gate_result", { mode: "json" })
      .notNull()
      .$type<GateDecision>(),
    createdAt: createdAt(),
  },
  (t) => [
    index("attempts_child_skill_idx").on(t.childId, t.skillId),
    /** Dedup backstop: one attempt per (child, skill, seed, play time). */
    uniqueIndex("attempts_child_skill_seed_time_unique").on(
      t.childId,
      t.skillId,
      t.seed,
      t.timeMs,
    ),
  ],
);

/** One row per (child, skill): the adaptive model (plan section 6). */
export const mastery = sqliteTable(
  "mastery",
  {
    childId: text("child_id")
      .notNull()
      .references(() => children.id),
    skillId: text("skill_id")
      .notNull()
      .references(() => skills.id),
    state: text({ enum: MASTERY_STATES })
      .notNull()
      .default("Baru"),
    /** Current difficulty step within the skill (1-based). */
    step: integer().notNull().default(1),
    /** Untimed CPA-hint mode (plan section 3.1 step 6). */
    cpaMode: integer("cpa_mode", { mode: "boolean" }).notNull().default(false),
    /** Fluency-focus flag from the no-dead-end promote rule (plan 3.1). */
    fluencyFlag: integer("fluency_flag", { mode: "boolean" })
      .notNull()
      .default(false),
    /** Elo: student skill estimate; starts at 1000. */
    eloRating: real("elo_rating").notNull().default(1000),
    /** Elo uncertainty counter n for the U(n) = a/(1+bn) update. */
    eloN: integer("elo_n").notNull().default(0),
    // SM-2 spaced-review fields for mastered skills (plan section 3.1 step 8).
    ease: real().notNull().default(2.5),
    intervalDays: real("interval_days").notNull().default(0),
    dueAt: integer("due_at", { mode: "timestamp" }),
    reps: integer().notNull().default(0),
    updatedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.childId, t.skillId] })],
);

export const placementResults = sqliteTable("placement_results", {
  id: id(),
  childId: text("child_id")
    .notNull()
    .references(() => children.id),
  /** The diagnostic's generated items (plan section 3.1 step 1). */
  items: text({ mode: "json" })
    .notNull()
    .$type<Item[]>(),
  placedSkill: text("placed_skill")
    .notNull()
    .references(() => skills.id),
  placedStep: integer("placed_step").notNull(),
  createdAt: createdAt(),
});

/**
 * One row per task /api/session/next handed out (audit fix: progression was
 * forgeable — submit accepted any client-chosen (skillId, step, seed)). The
 * write path requires an unconsumed row matching the submission and marks it
 * consumed in the attempt transaction, so exactly one graded attempt exists
 * per served task. Grading follows the row's kind and SCT — what was actually
 * served — not a mode re-derived from mastery.
 */
export const servedTasks = sqliteTable(
  "served_tasks",
  {
    id: id(),
    childId: text("child_id")
      .notNull()
      .references(() => children.id),
    skillId: text("skill_id")
      .notNull()
      .references(() => skills.id),
    step: integer().notNull(),
    seed: integer().notNull(),
    kind: text({ enum: SERVED_TASK_KINDS }).notNull(),
    /** The SCT the set was served with; grading judges against this value. */
    sctSeconds: real("sct_seconds").notNull(),
    servedAt: integer("served_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    /** Set when the write path consumes the task (one graded attempt max). */
    consumedAt: integer("consumed_at", { mode: "timestamp" }),
  },
  (t) => [index("served_tasks_child_idx").on(t.childId, t.skillId, t.step, t.seed)],
);

// ---------------------------------------------------------------------------
// Gamification: streaks, stars, shop (plan section 4)
// ---------------------------------------------------------------------------

export const streaks = sqliteTable("streaks", {
  /** One-to-one with children. */
  childId: text("child_id")
    .primaryKey()
    .references(() => children.id),
  current: integer().notNull().default(0),
  best: integer().notNull().default(0),
  /** Duolingo-style Streak Freeze tokens; plan section 4.1 starts with 2. */
  freezesLeft: integer("freezes_left").notNull().default(2),
  /** Last completed daily set, "YYYY-MM-DD" in Asia/Jakarta. */
  lastCompletedDate: text("last_completed_date"),
});

export const starsLedger = sqliteTable(
  "stars_ledger",
  {
    id: id(),
    childId: text("child_id")
      .notNull()
      .references(() => children.id),
    /** Positive = earned, negative = spent. children.starsBalance summarizes. */
    delta: integer().notNull(),
    /** Free-form reason code, e.g. "daily_set", "shop_purchase". */
    reason: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("stars_ledger_child_idx").on(t.childId)],
);

export const shopItems = sqliteTable("shop_items", {
  id: text()
    .primaryKey()
    .$type<string>(),
  /** Display name in Bahasa Indonesia. */
  nameId: text("name_id").notNull(),
  kind: text({ enum: SHOP_ITEM_KINDS }).notNull(),
  priceStars: integer("price_stars").notNull(),
  /** Visual payload, e.g. { "emoji": "🐱" } or { "color": "#2563eb" }. */
  emojiOrColor: text("emoji_or_color", { mode: "json" })
    .notNull()
    .$type<{ emoji?: string; color?: string }>()
    .default(sql`'{}'`),
});

export const inventory = sqliteTable(
  "inventory",
  {
    childId: text("child_id")
      .notNull()
      .references(() => children.id),
    itemId: text("item_id")
      .notNull()
      .references(() => shopItems.id),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.childId, t.itemId] })],
);

// ---------------------------------------------------------------------------
// Monetization (plan section 7)
// ---------------------------------------------------------------------------

export const subscriptions = sqliteTable("subscriptions", {
  /** One subscription row per child (plan free|trial|bulanan|bundle). */
  childId: text("child_id")
    .primaryKey()
    .references(() => children.id),
  plan: text({ enum: SUBSCRIPTION_PLANS }).notNull().default("free"),
  /** "pending" = checkout started, grants nothing; webhook flips to "active" (island.ts). */
  status: text({ enum: ["pending", "active"] }).notNull().default("active"),
  trialEndsAt: integer("trial_ends_at", { mode: "timestamp" }),
  createdAt: createdAt(),
});

/** One checkout attempt: the durable record the Midtrans webhook resolves. */
export const ORDER_STATUSES = ["pending", "paid", "failed"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const orders = sqliteTable(
  "orders",
  {
    id: id(),
    /** Midtrans order_id — the webhook's lookup key; Midtrans requires uniqueness. */
    orderId: text("order_id").notNull(),
    childId: text("child_id")
      .notNull()
      .references(() => children.id),
    plan: text({ enum: ["bulanan", "bundle"] }).notNull(),
    months: integer().notNull(),
    /** Gross amount in whole rupiah; the webhook re-checks it against the notification. */
    amountIdr: integer("amount_idr").notNull(),
    status: text({ enum: ORDER_STATUSES }).notNull().default("pending"),
    createdAt: createdAt(),
    /** Set when a signature-verified settlement notification arrives. */
    paidAt: integer("paid_at", { mode: "timestamp" }),
  },
  (t) => [uniqueIndex("orders_order_id_unique").on(t.orderId)],
);

// ---------------------------------------------------------------------------
// Inferred row types — import these instead of redeclaring shapes
// ---------------------------------------------------------------------------

export type Parent = typeof parents.$inferSelect;
export type Child = typeof children.$inferSelect;
export type Skill = typeof skills.$inferSelect;
export type Attempt = typeof attempts.$inferSelect;
export type Mastery = typeof mastery.$inferSelect;
export type PlacementResult = typeof placementResults.$inferSelect;
export type ServedTask = typeof servedTasks.$inferSelect;
export type Streak = typeof streaks.$inferSelect;
export type StarsLedgerEntry = typeof starsLedger.$inferSelect;
export type ShopItem = typeof shopItems.$inferSelect;
export type InventoryEntry = typeof inventory.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Order = typeof orders.$inferSelect;
