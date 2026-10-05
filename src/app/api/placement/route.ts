/**
 * Placement diagnostic (plan 3.1 step 1), over the drill engine's ladder
 * (src/lib/engine/placement.ts): 10 rungs x 2 items = 20 items, ids
 * `placement-r{rung}-{i}`, deterministic in the seed.
 *
 * GET  ?childId=... -> a fresh diagnostic (random seed, returned so POST can
 *      regenerate the identical items — nothing client-sent is trusted).
 * POST -> re-grades with engine grading, places at the last cleanly passed
 *      rung (engine stop rule), clamps to a rung whose skill exists and is
 *      island-accessible, and writes placement_results + the initial mastery
 *      row.
 */

import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { children, mastery, placementResults, skills } from "@/db/schema";
import {
  generatePlacementItems,
  placeFromResults,
  PLACEMENT_RUNGS,
  PLACEMENT_TOTAL_ITEMS,
} from "@/lib/engine/placement";
import { gradeItems } from "@/lib/server/answers";
import { requireChildAccess } from "@/lib/server/authz";
import { loadAccessibleSkills } from "@/lib/server/curriculum";
import { handleRoute, HttpError, parseJson } from "@/lib/server/http";
import { clampPlacementRung } from "@/lib/server/placement";
import { answersSchema } from "@/lib/server/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const postBodySchema = z.object({
  childId: z.string().min(1),
  /** The seed GET returned; regenerates the identical 20-item ladder. */
  seed: z.number().int(),
  /** One answer per item of the ladder; null = skipped. */
  answers: answersSchema,
});

/** GET ?childId=... — a fresh placement diagnostic. */
export async function GET(req: Request) {
  return handleRoute(async () => {
    const url = new URL(req.url);
    const childId = url.searchParams.get("childId");
    if (!childId) throw new HttpError(400, "childId query parameter is required");

    const db = getDb();
    await requireChildAccess(db, childId);
    const childRows = await db.select().from(children).where(eq(children.id, childId)).limit(1);
    const child = childRows[0];
    if (!child) throw new HttpError(404, "Child not found");

    // Island access shapes which rungs can end up placed; GET exposes it so
    // the client can pre-warn, the POST enforces it via the clamp.
    const { access, skills: accessible } = await loadAccessibleSkills(db, child, new Date());

    const seed = newSetSeed();
    const items = safeGeneratePlacementItems(seed);

    return Response.json({
      childId,
      seed,
      totalItems: PLACEMENT_TOTAL_ITEMS,
      rungs: PLACEMENT_RUNGS.map((rung) => ({
        skillId: rung.skillId,
        usable:
          accessible.some((skill) => skill.id === rung.skillId),
      })),
      items,
      access,
    });
  });
}

/** POST — grade the diagnostic and place the child. */
export async function POST(req: Request) {
  return handleRoute(async () => {
    const body = await parseJson(req, postBodySchema);
    const db = getDb();
    await requireChildAccess(db, body.childId);

    const childRows = await db.select().from(children).where(eq(children.id, body.childId)).limit(1);
    const child = childRows[0];
    if (!child) throw new HttpError(404, "Child not found");

    const now = new Date();
    const { skills: accessible } = await loadAccessibleSkills(db, child, now);
    const accessibleIds = new Set(accessible.map((skill) => skill.id));

    const items = safeGeneratePlacementItems(body.seed);
    if (body.answers.length !== items.length) {
      throw new HttpError(
        400,
        `answers length (${body.answers.length}) != items length (${items.length})`,
      );
    }

    const graded = gradeItems(items, body.answers);
    const correct = graded.items.map((item) => item.correct);
    const outcome = placeFromResults(items, correct);

    // Server-only clamp: the rung's skill must exist and be island-accessible.
    const rung = clampPlacementRung(outcome.lastPassedRung, accessibleIds);
    if (rung === null) {
      throw new HttpError(
        503,
        "Kurikulum belum tersedia: tidak ada rung penempatan yang cocok dengan konten ter-seed",
      );
    }
    const placedRung = PLACEMENT_RUNGS[rung]!;

    // Display title for the client's completion screen.
    const skillRows = await db
      .select({ titleId: skills.titleId })
      .from(skills)
      .where(eq(skills.id, placedRung.skillId))
      .limit(1);
    const placedTitleId = skillRows[0]?.titleId ?? placedRung.skillId;

    // Persist: the diagnostic items, the placement, and the initial mastery.
    await db.insert(placementResults).values({
      childId: child.id,
      items,
      placedSkill: placedRung.skillId,
      placedStep: placedRung.step,
    });

    const nextMastery = {
      state: "Baru" as const,
      step: placedRung.step,
      cpaMode: false,
      fluencyFlag: false,
      updatedAt: now,
    };
    await db
      .insert(mastery)
      .values({ childId: child.id, skillId: placedRung.skillId, ...nextMastery })
      .onConflictDoUpdate({
        target: [mastery.childId, mastery.skillId],
        set: nextMastery,
      });

    return Response.json({
      placedSkill: { id: placedRung.skillId, step: placedRung.step, titleId: placedTitleId },
      clampedFromRung: outcome.lastPassedRung !== rung ? outcome.lastPassedRung : null,
      lastPassedRung: outcome.lastPassedRung,
      firstFailedRung: outcome.firstFailedRung,
      rungsAttempted: outcome.rungsAttempted,
      correctCount: graded.correctCount,
      total: graded.total,
      note: outcome.note,
    });
  });
}

/** Engine ladder generation; maps any engine error to a 503. */
function safeGeneratePlacementItems(seed: number) {
  try {
    return generatePlacementItems(seed);
  } catch (error) {
    throw new HttpError(
      503,
      `Placement generation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** A fresh random seed per diagnostic. */
function newSetSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] as number;
}
