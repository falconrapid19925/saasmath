/**
 * GET /api/parent/summary?childId=... — weekly aggregates for the parent
 * dashboard (plan sections 4.6 and 5): sets done, accuracy, time vs SCT,
 * streak, star-calendar days. Implausibility-flagged attempts (plan 6) are
 * excluded from aggregates and reported separately.
 */

import { handleRoute, HttpError } from "@/lib/server/http";
import { buildWeeklySummary } from "@/lib/server/parentsummary";
import { requireOwnedChild } from "@/lib/server/authz";
import { getDb } from "@/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  return handleRoute(async () => {
    const url = new URL(req.url);
    const childId = url.searchParams.get("childId");
    if (!childId) throw new HttpError(400, "childId query parameter is required");

    const db = getDb();
    const child = await requireOwnedChild(db, childId);
    const summary = await buildWeeklySummary(db, child, new Date());

    return Response.json({
      child: { id: child.id, name: child.name, grade: child.grade, starsBalance: child.starsBalance },
      streak: summary.streak,
      week: summary.week,
      flagged: summary.flagged,
      calendar: summary.calendar,
    });
  });
}
