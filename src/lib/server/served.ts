/**
 * Served-task record (audit fix: progression was forgeable — submit accepted
 * any client-chosen (skillId, step, seed) because /api/session/next performed
 * zero DB writes). The session route writes one served_tasks row per task it
 * hands out; the write path (processAttempt — /api/session/submit and
 * /api/sync) requires an unconsumed row matching the submission and marks it
 * consumed in the same transaction as the attempt insert, so exactly one
 * graded attempt exists per served task. Grading follows the row's kind and
 * SCT — what was actually served — not a mode re-derived from mastery.
 */

import { and, asc, eq, isNull } from "drizzle-orm";

import type { SaasMathDb } from "@/db";
import { servedTasks, type ServedTask } from "@/db/schema";

/** Transaction-capable handle: the db itself or a drizzle transaction. */
export type DbLike = SaasMathDb | Parameters<Parameters<SaasMathDb["transaction"]>[0]>[0];

/** The child's oldest unconsumed served task matching the submission. */
export function findUnconsumedServedTask(
  db: DbLike,
  childId: string,
  match: { skillId: string; step: number; seed: number },
): ServedTask | null {
  return (
    db
      .select()
      .from(servedTasks)
      .where(
        and(
          eq(servedTasks.childId, childId),
          eq(servedTasks.skillId, match.skillId),
          eq(servedTasks.step, match.step),
          eq(servedTasks.seed, match.seed),
          isNull(servedTasks.consumedAt),
        ),
      )
      .orderBy(asc(servedTasks.servedAt))
      .get() ?? null
  );
}

/**
 * Record a task the session route is about to hand out. Called before the
 * response is sent so the child can submit what it received.
 */
export function recordServedTask(
  db: SaasMathDb,
  input: {
    childId: string;
    skillId: string;
    step: number;
    seed: number;
    kind: ServedTask["kind"];
    /** The SCT the set is served with; grading judges against this value. */
    sctSeconds: number;
  },
): void {
  db.insert(servedTasks)
    .values({
      childId: input.childId,
      skillId: input.skillId,
      step: input.step,
      seed: input.seed,
      kind: input.kind,
      sctSeconds: input.sctSeconds,
    })
    .run();
}

/**
 * Atomically consume the matching unconsumed served task (oldest first).
 * Null when none is left — the caller rejects the submission. Runs inside
 * the attempt write transaction so claim + insert commit or roll back
 * together.
 */
export function claimServedTask(
  tx: DbLike,
  childId: string,
  match: { skillId: string; step: number; seed: number },
  consumedAt: Date,
): ServedTask | null {
  const served = findUnconsumedServedTask(tx, childId, match);
  if (!served) return null;
  tx.update(servedTasks)
    .set({ consumedAt })
    .where(and(eq(servedTasks.id, served.id), isNull(servedTasks.consumedAt)))
    .run();
  return served;
}
