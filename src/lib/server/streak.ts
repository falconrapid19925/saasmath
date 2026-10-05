/**
 * Streak bookkeeping (plan section 4.1): daily set completion feeds the
 * streak, Duolingo-style, with 2 Streak Freeze tokens at start that absorb
 * a single missed day. Days are calendar dates in Asia/Jakarta (the app's
 * audience), stored as "YYYY-MM-DD" in streaks.lastCompletedDate.
 */

import { formatInt } from "../engine/answers";
import { dayKeyJakarta } from "../dates";

export const JAKARTA_TIMEZONE = "Asia/Jakarta";
/** Starting freeze tokens per child (plan 4.1: Duolingo's 2-freeze model). */
export const INITIAL_FREEZES = 2;

/** "YYYY-MM-DD" for a timestamp, in Asia/Jakarta. */
export function jakartaDateString(date: Date): string {
  return dayKeyJakarta(date);
}

/** UTC instant of Jakarta local midnight for the given date's day. */
export function jakartaDayStartUtc(date: Date): Date {
  const key = jakartaDateString(date);
  return new Date(`${key}T00:00:00+07:00`);
}

/** Whole calendar days between two "YYYY-MM-DD" strings (to - from). */
export function diffCalendarDays(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const fromUtc = Date.UTC(fy as number, (fm as number) - 1, fd as number);
  const toUtc = Date.UTC(ty as number, (tm as number) - 1, td as number);
  return Math.round((toUtc - fromUtc) / (24 * 60 * 60 * 1000));
}

export type StreakState = {
  current: number;
  best: number;
  freezesLeft: number;
  lastCompletedDate: string | null;
};

export type StreakUpdate = StreakState & {
  /** True when this completion changed the streak (first set of the day). */
  changed: boolean;
  /** True when a freeze token absorbed a missed day. */
  freezeUsed: boolean;
};

/**
 * Fold one completed daily set (on `today`, Jakarta) into the streak.
 * - Same-day repeat completions leave the streak untouched.
 * - Out-of-order or backdated completions (sync applies attempts in
 *   client-given order) are also no-ops: they must neither reset the streak
 *   nor regress lastCompletedDate.
 * - Consecutive day: current + 1.
 * - One missed day with a freeze available: the freeze absorbs it (Duolingo
 *   behavior); multi-day gaps reset even with freezes left — documented
 *   simplification, tokens are not consumed retroactively.
 */
export function updateStreak(prev: StreakState, today: string): StreakUpdate {
  if (
    prev.lastCompletedDate !== null &&
    diffCalendarDays(prev.lastCompletedDate, today) <= 0
  ) {
    return { ...prev, changed: false, freezeUsed: false };
  }

  let current: number;
  let freezesLeft = prev.freezesLeft;
  let freezeUsed = false;

  if (prev.lastCompletedDate === null) {
    current = 1;
  } else {
    const gap = diffCalendarDays(prev.lastCompletedDate, today);
    if (gap === 1) {
      current = prev.current + 1;
    } else if (gap === 2 && freezesLeft > 0) {
      freezesLeft -= 1;
      freezeUsed = true;
      current = prev.current + 1;
    } else {
      current = 1;
    }
  }

  return {
    current,
    best: Math.max(prev.best, current),
    freezesLeft,
    lastCompletedDate: today,
    changed: true,
    freezeUsed,
  };
}

/** Human line for the digest: "Streak: 4 hari (rekor: 9)". */
export function formatStreakLineId(streak: { current: number; best: number }): string {
  return `Streak: ${formatInt(streak.current)} hari (rekor: ${formatInt(streak.best)})`;
}
