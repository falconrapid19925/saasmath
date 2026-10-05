/**
 * SM-2 spaced review scheduling (plan sections 3.1 step 8 and 6): mastered
 * skills re-enter as short mixed sets on an SM-2-style schedule.
 *
 * Chosen constants (documented deviations from stock SM-2):
 * - ease starts at 2.5, floor 1.3 (stock), sanity ceiling 3.2; rounded to 4
 *   decimals to avoid float drift across many updates.
 * - q >= 3: interval 1 -> 6 -> round(prev * ease'), ease' = updated ease.
 * - q < 3: repetitions restart and the item is due again after 1 day
 *   (FAIL_INTERVAL_DAYS) — stock SM-2 restarts without stating the day; we
 *   pick 1 so a failed review reappears in the next session.
 *
 * qualityFromOutcome maps our drill outcome to the 0-5 quality: clean fast
 * correct (no hint, within SCT) = 5, correct without hint = 4, correct with
 * hint = 3, incorrect/skipped = 2.
 */

export const SM2 = {
  INITIAL_EASE: 2.5,
  MIN_EASE: 1.3,
  MAX_EASE: 3.2,
  FIRST_INTERVAL_DAYS: 1,
  SECOND_INTERVAL_DAYS: 6,
  FAIL_INTERVAL_DAYS: 1,
  EASE_ROUND: 4,
} as const;

export type Sm2State = {
  ease: number;
  intervalDays: number;
  reps: number;
  /** null = not scheduled yet. */
  dueAt: Date | null;
};

export const INITIAL_SM2_STATE: Sm2State = {
  ease: SM2.INITIAL_EASE,
  intervalDays: 0,
  reps: 0,
  dueAt: null,
};

export type ReviewOutcome = {
  correct: boolean;
  /** The child solved it through a pictorial hint. */
  usedHint: boolean;
  /** Within the set's SCT (undefined = untimed CPA context). */
  withinSct?: boolean;
};

export function qualityFromOutcome(outcome: ReviewOutcome): 2 | 3 | 4 | 5 {
  if (!outcome.correct) return 2;
  if (outcome.usedHint) return 3;
  return outcome.withinSct === false ? 4 : 5;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS);
}

function roundEase(ease: number): number {
  const clamped = Math.min(SM2.MAX_EASE, Math.max(SM2.MIN_EASE, ease));
  const f = 10 ** SM2.EASE_ROUND;
  return Math.round(clamped * f) / f;
}

/**
 * One SM-2 update. Pure given (state, quality, now): same inputs, same
 * outputs — `now` is a parameter, not a clock read, so scheduling is testable
 * and replayable.
 */
export function sm2Update(
  prev: Sm2State,
  quality: number,
  now: Date = new Date(),
): Sm2State {
  if (!Number.isInteger(quality) || quality < 0 || quality > 5) {
    throw new Error("sm2Update: quality must be an integer in [0, 5]");
  }
  const q = quality;
  const easeDelta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
  const ease = roundEase(prev.ease + easeDelta);

  if (q < 3) {
    return {
      ease,
      intervalDays: SM2.FAIL_INTERVAL_DAYS,
      reps: 0,
      dueAt: addDays(now, SM2.FAIL_INTERVAL_DAYS),
    };
  }

  const reps = prev.reps + 1;
  const intervalDays =
    reps === 1
      ? SM2.FIRST_INTERVAL_DAYS
      : reps === 2
        ? SM2.SECOND_INTERVAL_DAYS
        : Math.max(1, Math.round(prev.intervalDays * ease));
  return { ease, intervalDays, reps, dueAt: addDays(now, intervalDays) };
}

/** Convenience: map a review outcome to quality and apply it. */
export function sm2Review(
  prev: Sm2State,
  outcome: ReviewOutcome,
  now: Date = new Date(),
): Sm2State {
  return sm2Update(prev, qualityFromOutcome(outcome), now);
}
