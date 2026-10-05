"use server";

/**
 * Read models for the parent dashboard, the weekly PDF report (pdf-lib), and
 * the read-only admin-lite skill list. Delegates to the canonical server
 * modules: buildWeeklySummary (weekly aggregation + implausibility flags +
 * star calendar) and renderWeeklyDigest (WhatsApp digest text) — the same
 * functions behind /api/parent/summary and /api/digest/preview. Per-set PDFs
 * stream from /api/sets/[id]/pdf; this module's own PDF is the weekly report.
 * All DB access is inside action bodies.
 */

import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db/index";
import {
  attempts,
  children,
  mastery,
  parents,
  skills,
  subscriptions,
} from "@/db/schema";
import { buildWeeklySummary } from "@/lib/server/parentsummary";
import {
  dayLabelId,
  formatWeekRangeId,
  renderWeeklyDigest,
} from "@/lib/server/digest";
import { todayKeyJakarta } from "@/lib/dates";
import {
  formatDateIdId,
  formatNumberId,
} from "@/lib/client/format";
import type {
  ChildSummaryLite,
  ParentDashboardData,
} from "@/lib/client/view-models";

import { getSession } from "./auth";

/** Weekly set target shown in the digest (plan 3.4: 10–15 menit/hari). */
const WEEKLY_SET_TARGET = 6;

export async function getParentDashboard(): Promise<ParentDashboardData | { error: string }> {
  const session = await getSession();
  if (!session || session.role !== "parent") {
    return { error: "Masuk sebagai orang tua dulu." };
  }
  const db = getDb();

  const parentRows = await db.select().from(parents).where(eq(parents.id, session.sub)).limit(1);
  const parent = parentRows[0];
  if (!parent) return { error: "Akun tidak ditemukan." };

  const kids = await db.select().from(children).where(eq(children.parentId, parent.id));
  if (kids.length === 0) {
    return { parentName: parent.name, weekLabel: "Minggu ini", children: [] };
  }

  const kidIds = kids.map((k) => k.id);
  const now = new Date();
  const [masteryRows, subRows, skillRows] = await Promise.all([
    db.select().from(mastery).where(inArray(mastery.childId, kidIds)),
    db.select().from(subscriptions).where(inArray(subscriptions.childId, kidIds)),
    db.select().from(skills),
  ]);
  const titleById = new Map(skillRows.map((s) => [s.id, s.titleId]));

  const summaries = await Promise.all(
    kids.map(async (kid) => {
      // Per-kid reads are independent: summary aggregation, the most recent
      // attempt ("sedang latihan: <topik>"), and the recent-set rows for the
      // per-set PDF links (/api/sets/[id]/pdf).
      const [summary, lastAttempt, recentRows] = await Promise.all([
        buildWeeklySummary(db, kid, now),
        db
          .select({ skillId: attempts.skillId })
          .from(attempts)
          .where(eq(attempts.childId, kid.id))
          .orderBy(desc(attempts.createdAt))
          .limit(1),
        db
          .select({
            attemptId: attempts.id,
            skillId: attempts.skillId,
            timeMs: attempts.timeMs,
            sctSeconds: attempts.sctSeconds,
            createdAt: attempts.createdAt,
          })
          .from(attempts)
          .where(eq(attempts.childId, kid.id))
          .orderBy(desc(attempts.createdAt))
          .limit(5),
      ]);
      const plan = subRows.find((s) => s.childId === kid.id)?.plan ?? "free";

      const kidMastery = masteryRows.filter((m) => m.childId === kid.id);
      const masteryCounts = { Baru: 0, Lancar: 0, Kuasai: 0 } as Record<
        "Baru" | "Lancar" | "Kuasai",
        number
      >;
      for (const m of kidMastery) masteryCounts[m.state] += 1;

      // Digest: same rendering as /api/digest/preview.
      const weekDays = summary.calendar.slice(-7).map((day) => ({
        label: dayLabelId(new Date(`${day.date}T12:00:00+07:00`)),
        done: day.done,
      }));
      const digestPreview = `${renderWeeklyDigest({
        childName: kid.name,
        weekRangeLabel: formatWeekRangeId(summary.weekStart, summary.weekEnd),
        setsDone: summary.week.setsDone,
        weeklySetTarget: WEEKLY_SET_TARGET,
        avgAccuracy: summary.week.avgAccuracy,
        avgTimeMs: summary.week.avgTimeMs,
        avgSctSeconds: summary.week.avgSctSeconds,
        withinSctCount: summary.week.withinSctCount,
        streakCurrent: summary.streak.current,
        streakBest: summary.streak.best,
        starsWeek: summary.week.starsWeek,
        weekDays,
      })} (Paket: ${plan})`;

      return {
        childId: kid.id,
        childName: kid.name,
        grade: kid.grade,
        setsDone: summary.week.setsDone,
        avgAccuracy: summary.week.avgAccuracy,
        avgTimeMs: summary.week.avgTimeMs,
        withinSctCount: summary.week.withinSctCount,
        starsWeek: summary.week.starsWeek,
        flaggedCount: summary.week.flaggedCount,
        streak: {
          current: summary.streak.current,
          best: summary.streak.best,
          freezesLeft: summary.streak.freezesLeft,
        },
        calendar: summary.calendar,
        currentSkillTitle: lastAttempt[0]
          ? titleById.get(lastAttempt[0].skillId) ?? null
          : null,
        masteryCounts,
        digestPreview,
        recentSets: recentRows.map((r) => ({
          attemptId: r.attemptId,
          label: `${formatDateIdId(todayKeyJakarta(r.createdAt))} · ${titleById.get(r.skillId) ?? r.skillId}`,
          withinSct: r.timeMs <= r.sctSeconds * 1000,
        })),
      };
    }),
  );

  return {
    parentName: parent.name,
    weekLabel: `Minggu ini (s.d. ${formatDateIdId(todayKeyJakarta(now))})`,
    children: summaries,
  };
}

