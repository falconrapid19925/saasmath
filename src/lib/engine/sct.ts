/**
 * Standard Completion Time (plan section 3.1 step 3).
 *
 * SCT(set) = base seconds per item x item count x difficulty factor. The base
 * starts as the content author's estimate (skills.baseSctSecondsPerItem); once
 * a skill has >= 100 completing attempts the target recalibrates to the 75th
 * percentile of completion time among passing attempts (accuracy >= 80%).
 * Pure math only — the caller reads attempts and passes the numbers in.
 */

export const SCT = {
  /** Completing attempts needed before recalibration kicks in (plan: ~100). */
  CALIBRATION_MIN_ATTEMPTS: 100,
  /** Recalibrate to this percentile of passing completion times. */
  CALIBRATION_PERCENTILE: 0.75,
  /** "Passing" for calibration purposes = the gate's accurate bar. */
  PASSING_ACCURACY: 0.8,
} as const;

export function computeSct(
  baseSecondsPerItem: number,
  itemCount: number,
  difficultyFactor: number,
): number {
  for (const [name, v] of [
    ["baseSecondsPerItem", baseSecondsPerItem],
    ["itemCount", itemCount],
    ["difficultyFactor", difficultyFactor],
  ] as const) {
    if (typeof v !== "number" || Number.isNaN(v) || v < 0 || (name === "itemCount" && !Number.isInteger(v))) {
      throw new Error(`computeSct: ${name} must be a non-negative ${name === "itemCount" ? "integer" : "number"}`);
    }
  }
  return baseSecondsPerItem * itemCount * difficultyFactor;
}

/**
 * Linear-interpolation percentile (the standard "type 7" / numpy default):
 * rank = p * (n - 1), interpolating between adjacent order statistics.
 * Returns NaN-free values; throws on empty input.
 */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) throw new Error("percentile: empty input");
  if (p < 0 || p > 1) throw new Error("percentile: p must be in [0, 1]");
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0] as number;
  const rank = p * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower] as number;
  const weight = rank - lower;
  return (sorted[lower] as number) * (1 - weight) + (sorted[upper] as number) * weight;
}

export type CalibrationInput = {
  /** Total completing (submitted, fully answered) attempts for the skill. */
  completingAttempts: number;
  /** Completion times in SECONDS of passing attempts (accuracy >= 80%). */
  passingTimesSeconds: readonly number[];
  /** Current target (author estimate or previous calibration). */
  currentSctSeconds: number;
};

export type CalibrationResult = {
  sctSeconds: number;
  calibrated: boolean;
};

/**
 * Recalibrate to the 75th percentile of passing completion times once the
 * skill has >= 100 completing attempts; below that (or with no passing times
 * yet) the current target is kept unchanged.
 */
export function calibrateSct(input: CalibrationInput): CalibrationResult {
  const { completingAttempts, passingTimesSeconds, currentSctSeconds } = input;
  if (
    !Number.isInteger(completingAttempts) ||
    completingAttempts < 0 ||
    !Number.isFinite(currentSctSeconds) ||
    currentSctSeconds <= 0
  ) {
    throw new Error("calibrateSct: bad input");
  }
  if (
    completingAttempts < SCT.CALIBRATION_MIN_ATTEMPTS ||
    passingTimesSeconds.length === 0
  ) {
    return { sctSeconds: currentSctSeconds, calibrated: false };
  }
  const target = percentile(passingTimesSeconds, SCT.CALIBRATION_PERCENTILE);
  return { sctSeconds: Math.round(target * 10) / 10, calibrated: true };
}
