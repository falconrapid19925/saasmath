/**
 * Idempotent content seed: skill graph, shop catalogue, demo parent + child.
 * Run AFTER the schema is pushed:
 *
 *   npm run db:push
 *   npm run db:seed
 *
 * Safe to re-run:
 * - skills and shop_items are upserted by their stable text ids (content
 *   refresh — re-running applies the authored data).
 * - the demo account uses fixed UUIDs: the child's credentials (name, grade,
 *   PIN) are upserted so re-seeding applies the current PIN policy to older
 *   dev databases, while stars, ledger and inventory stay insert-if-missing
 *   (re-seeding never resets the demo child's stars or duplicates entries).
 *
 * Plain `node` runs this via native TypeScript stripping, so every relative
 * import below needs its explicit .ts extension (Next/tsc/vitest unaffected).
 */

import { eq } from "drizzle-orm";

import { getDb } from "./index.ts";
import {
  children,
  inventory,
  parents,
  shopItems,
  skills,
  starsLedger,
  subscriptions,
} from "./schema.ts";

import { DEMO_ACCOUNT } from "../data/demo-account.ts";
import { SKILL_SPECS, skillSpecToRow } from "../data/skills/index.ts";
import { SHOP_ITEM_SPECS, STARTER_AVATAR_ID } from "../data/shop-items.ts";
import { hashPassword } from "../lib/auth.ts";

function main(): void {
  const db = getDb();

  db.transaction((tx) => {
    // 1. Skill graph — upsert by stable id. (.run() executes the builder —
    // drizzle sqlite builders are lazy outside await/.run()/.returning().)
    for (const spec of SKILL_SPECS) {
      const row = skillSpecToRow(spec);
      tx.insert(skills)
        .values(row)
        .onConflictDoUpdate({
          target: skills.id,
          set: {
            grade: row.grade,
            strand: row.strand,
            titleId: row.titleId,
            family: row.family,
            steps: row.steps,
            prereqIds: row.prereqIds,
            baseSctSecondsPerItem: row.baseSctSecondsPerItem,
            cpaModels: row.cpaModels,
            isFreeIsland: row.isFreeIsland,
            orderIndex: row.orderIndex,
          },
        })
        .run();
    }

    // 2. Shop catalogue — upsert by stable id.
    for (const item of SHOP_ITEM_SPECS) {
      tx.insert(shopItems)
        .values({
          id: item.id,
          nameId: item.nameId,
          kind: item.kind,
          priceStars: item.priceStars,
          emojiOrColor: item.emojiOrColor,
        })
        .onConflictDoUpdate({
          target: shopItems.id,
          set: {
            nameId: item.nameId,
            kind: item.kind,
            priceStars: item.priceStars,
            emojiOrColor: item.emojiOrColor,
          },
        })
        .run();
    }

    // 3. Demo parent + child — insert if missing (never resets dev state).
    // (.all() executes the lazy sqlite builder; the parent's returning rows
    // are not needed, only the child's gate the ledger/inventory grants.)
    tx.insert(parents)
      .values({
        id: DEMO_ACCOUNT.parent.id,
        email: DEMO_ACCOUNT.parent.email,
        passwordHash: hashPassword(DEMO_ACCOUNT.parent.password),
        name: DEMO_ACCOUNT.parent.name,
      })
      .onConflictDoNothing()
      .returning({ id: parents.id })
      .all();

    const insertedChildren = tx
      .insert(children)
      .values({
        id: DEMO_ACCOUNT.child.id,
        parentId: DEMO_ACCOUNT.parent.id,
        name: DEMO_ACCOUNT.child.name,
        grade: DEMO_ACCOUNT.child.grade,
        avatar: DEMO_ACCOUNT.child.avatarItemId,
        pinHash: hashPassword(DEMO_ACCOUNT.child.pin),
        starsBalance: DEMO_ACCOUNT.child.startingStars,
      })
      .onConflictDoNothing()
      .returning({ id: children.id })
      .all();

    if (insertedChildren.length > 0) {
      // Opening balance must reconcile with the ledger (sum(delta) = balance).
      tx.insert(starsLedger)
        .values({
          childId: DEMO_ACCOUNT.child.id,
          delta: DEMO_ACCOUNT.child.startingStars,
          reason: "seed_bonus",
        })
        .run();
      tx.insert(inventory)
        .values({
          childId: DEMO_ACCOUNT.child.id,
          itemId: STARTER_AVATAR_ID,
        })
        .onConflictDoNothing()
        .run();
    }

    // Upsert the demo child's credentials so re-seeding applies the current
    // PIN policy to databases seeded before it (stars/ledger stay untouched).
    tx.update(children)
      .set({
        name: DEMO_ACCOUNT.child.name,
        grade: DEMO_ACCOUNT.child.grade,
        pinHash: hashPassword(DEMO_ACCOUNT.child.pin),
      })
      .where(eq(children.id, DEMO_ACCOUNT.child.id))
      .run();

    tx.insert(subscriptions)
      .values({ childId: DEMO_ACCOUNT.child.id, plan: "free" })
      .onConflictDoNothing()
      .run();
  });

  console.log(
    `[db:seed] ${SKILL_SPECS.length} skills (${SKILL_SPECS.filter((s) => s.isFreeIsland).length} free-island), ` +
      `${SHOP_ITEM_SPECS.length} shop items, demo account ${DEMO_ACCOUNT.parent.email} ` +
      `(child ${DEMO_ACCOUNT.child.name}, PIN ${DEMO_ACCOUNT.child.pin}) ready.`,
  );
}

try {
  main();
} catch (error) {
  console.error("[db:seed] failed:", error);
  process.exit(1);
}
