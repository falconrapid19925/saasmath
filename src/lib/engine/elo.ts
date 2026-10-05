/**
 * Per-skill Elo (plan section 6, citing Pelánek): student skill vs item
 * difficulty, with the U(n) = a/(1+bn) uncertainty update — early answers move
 * the estimate a lot, later ones progressively less. Pure functions; the
 * caller persists rating and n (mastery.eloRating / mastery.eloN).
 *
 * Chosen constants, documented:
 * - Ratings live on the usual ~1000 scale; logistic scale 400 (one "class" of
 *   skill difference ~ 400 points swings expected score to ~73%).
 * - Student: U(0) = 64 with b = 0.05 -> K after 10 answers ~ 42.7, after 50
 *   ~ 18.3, after 100 ~ 10.7. A first-answer surprise moves the rating ~64
 *   points, settled skills move ~10-20 points per answer.
 * - Item/step difficulty moves slower (many answers per item): U(0) = 16,
 *   b = 0.02 -> ~14 after 10 answers, ~8 after 50. Until per-step difficulty
 *   rows exist (schema has none; the plan puts item-difficulty learning at
 *   Phase 3), use provisionalStepDifficulty().
 */

import { GATES } from "./gates";

export const ELO = {
  INITIAL_RATING: 1000,
  /** Logistic scale in rating points. */
  SCALE: 400,
  /** Student uncertainty U(n) = A / (1 + B*n). */
  STUDENT_A: 64,
  STUDENT_B: 0.05,
  /** Item/step difficulty uncertainty: slower, many answers per item. */
  ITEM_A: 16,
  ITEM_B: 0.02,
  /** Sanity clamps so a broken feed cannot run away. */
  MIN_RATING: 100,
  MAX_RATING: 3000,
  /** Provisional per-step difficulty bump until difficulties are learned. */
  STEP_DIFFICULTY_PER_STEP: 40,
} as const;

export type EloSide = {
  rating: number;
  /** Number of updates already applied to this side. */
  n: number;
};

export const INITIAL_ELO: EloSide = { rating: ELO.INITIAL_RATING, n: 0 };

/** Expected score of the STUDENT against an item of the given difficulty. */
export function expectedScore(studentRating: number, itemDifficulty: number): number {
  return 1 / (1 + Math.exp((itemDifficulty - studentRating) / ELO.SCALE));
}

/** U(n) = a / (1 + b*n); the plan's uncertainty schedule. */
export function uncertainty(n: number, a: number, b: number): number {
  if (n < 0) throw new Error("uncertainty: n must be >= 0");
  return a / (1 + b * n);
}

function clampRating(rating: number): number {
  return Math.min(ELO.MAX_RATING, Math.max(ELO.MIN_RATING, rating));
}

/** Update the STUDENT side after one answer (uses the pre-update n). */
export function updateStudent(side: EloSide, itemDifficulty: number, correct: boolean): EloSide {
  const p = expectedScore(side.rating, itemDifficulty);
  const k = uncertainty(side.n, ELO.STUDENT_A, ELO.STUDENT_B);
  return {
    rating: clampRating(side.rating + k * ((correct ? 1 : 0) - p)),
    n: side.n + 1,
  };
}

/** Update the ITEM/STEP difficulty side after one answer (opposite sign). */
export function updateItem(side: EloSide, studentRating: number, correct: boolean): EloSide {
  const p = expectedScore(studentRating, side.rating);
  const k = uncertainty(side.n, ELO.ITEM_A, ELO.ITEM_B);
  return {
    rating: clampRating(side.rating + k * ((correct ? 0 : 1) - p)),
    n: side.n + 1,
  };
}

/**
 * Stand-in item difficulty per 1-based step until learned difficulties exist:
 * 1000, 1040, 1080, ... (ELO.STEP_DIFFICULTY_PER_STEP per step).
 */
export function provisionalStepDifficulty(step: number): number {
  if (!Number.isInteger(step) || step < 1) {
    throw new Error("provisionalStepDifficulty: step must be a 1-based integer");
  }
  return ELO.INITIAL_RATING + (step - 1) * ELO.STEP_DIFFICULTY_PER_STEP;
}

/**
 * Convenience for the drill loop: update the student side from a graded set,
 * folding one Elo update per item at the given difficulty.
 */
export function updateStudentFromSet(
  side: EloSide,
  itemDifficulty: number,
  correctFlags: readonly boolean[],
): EloSide {
  let current = side;
  for (const correct of correctFlags) {
    current = updateStudent(current, itemDifficulty, correct);
  }
  return current;
}

/** Re-export so callers compute "passing" consistently with the gates. */
export { GATES };
