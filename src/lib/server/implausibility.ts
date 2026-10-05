/**
 * Implausibility flagging for synced attempts (plan section 6): on sync, the
 * server re-computes streaks/mastery from the queued attempts and flags
 * statistically implausible results — superhuman speed or uniform perfect
 * patterns — before they reach the parent dashboard.
 *
 * The flag is a pure function of the attempt and its same-skill history, and
 * attempts persist everything needed (correctCount, total, timeMs), so the
 * parent summary recomputes flags at read time instead of storing a column.
 * This keeps flags consistent with the current detection rules and needs no
 * schema change; if persistence is wanted later, an additive
 * attempts.review_flag text column is the documented upgrade.
 */

/** A human cannot reliably answer a drill item faster than this. */
export const MIN_PLAUSIBLE_MS_PER_ITEM = 300;

/** Perfect attempts in a row (this one included) before the pattern check. */
export const PERFECT_RUN_MIN = 4;

/** Coefficient of variation of completion times below = metronomic timing. */
export const TIMING_CV_MAX = 0.15;

export type ReviewFlag = "superhuman_speed" | "uniform_perfect";

export type AttemptFact = {
  correctCount: number;
  total: number;
  /** Completion time in milliseconds. */
  timeMs: number;
};

/** Coefficient of variation (stdev/mean) of a sample; 0 for constant input. */
export function coefficientOfVariation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean === 0) return 0;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

/**
 * Flag one attempt. `sameSkillHistory` holds the child's prior attempts on
 * the SAME skill, NEWEST FIRST (history[0] = attempt immediately before).
 * Returns the first matching flag, or null when plausible.
 */
export function flagImplausible(
  attempt: AttemptFact,
  sameSkillHistory: AttemptFact[],
): ReviewFlag | null {
  // 1. Superhuman speed: answered faster than a human can read+respond.
  if (attempt.total > 0 && attempt.timeMs < attempt.total * MIN_PLAUSIBLE_MS_PER_ITEM) {
    return "superhuman_speed";
  }

  // 2. Uniform perfect pattern: a run of perfect attempts with metronomic
  //    timing — statistically implausible for a child doing varied drills.
  if (attempt.total > 0 && attempt.correctCount === attempt.total) {
    const runTimes = [attempt.timeMs];
    for (const prior of sameSkillHistory) {
      if (runTimes.length >= PERFECT_RUN_MIN) break;
      if (prior.total > 0 && prior.correctCount === prior.total) {
        runTimes.push(prior.timeMs);
      } else {
        break;
      }
    }
    if (
      runTimes.length >= PERFECT_RUN_MIN &&
      coefficientOfVariation(runTimes) < TIMING_CV_MAX
    ) {
      return "uniform_perfect";
    }
  }

  return null;
}