// ---------------------------------------------------------------------------
// Weekly PDF report (pdf-lib at request time; ASCII-safe Bahasa text).
// Per-set worksheets with answer keys stream from /api/sets/[id]/pdf instead.
// ---------------------------------------------------------------------------

export async function makeWeeklyReportPdf(input: unknown): Promise<
  | { ok: true; filename: string; pdfBase64: string }
  | { error: string }
> {
  const zodChildId = z.object({ childId: z.string().min(1) });
  const session = await getSession();
  if (!session || session.role !== "parent") return { error: "Masuk sebagai orang tua dulu." };
  const parsed = zodChildId.safeParse(input);
  if (!parsed.success) return { error: "Anak tidak valid." };

  const db = getDb();
  const kidRows = await db.select().from(children).where(eq(children.id, parsed.data.childId)).limit(1);
  const kid = kidRows[0];
  if (!kid || kid.parentId !== session.sub) return { error: "Anak tidak ditemukan." };

  const now = new Date();
  // Summary aggregation and the 7-day attempt history are independent reads.
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600_000);
  const [summary, weekAttempts] = await Promise.all([
    buildWeeklySummary(db, kid, now),
    db
      .select({
        correctCount: attempts.correctCount,
        total: attempts.total,
        timeMs: attempts.timeMs,
        sctSeconds: attempts.sctSeconds,
        createdAt: attempts.createdAt,
        skillId: attempts.skillId,
        step: attempts.step,
      })
      .from(attempts)
      .where(and(eq(attempts.childId, kid.id), gte(attempts.createdAt, weekAgo)))
      .orderBy(desc(attempts.createdAt))
      .limit(20),
  ]);
  const skillRows = weekAttempts.length
    ? await db
        .select()
        .from(skills)
        .where(inArray(skills.id, [...new Set(weekAttempts.map((a) => a.skillId))]))
    : [];
  const titleById = new Map(skillRows.map((s) => [s.id, s.titleId]));

  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4
  const [font, bold] = await Promise.all([
    pdf.embedFont(StandardFonts.Helvetica),
    pdf.embedFont(StandardFonts.HelveticaBold),
  ]);
  const ink = rgb(0.1, 0.12, 0.16);
  const muted = rgb(0.42, 0.45, 0.5);

  page.drawText("SaasMath - Laporan Mingguan", { x: 48, y: 780, size: 20, font: bold, color: ink });
  page.drawText(`Anak: ${kid.name} (Kelas ${kid.grade})`, { x: 48, y: 752, size: 12, font, color: ink });
  page.drawText(`Dicetak: ${formatDateIdId(todayKeyJakarta(now))}`, { x: 48, y: 734, size: 11, font, color: muted });

  const week = summary.week;
  const pct = week.avgAccuracy === null ? "-" : `${Math.round(week.avgAccuracy * 100)}%`;
  const minutes = week.avgTimeMs === null ? 0 : Math.round((week.avgTimeMs * week.setsDone) / 60_000);

  page.drawText("Ringkasan 7 hari terakhir", { x: 48, y: 700, size: 14, font: bold, color: ink });
  const summaryLines = [
    `Set selesai: ${week.setsDone}`,
    `Ketepatan rata-rata: ${pct}`,
    `Set dalam target SCT: ${week.withinSctCount} dari ${week.setsDone}`,
    `Total waktu latihan: sekitar ${minutes} menit`,
    `Bintang minggu ini: ${formatNumberId(week.starsWeek, 0)}`,
    `Streak: ${summary.streak.current} hari (rekor ${summary.streak.best}, tiket beku ${summary.streak.freezesLeft})`,
  ];
  if (week.flaggedCount > 0) {
    summaryLines.push(`Hasil ditandai tidak wajar untuk ditinjau: ${week.flaggedCount}`);
  }
  summaryLines.forEach((line, i) => {
    page.drawText(`- ${line}`, { x: 56, y: 676 - i * 20, size: 11, font, color: ink });
  });

  page.drawText("Riwayat set", { x: 48, y: 540, size: 14, font: bold, color: ink });
  let y = 516;
  for (const a of weekAttempts) {
    const when = formatDateIdId(todayKeyJakarta(a.createdAt));
    const acc = a.total > 0 ? Math.round((a.correctCount / a.total) * 100) : 0;
    const within = a.timeMs <= a.sctSeconds * 1000 ? "SCT ok" : "di luar SCT";
    const line = `${when} - ${titleById.get(a.skillId) ?? a.skillId} (langkah ${a.step}) - ${acc}%, ${within}`;
    page.drawText(line.slice(0, 95), { x: 56, y, size: 10, font, color: ink });
    y -= 18;
    if (y < 60) break;
  }

  page.drawText("Dicetak dari SaasMath - latihan matematika harian bergaya Kumon.", {
    x: 48, y: 40, size: 9, font, color: muted,
  });

  const bytes = await pdf.save();
  return {
    ok: true,
    filename: `saasmath-laporan-${kid.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`,
    pdfBase64: Buffer.from(bytes).toString("base64"),
  };
}

