/**
 * Mastery gates with the no-dead-end rules (plan section 3.1 step 5).
 *
 * Constants (all in one place, "to calibrate in Phase 1"):
 * - advance:      accuracy >= 95% AND within SCT
 * - over-target ladder (accurate = 80-94% but over SCT): after 2 consecutive
 *   over-target passes the SCT target tightens by ~10% (compounding:
 *   target = base * 0.9^cycles); beating the tightened target twice advances;
 *   three tightened cycles passing without advance promote with a fluency flag
 * - below 80%:    drop into untimed CPA-hint mode; at the bottom step there is
 *   nowhere to drop, so the child stays there with easier generator parameters
 * - CPA mode:     two clean (all-correct, untimed) passes exit back to timed
 *
 * State model: the ladder state is a plain value the caller folds over the
 * (child, skill, step) attempt history (see foldGateHistory). Nothing here
 * needs persistence beyond the GateDecision payloads the schema already
 * stores; decisions carry the two contract counters for chaining/debug.
 *
 * Purity: no clock, no randomness, no I/O. `withinSct` must be computed by the
 * caller against the set's SCT *as generated* (i.e. including any tightening
 * already applied via tightenedSctSeconds).
 */

import type { GateAction, GateDecision } from "./types";

export const GATES = {
  /** Accuracy that advances immediately when within SCT. */
  ADVANCE_ACCURACY: 0.95,
  /** Minimum accuracy counted as an "accurate" pass (80%). */
  ACCURATE_ACCURACY: 0.8,
  /** Each tightening multiplies the SCT target by this (~10% tighter). */
  TIGHTEN_FACTOR: 0.9,
  /** Consecutive over-target passes that trigger one tightening. */
  OVER_TARGET_PASSES_TO_TIGHTEN: 2,
  /** After this many tightened cycles without advance: promote with fluency flag. */
  MAX_TIGHTEN_CYCLES: 3,
  /** Consecutive passes within a tightened target that advance. */
  BEATS_TO_ADVANCE: 2,
  /** A CPA-mode pass is clean when every item is correct (untimed, hints open). */
  CLEAN_CPA_ACCURACY: 1,
  /** Consecutive clean passes that exit CPA mode. */
  CLEAN_CPA_PASSES_TO_EXIT: 2,
  /** Float slack for accuracy comparisons (8/10 === 0.8 exact, but be safe). */
  ACCURACY_EPS: 1e-9,
} as const;

/**
 * Fold state for one (child, skill, step). Reset to INITIAL on advance,
 * promote, or any CPA entry/exit — i.e. whenever the child changes rung.
 */
export type GateLadderState = {
  /** Tightenings applied to this step's SCT target so far. */
  tightenCycles: number;
  /** Consecutive accurate-but-over-SCT passes within the current cycle. */
  overTargetStreak: number;
  /** Consecutive accurate-within-(tightened)-target passes. */
  tightenedBeatStreak: number;
  /** Consecutive clean passes in CPA mode. */
  cleanCpaStreak: number;
};

export const INITIAL_GATE_LADDER_STATE: GateLadderState = {
  tightenCycles: 0,
  overTargetStreak: 0,
  tightenedBeatStreak: 0,
  cleanCpaStreak: 0,
};

export type GateOutcome = {
  /** correctCount / total, in [0, 1]. */
  accuracy: number;
  /** Computed against the set's SCT as generated (tightening included). */
  withinSct: boolean;
};

export type GateContext = {
  /** Child currently sits in untimed CPA-hint mode for this skill. */
  cpaMode: boolean;
  /** The child is at the skill's bottom step (no lower step to drop to). */
  atBottomStep: boolean;
};

export type GateStep = {
  decision: GateDecision;
  state: GateLadderState;
};

/**
 * SCT target after `tightenCycles` tightenings: base * 0.9^cycles, rounded to
 * 1 decimal (a tenth of a second is finer than any child feels).
 */
export function tightenedSctSeconds(baseSctSeconds: number, tightenCycles: number): number {
  if (baseSctSeconds < 0) throw new Error("tightenedSctSeconds: negative base");
  const target = baseSctSeconds * GATES.TIGHTEN_FACTOR ** tightenCycles;
  return Math.round(target * 10) / 10;
}

