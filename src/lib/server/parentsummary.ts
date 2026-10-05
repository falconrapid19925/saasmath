/**
 * Weekly parent-summary assembly (plan sections 4.6 and 5): loads the
 * child's recent attempts and star ledger, applies implausibility flagging
 * (plan section 6 — flagged attempts never reach the dashboard), and
 * aggregates the week. Shared by /api/parent/summary and
 * /api/digest/preview. All DB access at request time.
 */

import { and, asc, eq, gte } from "drizzle-orm";

import type { SaasMathDb } from "@/db";
import { attempts, starsLedger, streaks, type Child } from "@/db/schema";

import {
  aggregateWeek,
  starCalendar,
  type SummaryAttempt,
  type WeekAggregation,
} from "./summary";
import { flagImplausible, type AttemptFact, type ReviewFlag } from "./implausibility";
import { jakartaDateString } from "./streak";

export type FlaggedAttempt = { attemptId: string; flag: ReviewFlag };

export type WeeklySummary = {
  weekStart: Date;
  weekEnd: Date;
  week: WeekAggregation;
  flagged: FlaggedAttempt[];
  streak: {
    current: number;
    best: number;
    freezesLeft: number;
    lastCompletedDate: string | null;
  };
  /** Last 14 days, oldest first, for the star calendar. */
  calendar: { date: string; done: boolean }[];
};

export const SUMMARY_WINDOW_DAYS = 7;
const HISTORY_WINDOW_DAYS = 14;

/**
 * Attempts from the last `days` days (chronological), with per-attempt
 * implausibility flags computed against same-skill history.
 */
async function loadFlaggedAttempts(
  db: SaasMathDb,
  childId: string,
  now: Date,
  days: number,
): Promise<{ rows: (SummaryAttempt & { attemptId: string })[]; flagged: FlaggedAttempt[] }> {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      attemptId: attempts.id,
      skillId: attempts.skillId,
      correctCount: attempts.correctCount,
      total: attempts.total,
      timeMs: attempts.timeMs,
      sctSeconds: attempts.sctSeconds,
      createdAt: attempts.createdAt,
    })
    .from(attempts)
    .where(and(eq(attempts.childId, childId), gte(attempts.createdAt, since)))
    .orderBy(asc(attempts.createdAt));

  const flagged: FlaggedAttempt[] = [];
  const perSkillChrono = new Map<string, AttemptFact[]>();

  const enriched = rows.map((row) => {
    const fact: AttemptFact = {
      correctCount: row.correctCount,
      total: row.total,
      timeMs: row.timeMs,
    };
    // flagImplausible wants prior same-skill attempts NEWEST FIRST.
    const history = perSkillChrono.get(row.skillId) ?? [];
    const flag = flagImplausible(fact, [...history].reverse());
    if (flag) flagged.push({ attemptId: row.attemptId, flag });

    const list = perSkillChrono.get(row.skillId) ?? [];
    list.push(fact);
    perSkillChrono.set(row.skillId, list);

    return {
      ...fact,
      attemptId: row.attemptId,
      skillId: row.skillId,
      sctSeconds: row.sctSeconds,
      createdAt: row.createdAt,
      implausible: flag !== null,
    };
  });

  return { rows: enriched, flagged };
}

/** Assemble the weekly summary for one child. */
export async function buildWeeklySummary(
  db: SaasMathDb,
  child: Pick<Child, "id">,
  now: Date,
): Promise<WeeklySummary> {
  const { rows, flagged } = await loadFlaggedAttempts(db, child.id, now, HISTORY_WINDOW_DAYS);

  const weekStart = new Date(now.getTime() - SUMMARY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const inWeek = rows.filter(
    (row) => row.createdAt >= weekStart && row.createdAt < now,
  );
  const ledgerRows = await db
    .select({ delta: starsLedger.delta, createdAt: starsLedger.createdAt })
    .from(starsLedger)
    .where(and(eq(starsLedger.childId, child.id), gte(starsLedger.createdAt, weekStart)));

  const week = aggregateWeek(inWeek, ledgerRows);

  const streakRows = await db
    .select()
    .from(streaks)
    .where(eq(streaks.childId, child.id))
    .limit(1);
  const streakRow = streakRows[0];

  const cleanDateKeys = new Set(
    rows.filter((row) => !row.implausible).map((row) => jakartaDateString(row.createdAt)),
  );

  return {
    weekStart,
    weekEnd: now,
    week,
    flagged,
    streak: {
      current: streakRow?.current ?? 0,
      best: streakRow?.best ?? 0,
      freezesLeft: streakRow?.freezesLeft ?? 2,
      lastCompletedDate: streakRow?.lastCompletedDate ?? null,
    },
    calendar: starCalendar(cleanDateKeys, HISTORY_WINDOW_DAYS, now),
  };
}
