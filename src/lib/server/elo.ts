/**
 * Elo adapter over the drill engine (src/lib/engine/elo.ts): one Elo update
 * per answered item, against the engine's provisional per-step difficulty
 * (learned difficulties land in Phase 3 per the plan). Persisted in
 * mastery.eloRating / mastery.eloN.
 */

import {
  INITIAL_ELO,
  provisionalStepDifficulty,
  updateStudentFromSet,
  type EloSide,
} from "../engine/elo";

export type MasteryEloInput = {
  eloRating: number;
  eloN: number;
} | null;

/** Fold one set's grading into the student rating. */
export function masteryEloUpdate(
  current: MasteryEloInput,
  step: number,
  correctFlags: readonly boolean[],
): { eloRating: number; eloN: number } {
  const side: EloSide = current
    ? { rating: current.eloRating, n: current.eloN }
    : INITIAL_ELO;
  const updated = updateStudentFromSet(side, provisionalStepDifficulty(step), correctFlags);
  return { eloRating: updated.rating, eloN: updated.n };
}
