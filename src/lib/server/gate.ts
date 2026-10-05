/**
 * Server-side gate adapter over the drill engine's mastery gates
 * (src/lib/engine/gates.ts). The engine owns the rules; this module owns the
 * server concerns:
 *
 * - Rebuilding the tighten/CPA ladder state from stored attempts (the engine's
 *   foldGateHistory, applied to the current episode). An "episode" is the
 *   trailing run of attempts back to — excluding — the last decision that
 *   RESETS the ladder (advance, promote_fluency_flag, enter_cpa_mode,
 *   exit_cpa_mode). Because CPA entry/exit reset the episode, every attempt
 *   inside an episode ran under the mode the child is in now, so folding with
 *   the current cpaMode is exact.
 * - Mapping the engine's decision to the mastery mutations (step delta,
 *   completion, CPA enter/exit, fluency flag) applied in attempts.ts.
 * - The review gate for "Kuasai" skills (plan 3.1 step 8): SM-2 quality
 *   mapping, plus the lapse rule that drops a skill back to "Lancar".
 */

import {
  GATES,
  decideGate as engineDecideGate,
  foldGateHistory,
  type GateContext,
  type GateHistoryEntry,
  type GateLadderState,
} from "../engine/gates";
import type { GateDecision } from "../engine/types";

export { GATES };

/** Actions after which the ladder state restarts from INITIAL. */
const RESET_ACTIONS: ReadonlySet<GateDecision["action"]> = new Set([
  "advance",
  "promote_fluency_flag",
  "enter_cpa_mode",
  "exit_cpa_mode",
]);

/** Stored per-attempt facts needed to replay the ladder. */
export type AttemptFactRow = {
  correctCount: number;
  total: number;
  timeMs: number;
  sctSeconds: number;
  gateResult: GateDecision;
};

export type AttemptSummary = {
  /** correctCount / total. */
  accuracy: number;
  /** timeMs <= served sctSeconds * 1000 for that attempt. */
  withinSct: boolean;
};

/**
 * Rebuild the ladder state as of just before the current attempt, by folding
 * the current episode (see module doc) through the engine.
 */
export function episodeState(
  historyRowsNewestFirst: AttemptFactRow[],
  cpaMode: boolean,
  atBottomStep: boolean,
): GateLadderState {
  const episode: GateHistoryEntry[] = [];
  for (const row of historyRowsNewestFirst) {
    if (RESET_ACTIONS.has(row.gateResult.action)) break;
    episode.push({
      outcome: summaryOf(row),
      context: { cpaMode, atBottomStep },
    });
  }
  // foldGateHistory wants oldest first.
  return foldGateHistory(episode.reverse()).state;
}

export function summaryOf(row: {
  correctCount: number;
  total: number;
  timeMs: number;
  sctSeconds: number;
}): AttemptSummary {
  return {
    accuracy: row.total > 0 ? row.correctCount / row.total : 0,
    withinSct: row.timeMs <= row.sctSeconds * 1000,
  };
}

export type GateMutation = {
  /** Apply to mastery.step: +1 (advance/promote), -1 (CPA drop), 0 (else). */
  stepDelta: number;
  /** Final step passed the last step: skill complete -> "Kuasai" + SM-2. */
  complete: boolean;
  cpaEnter: boolean;
  cpaExit: boolean;
  /** null = leave the flag as-is; true = set fluency-focus flag. */
  fluencyFlag: boolean | null;
};

/** Run the engine gate for the current attempt and map to mutations. */
export function decideGate(input: {
  correctCount: number;
  total: number;
  withinSct: boolean;
  cpaMode: boolean;
  step: number;
  stepCount: number;
  stateBefore: GateLadderState;
}): { decision: GateDecision; mutation: GateMutation } {
  if (input.total <= 0) throw new Error("decideGate: total must be > 0");

  const context: GateContext = {
    cpaMode: input.cpaMode,
    atBottomStep: input.step <= 1,
  };
  const step = engineDecideGate(
    { accuracy: input.correctCount / input.total, withinSct: input.withinSct },
    context,
    input.stateBefore,
  );

  const complete = input.step + 1 > input.stepCount;
  const mutation: GateMutation = (() => {
    switch (step.decision.action) {
      case "advance":
        return { stepDelta: 1, complete, cpaEnter: false, cpaExit: false, fluencyFlag: null };
      case "promote_fluency_flag":
        return { stepDelta: 1, complete, cpaEnter: false, cpaExit: false, fluencyFlag: true };
      case "enter_cpa_mode":
        return {
          stepDelta: input.step > 1 ? -1 : 0,
          complete: false,
          cpaEnter: true,
          cpaExit: false,
          fluencyFlag: null,
        };
      case "exit_cpa_mode":
        return { stepDelta: 0, complete: false, cpaEnter: false, cpaExit: true, fluencyFlag: null };
      default:
        return { stepDelta: 0, complete: false, cpaEnter: false, cpaExit: false, fluencyFlag: null };
    }
  })();

  return { decision: step.decision, mutation };
}

// ---------------------------------------------------------------------------
// Review gate (Kuasai skills, plan 3.1 step 8)
// ---------------------------------------------------------------------------

export type ReviewQuality = 2 | 4 | 5;

/**
 * Set-level SM-2 quality for a review set, in the spirit of the engine's
 * per-item qualityFromOutcome: < 80% is a lapse (2); 80-95% is correct-but-
 * not-clean (4); >= 95% within SCT is clean (5), over SCT (4).
 */
export function qualityForReviewSet(accuracy: number, withinSct: boolean): ReviewQuality {
  if (accuracy < GATES.ACCURATE_ACCURACY) return 2;
  if (accuracy < GATES.ADVANCE_ACCURACY) return 4;
  return withinSct ? 5 : 4;
}

/** Review gate decision + SM-2 quality (the ladder does not apply). */
export function decideReviewGate(input: {
  correctCount: number;
  total: number;
  timeMs: number;
  sctSeconds: number;
}): { decision: GateDecision; quality: ReviewQuality } {
  const accuracy = input.correctCount / input.total;
  const withinSct = input.timeMs <= input.sctSeconds * 1000;
  const quality = qualityForReviewSet(accuracy, withinSct);

  const note =
    quality === 2
      ? `Review lapsed (${(accuracy * 100).toFixed(1)}%); downgrading to Lancar and back into the ladder.`
      : quality === 4
        ? `Review passed but below ${(GATES.ADVANCE_ACCURACY * 100).toFixed(0)}% or over SCT; keeping Kuasai on the SM-2 schedule.`
        : `Review passed (${(accuracy * 100).toFixed(1)}% within SCT); SM-2 interval grows.`;

  return {
    decision: {
      action: "stay",
      detail: { accuracy, withinSct, note },
    },
    quality,
  };
}
