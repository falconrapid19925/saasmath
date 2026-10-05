/**
 * Weekly aggregation for the parent dashboard and the WhatsApp digest
 * (plan sections 4.6 and 5). Pure functions over plain row facts; the route
 * loads rows, applies implausibility flagging (plan section 6: flagged
 * attempts never reach the dashboard), and calls these.
 */

import type { AttemptFact } from "./implausibility";

export type SummaryAttempt = AttemptFact & {
  attemptId: string;
  skillId: string;
  sctSeconds: number;
  createdAt: Date;
  /** Set to true by the caller for attempts the implausibility check flagged. */
  implausible?: boolean;
};

export type StarLedgerFact = {
  delta: number;
  createdAt: Date;
};

export type WeekAggregation = {
  setsDone: number;
  /** Jakarta date keys ("YYYY-MM-DD") with at least one completed set. */
  activeDays: string[];
  avgAccuracy: number | null;
  avgTimeMs: number | null;
  /** Mean served SCT of the week's sets, in seconds. */
  avgSctSeconds: number | null;
  withinSctCount: number;
  starsWeek: number;
  /** Attempts excluded as implausible (reported to the parent, not hidden silently). */
  flaggedCount: number;
  perSkill: { skillId: string; sets: number; avgAccuracy: number | null }[];
};

/** Sum an integer accumulation of ledger deltas. */
export function sumStars(entries: StarLedgerFact[]): number {
  return entries.reduce((total, entry) => total + entry.delta, 0);
}

/**
 * Aggregate one week of attempts ([weekStart, weekEnd)) into dashboard/digest
 * facts. Implausible attempts (flagged by the caller, plan section 6) are
 * excluded from every aggregate and only counted in `flaggedCount`.
 */
export function aggregateWeek(
  attempts: SummaryAttempt[],
  starEntries: StarLedgerFact[],
): WeekAggregation {
  const clean = attempts.filter((a) => !a.implausible);

  const activeDays = [
    ...new Set(clean.map((a) => jakartaKeyOf(a.createdAt))),
  ].sort();

  const mean = (values: number[]): number | null =>
    values.length === 0
      ? null
      : values.reduce((s, v) => s + v, 0) / values.length;

  const accuracies = clean.map((a) => (a.total > 0 ? a.correctCount / a.total : 0));

  const perSkillMap = new Map<string, { sets: number; accuracies: number[] }>();
  for (const attempt of clean) {
    const entry = perSkillMap.get(attempt.skillId) ?? { sets: 0, accuracies: [] };
    entry.sets += 1;
    entry.accuracies.push(attempt.total > 0 ? attempt.correctCount / attempt.total : 0);
    perSkillMap.set(attempt.skillId, entry);
  }

  return {
    setsDone: clean.length,
    activeDays,
    avgAccuracy: mean(accuracies),
    avgTimeMs: mean(clean.map((a) => a.timeMs)),
    avgSctSeconds: mean(clean.map((a) => a.sctSeconds)),
    withinSctCount: clean.filter((a) => a.timeMs <= a.sctSeconds * 1000).length,
    starsWeek: sumStars(starEntries),
    flaggedCount: attempts.length - clean.length,
    perSkill: [...perSkillMap.entries()]
      .map(([skillId, entry]) => ({
        skillId,
        sets: entry.sets,
        avgAccuracy: mean(entry.accuracies),
      }))
      .sort((a, b) => a.skillId.localeCompare(b.skillId)),
  };
}

// en-CA yields ISO-like YYYY-MM-DD. One module-scope formatter is shared by
// both readers below — Intl constructors load locale data and must not be
// rebuilt per call.
const jakartaDayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Jakarta date key for the star calendar. Kept here (instead of importing
 * streak.ts) so aggregation stays dependency-light; both must agree on
 * Asia/Jakarta day boundaries.
 */
function jakartaKeyOf(date: Date): string {
  return jakartaDayKeyFormatter.format(date);
}

/**
 * Star-calendar days for the dashboard: the last `days` Jakarta dates ending
 * today, each marked done/undone from the attempt date keys.
 */
export function starCalendar(
  attemptDateKeys: Set<string>,
  days: number,
  now: Date,
): { date: string; done: boolean }[] {
  const out: { date: string; done: boolean }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = jakartaDayKeyFormatter.format(date);
    out.push({ date: key, done: attemptDateKeys.has(key) });
  }
  return out;
}