/** One gate decision. Pure: (outcome, context, state) -> (decision, state'). */
export function decideGate(
  outcome: GateOutcome,
  context: GateContext,
  state: GateLadderState = INITIAL_GATE_LADDER_STATE,
): GateStep {
  if (!Number.isFinite(outcome.accuracy)) {
    throw new Error("decideGate: accuracy must be finite");
  }
  if (context.cpaMode) return decideCpa(outcome, state);

  const eps = GATES.ACCURACY_EPS;
  const accurate = outcome.accuracy >= GATES.ACCURATE_ACCURACY - eps;
  const advancing = outcome.accuracy >= GATES.ADVANCE_ACCURACY - eps && outcome.withinSct;

  if (advancing) {
    return step("advance", outcome, RESET, "accuracy >= 95% within SCT; advance to the next step");
  }

  if (accurate) {
    if (outcome.withinSct) {
      if (state.tightenCycles > 0) {
        const beats = state.tightenedBeatStreak + 1;
        if (beats >= GATES.BEATS_TO_ADVANCE) {
          return step(
            "advance",
            outcome,
            RESET,
            "beat the tightened SCT target twice; advance",
          );
        }
        return step(
          "stay",
          outcome,
          { ...state, tightenedBeatStreak: beats, overTargetStreak: 0 },
          `beat the tightened target ${beats} of ${GATES.BEATS_TO_ADVANCE} times; keep going`,
        );
      }
      return step(
        "stay",
        outcome,
        { ...state, overTargetStreak: 0 },
        "accurate and within SCT but below the 95% advance bar; repeat the step with a new variant",
      );
    }

    // Accurate but over SCT: the tighten ladder.
    const streak = state.overTargetStreak + 1;
    const beatsBroken = { ...state, tightenedBeatStreak: 0, overTargetStreak: streak };
    if (streak % GATES.OVER_TARGET_PASSES_TO_TIGHTEN === 0) {
      if (state.tightenCycles < GATES.MAX_TIGHTEN_CYCLES) {
        const cycles = state.tightenCycles + 1;
        return step(
          "tighten",
          outcome,
          { tightenCycles: cycles, overTargetStreak: 0, tightenedBeatStreak: 0, cleanCpaStreak: 0 },
          `${streak} consecutive over-target passes; tighten cycle ${cycles} of ${GATES.MAX_TIGHTEN_CYCLES} (target x${GATES.TIGHTEN_FACTOR})`,
        );
      }
      return step(
        "promote_fluency_flag",
        outcome,
        RESET,
        `${GATES.MAX_TIGHTEN_CYCLES} tightened cycles passed without advance; promote with fluency-focus flag and spaced review`,
      );
    }
    return step(
      "stay",
      outcome,
      beatsBroken,
      streak === 1
        ? "accurate but over SCT; one more over-target pass tightens the target"
        : "accurate but over the tightened target; one more over-target pass triggers the next tighten cycle",
    );
  }

  // Below 80%: drop into CPA-hint mode (or keep sitting in it).
  if (context.atBottomStep) {
    return step(
      "enter_cpa_mode",
      outcome,
      RESET,
      "accuracy below 80% at the bottom step; stay on the bottom step in CPA-hint mode with easier generator parameters until two clean passes",
    );
  }
  return step(
    "enter_cpa_mode",
    outcome,
    RESET,
    "accuracy below 80%; drop one step into untimed CPA-hint mode",
  );
}

function decideCpa(outcome: GateOutcome, state: GateLadderState): GateStep {
  const clean = outcome.accuracy >= GATES.CLEAN_CPA_ACCURACY - GATES.ACCURACY_EPS;
  if (clean) {
    const streak = state.cleanCpaStreak + 1;
    if (streak >= GATES.CLEAN_CPA_PASSES_TO_EXIT) {
      return step(
        "exit_cpa_mode",
        outcome,
        RESET,
        "two clean CPA passes; back to timed sets",
      );
    }
    return step(
      "stay",
      outcome,
      { ...state, cleanCpaStreak: streak },
      `clean CPA pass ${streak} of ${GATES.CLEAN_CPA_PASSES_TO_EXIT}`,
    );
  }
  return step(
    "stay",
    outcome,
    { ...state, cleanCpaStreak: 0 },
    "CPA pass not clean; the timer stays off and hints stay open",
  );
}

const RESET: GateLadderState = INITIAL_GATE_LADDER_STATE;

function step(
  action: GateAction,
  outcome: GateOutcome,
  state: GateLadderState,
  note: string,
): GateStep {
  const detail: GateDecision["detail"] = {
    accuracy: outcome.accuracy,
    withinSct: outcome.withinSct,
    note,
  };
  if (action !== "exit_cpa_mode") {
    detail.consecutiveOverTargetPasses = state.overTargetStreak;
  }
  if (action === "stay" || action === "exit_cpa_mode") {
    detail.consecutiveCleanCpaPasses = state.cleanCpaStreak;
  }
  return { decision: { action, detail }, state };
}

// ---------------------------------------------------------------------------
// History replay
// ---------------------------------------------------------------------------

export type GateHistoryEntry = {
  outcome: GateOutcome;
  context: GateContext;
};

/**
 * Fold a sequence of past outcomes (oldest first) for one (child, skill,
 * step) into the current decision — lets callers rebuild ladder state from
 * stored attempts without any extra persistence.
 */
export function foldGateHistory(
  entries: readonly GateHistoryEntry[],
  initialState: GateLadderState = INITIAL_GATE_LADDER_STATE,
): GateStep {
  let current: GateStep = { decision: emptyDecision(), state: initialState };
  for (const entry of entries) {
    current = decideGate(entry.outcome, entry.context, current.state);
  }
  return current;
}

function emptyDecision(): GateDecision {
  return {
    action: "stay",
    detail: { accuracy: 0, withinSct: false, note: "no attempts yet" },
  };
}
