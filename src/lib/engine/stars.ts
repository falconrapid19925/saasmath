/**
 * Star rewards for one completed set (plan 4.2: effort currency, tune in
 * Phase 1). The single source of the award rule: the server pipeline
 * (src/lib/server/attempts.ts) awards by it and the drill player's result
 * screen predicts by it, so the predicted "+N ⭐ (perkiraan)" always matches
 * what the server records. Pure — no db, importable from both tiers.
 */

/** Stars per completed set. */
export const STARS_PER_SET = 10;
/** Bonus for beating the SCT with 95%+ accuracy. */
export const STARS_SCT_BONUS = 5;

/**
 * Stars awarded for one set: the base for finishing, plus the SCT bonus when
 * the set is clean (accuracy >= 95%) AND within the served SCT. There is no
 * timed-mode special case: untimed CPA sets record timeMs 0, so the served
 * SCT is trivially met and a clean CPA set earns the bonus like any other.
 */
export function starsForSet(accuracy: number, withinSct: boolean): number {
  return STARS_PER_SET + (accuracy >= 0.95 && withinSct ? STARS_SCT_BONUS : 0);
}
