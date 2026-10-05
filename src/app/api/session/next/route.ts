/**
 * POST /api/session/next — the server decides the next task: skill + step +
 * seed (plan sections 3.1 and 6). Daily progression first, then due SM-2
 * reviews; free-island gating applies. Returns the fully generated set so
 * the client can render it offline-deterministically from the seed.
 */

import { and, eq, gte } from "drizzle-orm";

import { getDb } from "@/db";
import { attempts, children, mastery } from "@/db/schema";
import { INITIAL_GATE_LADDER_STATE } from "@/lib/engine/gates";
import { requireChildSession } from "@/lib/server/authz";
import { loadAccessibleSkills } from "@/lib/server/curriculum";
import { generateSetItems, newSetSeed, stepParamsFor } from "@/lib/server/engine";
import { handleRoute, HttpError } from "@/lib/server/http";
import { decideNextTask } from "@/lib/server/nexttask";
import { recordServedTask } from "@/lib/server/served";
import { servedSctSeconds } from "@/lib/server/sct";
import { jakartaDayStartUtc, jakartaDateString } from "@/lib/server/streak";
import {
  loadEpisodeState,
  sctCalibrationSample,
} from "@/lib/server/attempts";
import type { TaskMastery, TaskSkill } from "@/lib/server/nexttask";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  return handleRoute(async () => {
    const session = await requireChildSession();
    const db = getDb();

    const childRows = await db
      .select()
      .from(children)
      .where(eq(children.id, session.sub))
      .limit(1);
    const child = childRows[0];
    if (!child) throw new HttpError(404, "Child not found");

    const now = new Date();
    const dayStart = jakartaDayStartUtc(now);

    // Independent reads: accessible skills, mastery rows, and whether a
    // progression set already completed today (Jakarta) — the latter unlocks
    // review priority.
    const [accessibleSkills, masteryRows, todayAttempt] = await Promise.all([
      loadAccessibleSkills(db, child, now),
      db.select().from(mastery).where(eq(mastery.childId, child.id)),
      db
        .select({ id: attempts.id })
        .from(attempts)
        .where(and(eq(attempts.childId, child.id), gte(attempts.createdAt, dayStart)))
        .limit(1),
    ]);
    const { skills: accessible } = accessibleSkills;

    const taskSkills: TaskSkill[] = accessible.map((s) => ({
      id: s.id,
      orderIndex: s.orderIndex,
      prereqIds: s.prereqIds,
    }));
    const taskMastery: TaskMastery[] = masteryRows.map((row) => ({
      skillId: row.skillId,
      state: row.state,
      step: row.step,
      cpaMode: row.cpaMode,
      dueAt: row.dueAt,
      updatedAt: row.updatedAt,
    }));

    const decision = decideNextTask({
      now,
      hasAttemptToday: todayAttempt.length > 0,
      skills: taskSkills,
      masteryRows: taskMastery,
    });

    if (decision.kind === "placement_required") {
      return Response.json({
        kind: "placement_required" as const,
        reason: "Belum ada penempatan — ambil tes penempatan dulu.",
      });
    }

    const skill = accessible.find((s) => s.id === decision.skillId);
    if (!skill) {
      throw new HttpError(500, `Decided skill ${decision.skillId} is not accessible`);
    }
    stepParamsFor(skill, decision.step); // 400 early on a bad step

    const seed = newSetSeed();
    const items = generateSetItems(skill, decision.step, seed);

    // SCT (plan 3.1 steps 3 and 5): engine-calibrated base, tightened by the
    // gate ladder episode — only on the timed progression ladder. The same
    // server-folded ladder state rides along in the response so the client's
    // result screen predicts with the engine's decideGate on identical inputs
    // (review sets run the SM-2 gate, so they carry the initial state).
    const cpaMode =
      masteryRows.find((row) => row.skillId === skill.id)?.cpaMode ?? false;
    const gateLadder =
      decision.kind === "review"
        ? INITIAL_GATE_LADDER_STATE
        : await loadEpisodeState(db, child.id, skill.id, cpaMode, decision.step);
    const sctSeconds = servedSctSeconds({
      skill,
      step: decision.step,
      itemCount: items.length,
      tightenCycles: gateLadder.tightenCycles,
      calibration: await sctCalibrationSample(db, skill.id),
    });

    // Bind the task before handing it out (audit fix: progression was
    // forgeable): submit and sync can only consume a task via the
    // served_tasks row recorded here, and grade by the kind/SCT served.
    recordServedTask(db, {
      childId: child.id,
      skillId: skill.id,
      step: decision.step,
      seed,
      kind: decision.kind,
      sctSeconds,
    });

    return Response.json({
      kind: decision.kind,
      reason: decision.reason,
      today: jakartaDateString(now),
      skill: {
        id: skill.id,
        titleId: skill.titleId,
        strand: skill.strand,
        family: skill.family,
        grade: skill.grade,
      },
      step: decision.step,
      stepCount: skill.steps.length,
      seed,
      items,
      sctSeconds: Math.round(sctSeconds * 10) / 10,
      timed: decision.kind !== "cpa",
      gateLadder,
      cpaModels: skill.cpaModels,
    });
  });
}
