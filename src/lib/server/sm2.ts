/**
 * SM-2 adapter over the drill engine (src/lib/engine/sm2.ts) for SET-level
 * reviews of "Kuasai" skills (plan 3.1 step 8). The engine owns the schedule
 * math; this module maps a graded review set to an SM-2 quality (gate.ts:
 * qualityForReviewSet) and applies the server-only downgrade rule: a lapsed
 * review (< 80%) drops the skill back to "Lancar" so it re-enters the ladder.
 */

import { INITIAL_SM2_STATE, sm2Update, type Sm2State } from "../engine/sm2";

export type { Sm2State };

export type ReviewSm2Result = {
  state: Sm2State;
  /** True when the review lapsed: the skill re-enters the ladder. */
  downgrade: boolean;
};

/** Update the SM-2 state after one graded review set. */
export function reviewSm2(
  prev: Sm2State,
  quality: 2 | 4 | 5,
  now: Date,
): ReviewSm2Result {
  const state = sm2Update(prev, quality, now);
  return { state, downgrade: quality < 3 };
}

/**
 * Initial schedule when a skill first becomes "Kuasai": apply one clean
 * update so the first review lands tomorrow (interval 1 day).
 */
export function kuasaiInitSm2(now: Date): Sm2State {
  return sm2Update(INITIAL_SM2_STATE, 5, now);
}