// ---------------------------------------------------------------------------
// Admin-lite: read-only skill list with generator params
// ---------------------------------------------------------------------------

/** Minimal child list for the parent dashboard profile switcher. */
export async function getMyChildren(): Promise<ChildSummaryLite[]> {
  const session = await getSession();
  if (!session || session.role !== "parent") return [];
  const db = getDb();
  const rows = await db
    .select({
      id: children.id,
      name: children.name,
      grade: children.grade,
      avatar: children.avatar,
    })
    .from(children)
    .where(eq(children.parentId, session.sub));
  return rows;
}

export async function getAdminSkills() {
  const session = await getSession();
  if (!session || session.role !== "parent") {
    return { error: "Masuk sebagai orang tua dulu." } as const;
  }
  const db = getDb();
  const rows = await db.select().from(skills).orderBy(skills.grade, skills.strand, skills.orderIndex);
  return {
    skills: rows.map((s) => ({
      id: s.id,
      grade: s.grade,
      strand: s.strand,
      titleId: s.titleId,
      family: s.family,
      stepCount: s.steps.length,
      steps: s.steps,
      baseSctSecondsPerItem: s.baseSctSecondsPerItem,
      cpaModels: s.cpaModels,
      isFreeIsland: s.isFreeIsland,
    })),
  };
}
