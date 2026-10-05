/**
 * POST /api/sync — offline queue drain (plan sections 5 and 6). Accepts
 * queued attempts, applies them in order through the exact same pipeline as
 * /api/session/submit (server re-grade, gate, mastery/streak/stars/Elo/
 * SM-2), and flags statistically implausible results (superhuman speed,
 * uniform perfect patterns) so they never reach the parent dashboard.
 *
 * Per-attempt outcome: applied | duplicate (409 from the pipeline) |
 * rejected (bad input) — one bad attempt never blocks the rest of the queue.
 */

import { z } from "zod";

import { getDb } from "@/db";
import { requireChildSession } from "@/lib/server/authz";
import { processAttempt } from "@/lib/server/attempts";
import { handleRoute, HttpError, parseJson } from "@/lib/server/http";
import { answersSchema } from "@/lib/server/schemas";
import type { ReviewFlag } from "@/lib/server/implausibility";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const queuedAttemptSchema = z.object({
  skillId: z.string().min(1),
  step: z.number().int().min(1),
  seed: z.number().int(),
  answers: answersSchema,
  timeMs: z.number().int().min(0).max(24 * 60 * 60 * 1000),
  /** Client completion timestamp (ISO); used for streak day attribution. */
  completedAt: z.string().datetime({ offset: true }).optional(),
});

const bodySchema = z.object({
  attempts: z.array(queuedAttemptSchema).min(1).max(10),
});

type QueuedAttempt = z.infer<typeof queuedAttemptSchema>;

export async function POST(req: Request) {
  return handleRoute(async () => {
    const session = await requireChildSession();
    const body = await parseJson(req, bodySchema);
    const db = getDb();

    // In-order application: later attempts see earlier ones' history so the
    // gate ladder, streak, and implausibility runs stay chronological. The
    // `for await` form makes that ordering requirement explicit — these are
    // NOT independent iterations and must never run concurrently.
    const results = [];
    for await (const queued of body.attempts) {
      results.push(await applyOne(db, session.sub, queued));
    }
    return Response.json({ results });
  });
}

async function applyOne(db: ReturnType<typeof getDb>, childId: string, queued: QueuedAttempt) {
  const completedAt = queued.completedAt ? new Date(queued.completedAt) : undefined;
  if (completedAt && Number.isNaN(completedAt.getTime())) {
    return { status: "rejected" as const, skillId: queued.skillId, error: "Invalid completedAt" };
  }

  try {
    const applied = await processAttempt(db, childId, {
      skillId: queued.skillId,
      step: queued.step,
      seed: queued.seed,
      answers: queued.answers,
      timeMs: queued.timeMs,
      completedAt,
    });
    return {
      status: "applied" as const,
      skillId: queued.skillId,
      attemptId: applied.attemptId,
      correctCount: applied.grade.correctCount,
      total: applied.grade.total,
      gate: applied.gate,
      streak: applied.streak,
      starsAwarded: applied.starsAwarded,
      /** Plan section 6: implausible results are flagged, not trusted. */
      implausible: applied.implausible as ReviewFlag | null,
    };
  } catch (error) {
    // Classified by status, not message text: 409 (duplicate attempt) is
    // terminal for a queued record, everything else stays queued as rejected.
    if (error instanceof HttpError && error.status === 409) {
      return { status: "duplicate" as const, skillId: queued.skillId };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { status: "rejected" as const, skillId: queued.skillId, error: message };
  }
}
