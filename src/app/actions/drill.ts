"use server";

/**
 * Server actions backing the child UI. Deliberately thin:
 * - drill business logic (next task, gates, attempt processing, placement)
 *   lives in the API routes (src/app/api/**) and their src/lib/server modules;
 *   the drill player and placement flow call those routes directly from the
 *   browser (src/lib/client/api.ts) so there is one source of truth;
 * - what remains here is what has no route yet: read models for the child
 *   home page and shop spending with its invariants.
 * All DB access happens inside action bodies.
 */

import { and, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db/index";
import {
  attempts,
  children,
  inventory,
  mastery,
  placementResults,
  shopItems,
  streaks,
} from "@/db/schema";
import { jakartaDayStartUtc } from "@/lib/server/streak";
import { loadAccessibleSkills } from "@/lib/server/curriculum";
import { purchaseShopItemForChild } from "@/lib/server/shop";
import type { IslandView, ShopData } from "@/lib/client/view-models";

import { getSession } from "./auth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function requireChild() {
  const session = await getSession();
  if (!session || session.role !== "child") return null;
  const db = getDb();
  const found = await db.select().from(children).where(eq(children.id, session.sub)).limit(1);
  return found[0] ?? null;
}

/** Fast guard for pages that need a placed child (pure read, no logic). */
export async function isPlacementDone(): Promise<boolean> {
  const child = await requireChild();
  if (!child) return false;
  const db = getDb();
  const rows = await db
    .select({ id: placementResults.id })
    .from(placementResults)
    .where(eq(placementResults.childId, child.id))
    .limit(1);
  return rows.length > 0;
}

/** Child display name for player headings (pure read). */
export async function getChildName(): Promise<string | null> {
  const child = await requireChild();
  return child?.name ?? null;
}

// ---------------------------------------------------------------------------
// Shop (no API route yet — invariants enforced here)
// ---------------------------------------------------------------------------

export async function getShopData(): Promise<ShopData | { error: string }> {
  const child = await requireChild();
  if (!child) return { error: "Sesi anak tidak ditemukan. Masuk lagi ya." };
  const db = getDb();
  // Shop catalogue and the child's inventory are independent reads.
  const [items, owned] = await Promise.all([
    db.select().from(shopItems).orderBy(shopItems.priceStars),
    db.select().from(inventory).where(eq(inventory.childId, child.id)),
  ]);
  const ownedIds = new Set(owned.map((o) => o.itemId));
  return {
    balance: child.starsBalance,
    items: items.map((i) => ({
      id: i.id,
      nameId: i.nameId,
      kind: i.kind,
      priceStars: i.priceStars,
      emoji: i.emojiOrColor?.emoji ?? null,
      color: i.emojiOrColor?.color ?? null,
      owned: ownedIds.has(i.id),
      equipped: child.avatar === i.id,
    })),
  };
}

export async function purchaseShopItem(input: unknown): Promise<{ ok: true } | { error: string }> {
  const child = await requireChild();
  if (!child) return { error: "Sesi anak tidak ditemukan. Masuk lagi ya." };
  const parsed = z.object({ itemId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return { error: "Item tidak valid." };

  // The invariant-bearing write (ownership, balance guard, ledger) lives in
  // src/lib/server/shop.ts so it is seam-testable without a session.
  const result = purchaseShopItemForChild(getDb(), child.id, parsed.data.itemId);
  return result.ok ? { ok: true } : { error: result.error };
}

export async function equipShopItem(input: unknown): Promise<{ ok: true } | { error: string }> {
  const child = await requireChild();
  if (!child) return { error: "Sesi anak tidak ditemukan. Masuk lagi ya." };
  const parsed = z.object({ itemId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return { error: "Item tidak valid." };
  const db = getDb();
  const owned = await db
    .select()
    .from(inventory)
    .where(and(eq(inventory.childId, child.id), eq(inventory.itemId, parsed.data.itemId)))
    .limit(1);
  if (owned.length === 0) return { error: "Belum memiliki item ini." };
  await db.update(children).set({ avatar: parsed.data.itemId }).where(eq(children.id, child.id));
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Child home read model (pure reads; the task CTA loads via /api/session/next)
// ---------------------------------------------------------------------------

export async function getChildHomeData() {
  const child = await requireChild();
  if (!child) return null;
  const db = getDb();

  const now = new Date();
  const dayStart = jakartaDayStartUtc(now);

  // Independent reads: streak, today's attempts, accessible skills, mastery,
  // the most recent attempt, and the equipped avatar item — none consumes
  // another's result.
  const [streakRows, todayAttempts, accessibleSkills, masteryRows, lastAttempt, avatarItemRows] =
    await Promise.all([
      db.select().from(streaks).where(eq(streaks.childId, child.id)).limit(1),
      db
        .select({ id: attempts.id })
        .from(attempts)
        .where(and(eq(attempts.childId, child.id), gte(attempts.createdAt, dayStart)))
        .limit(1),
      loadAccessibleSkills(db, child, now),
      db.select().from(mastery).where(eq(mastery.childId, child.id)),
      db
        .select({ skillId: attempts.skillId })
        .from(attempts)
        .where(eq(attempts.childId, child.id))
        .orderBy(desc(attempts.createdAt))
        .limit(1),
      child.avatar
        ? db.select().from(shopItems).where(eq(shopItems.id, child.avatar)).limit(1)
        : Promise.resolve([] as (typeof shopItems.$inferSelect)[]),
    ]);

  const streakRow = streakRows[0];
  const { skills: accessible } = accessibleSkills;
  const masteryBySkill = new Map(masteryRows.map((m) => [m.skillId, m]));
  const lastSkillId = lastAttempt[0]?.skillId ?? null;
  const avatarEmoji = avatarItemRows[0]?.emojiOrColor?.emoji ?? "😀";

  // Group skills into islands by strand, curriculum order preserved.
  const strandOrder = ["Bilangan", "Pengukuran", "Geometri", "Data"];
  const byStrand = new Map<string, typeof accessible>();
  for (const s of accessible) {
    const list = byStrand.get(s.strand) ?? [];
    list.push(s);
    byStrand.set(s.strand, list);
  }
  const islands: IslandView[] = strandOrder
    .filter((strand) => byStrand.has(strand))
    .map((strand) => {
      const list = byStrand.get(strand) ?? [];
      return {
        strand,
        isFreeIsland: list.some((s) => s.isFreeIsland),
        skills: list.map((s) => {
          const m = masteryBySkill.get(s.id);
          return {
            id: s.id,
            titleId: s.titleId,
            strand: s.strand,
            state: m?.state ?? "Baru",
            step: m?.step ?? 1,
            stepCount: s.steps.length,
            cpaMode: m?.cpaMode ?? false,
            fluencyFlag: m?.fluencyFlag ?? false,
            isCurrent: lastSkillId ? s.id === lastSkillId : false,
          };
        }),
      };
    });

  const needsPlacement =
    (
      await db
        .select({ id: placementResults.id })
        .from(placementResults)
        .where(eq(placementResults.childId, child.id))
        .limit(1)
    ).length === 0;

  return {
    child: {
      id: child.id,
      name: child.name,
      grade: child.grade,
      avatar: child.avatar,
      /** children.avatar resolved to its shop emoji; "😀" when unresolvable. */
      avatarEmoji,
      starsBalance: child.starsBalance,
    },
    streak: {
      current: streakRow?.current ?? 0,
      best: streakRow?.best ?? 0,
      freezesLeft: streakRow?.freezesLeft ?? 2,
      doneToday: todayAttempts.length > 0,
    },
    needsPlacement,
    islands,
  };
}
