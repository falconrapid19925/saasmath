/**
 * SCT adapter over the drill engine (src/lib/engine/sct.ts + gates.ts):
 * base = engine computeSct with a documented per-step difficulty factor;
 * recalibration = engine calibrateSct (75th percentile of passing attempts
 * once a skill has 100+ completing attempts); tightening = engine
 * tightenedSctSeconds driven by the gate ladder state.
 */

import { tightenedSctSeconds } from "../engine/gates";
import { calibrateSct, computeSct } from "../engine/sct";

/** Each difficulty step beyond the first adds 10% time (server policy). */
export const SCT_STEP_FACTOR = 0.1;

export function difficultyFactorForStep(step: number): number {
  return 1 + SCT_STEP_FACTOR * (step - 1);
}

/** Author-estimate base SCT for a generated set (before calibration/tightening). */
export function baseSctSeconds(
  skill: { baseSctSecondsPerItem: number },
  step: number,
  itemCount: number,
): number {
  return computeSct(skill.baseSctSecondsPerItem, itemCount, difficultyFactorForStep(step));
}

export type SctCalibrationSample = {
  /** Total completing attempts for the skill (all accuracies). */
  completingAttempts: number;
  /** Completion times in SECONDS of passing attempts (accuracy >= 80%). */
  passingTimesSeconds: number[];
};

/**
 * The SCT actually served for a set: engine-calibrated value when enough
 * data exists (else the author estimate), tightened by the gate ladder.
 */
export function servedSctSeconds(input: {
  skill: { baseSctSecondsPerItem: number };
  step: number;
  itemCount: number;
  tightenCycles: number;
  calibration?: SctCalibrationSample | null;
}): number {
  const base = baseSctSeconds(input.skill, input.step, input.itemCount);
  const effective = input.calibration
    ? calibrateSct({
        completingAttempts: input.calibration.completingAttempts,
        passingTimesSeconds: input.calibration.passingTimesSeconds,
        currentSctSeconds: base,
      }).sctSeconds
    : base;
  return tightenedSctSeconds(effective, input.tightenCycles);
}
