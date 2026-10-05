/**
 * POST /api/session/submit — the server re-grades the client-graded set
 * (plan section 6), computes the SCT delta and gate decision, and applies
 * mastery/streak/stars/Elo/SM-2/SCT updates. Returns the grading detail for
 * in-session self-correction plus the gate decision.
 */

import { z } from "zod";

import { getDb } from "@/db";
import { requireChildSession } from "@/lib/server/authz";
import { processAttempt } from "@/lib/server/attempts";
import { handleRoute, parseJson } from "@/lib/server/http";
import { answersSchema } from "@/lib/server/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  skillId: z.string().min(1),
  step: z.number().int().min(1),
  seed: z.number().int(),
  answers: answersSchema,
  timeMs: z.number().int().min(0).max(24 * 60 * 60 * 1000),
});

export async function POST(req: Request) {
  return handleRoute(async () => {
    const session = await requireChildSession();
    const body = await parseJson(req, bodySchema);
    const db = getDb();

    const result = await processAttempt(db, session.sub, body);
    return Response.json(result);
  });
}
