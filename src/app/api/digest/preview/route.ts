/**
 * GET /api/digest/preview?childId=... — renders the weekly Bahasa Indonesia
 * WhatsApp digest text (plan section 4.6) from the same aggregation the
 * parent dashboard uses. The WhatsApp send itself is a stub (whatsapp.ts):
 * without WHATSAPP_TOKEN it logs and reports { sent: false }.
 */

import { requireOwnedChild } from "@/lib/server/authz";
import { getDb } from "@/db";
import { handleRoute, HttpError } from "@/lib/server/http";
import { buildWeeklySummary } from "@/lib/server/parentsummary";
import {
  dayLabelId,
  formatWeekRangeId,
  renderWeeklyDigest,
} from "@/lib/server/digest";
import { sendWhatsAppText } from "@/lib/server/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  return handleRoute(async () => {
    const url = new URL(req.url);
    const childId = url.searchParams.get("childId");
    if (!childId) throw new HttpError(400, "childId query parameter is required");

    const db = getDb();
    const child = await requireOwnedChild(db, childId);
    const now = new Date();
    const summary = await buildWeeklySummary(db, child, now);

    // Star calendar: the last 7 days, oldest first, aligned to weekdays.
    const weekDays = summary.calendar.slice(-7).map((day) => ({
      label: dayLabelId(new Date(`${day.date}T12:00:00+07:00`)),
      done: day.done,
    }));

    const text = renderWeeklyDigest({
      childName: child.name,
      weekRangeLabel: formatWeekRangeId(summary.weekStart, summary.weekEnd),
      setsDone: summary.week.setsDone,
      weeklySetTarget: 6, // planning default (plan 3.4: 10-15 menit/hari); tune in Phase 1
      avgAccuracy: summary.week.avgAccuracy,
      avgTimeMs: summary.week.avgTimeMs,
      avgSctSeconds: summary.week.avgSctSeconds,
      withinSctCount: summary.week.withinSctCount,
      streakCurrent: summary.streak.current,
      streakBest: summary.streak.best,
      starsWeek: summary.week.starsWeek,
      weekDays,
    });

    // Stub sender: logs without WHATSAPP_TOKEN; parents.phone column is a
    // documented gap, so the recipient is null for now.
    const send = await sendWhatsAppText(null, text);

    return Response.json({
      text,
      send,
      flagged: summary.flagged,
      week: summary.week,
    });
  });
}
