import { describe, expect, it } from "vitest";

import {
  GATES,
  INITIAL_GATE_LADDER_STATE,
  decideGate,
  foldGateHistory,
  tightenedSctSeconds,
} from "./gates";
import type { GateContext, GateLadderState, GateOutcome } from "./gates";

const BASE = INITIAL_GATE_LADDER_STATE;
const TIMED: GateContext = { cpaMode: false, atBottomStep: false };
const BOTTOM: GateContext = { cpaMode: false, atBottomStep: true };
const CPA: GateContext = { cpaMode: true, atBottomStep: false };

function run(
  accuracy: number,
  withinSct: boolean,
  context: GateContext = TIMED,
  state: GateLadderState = BASE,
) {
  const outcome: GateOutcome = { accuracy, withinSct };
  return decideGate(outcome, context, state);
}

describe("timed gate: advance branch", () => {
  it("advances at 100% within SCT", () => {
    const { decision, state } = run(1, true);
    expect(decision.action).toBe("advance");
    expect(state).toEqual(INITIAL_GATE_LADDER_STATE);
  });

  it("advances at exactly 95% within SCT (19/20)", () => {
    const { decision } = run(19 / 20, true);
    expect(decision.action).toBe("advance");
  });

  it("does NOT advance at 95% when over SCT (falls to the tighten ladder)", () => {
    const { decision, state } = run(19 / 20, false);
    expect(decision.action).toBe("stay");
    expect(state.overTargetStreak).toBe(1);
  });

  it("advances regardless of ladder state when 95% within", () => {
    const dirty: GateLadderState = { tightenCycles: 2, overTargetStreak: 3, tightenedBeatStreak: 1, cleanCpaStreak: 1 };
    const { decision, state } = run(0.96, true, TIMED, dirty);
    expect(decision.action).toBe("advance");
    expect(state).toEqual(INITIAL_GATE_LADDER_STATE);
  });
});

describe("timed gate: accurate-but-below-bar, within SCT, never tightened", () => {
  it("stays with a repeat-variant note at 80-94% within base target", () => {
    const { decision, state } = run(0.85, true);
    expect(decision.action).toBe("stay");
    expect(state.overTargetStreak).toBe(0);
    expect(decision.detail.note).toMatch(/95%/);
  });
});

describe("timed gate: the tighten ladder (accurate but over SCT)", () => {
  it("pass 1 over target: stay, streak 1", () => {
    const { decision, state } = run(0.85, false);
    expect(decision.action).toBe("stay");
    expect(state.overTargetStreak).toBe(1);
    expect(decision.detail.consecutiveOverTargetPasses).toBe(1);
    expect(decision.detail.note).toMatch(/one more over-target pass/);
  });

  it("pass 2 over target: tighten cycle 1, streak resets", () => {
    const after1 = run(0.85, false).state;
    const { decision, state } = run(0.85, false, TIMED, after1);
    expect(decision.action).toBe("tighten");
    expect(state.tightenCycles).toBe(1);
    expect(state.overTargetStreak).toBe(0);
  });

  it("pass 3: stay; pass 4: tighten cycle 2; pass 6: tighten cycle 3", () => {
    let state = BASE;
    const actions: string[] = [];
    for (let i = 0; i < 6; i++) {
      const result = run(0.85, false, TIMED, state);
      actions.push(result.decision.action);
      state = result.state;
    }
    expect(actions).toEqual(["stay", "tighten", "stay", "tighten", "stay", "tighten"]);
    expect(state.tightenCycles).toBe(3);
  });

  it("pass 7 stays; pass 8 promotes with the fluency flag and resets", () => {
    let state = BASE;
    for (let i = 0; i < 6; i++) {
      state = run(0.85, false, TIMED, state).state;
    }
    expect(state).toEqual({
      tightenCycles: 3,
      overTargetStreak: 0,
      tightenedBeatStreak: 0,
      cleanCpaStreak: 0,
    });
    const seventh = run(0.85, false, TIMED, state);
    expect(seventh.decision.action).toBe("stay");
    expect(seventh.state.overTargetStreak).toBe(1);
    const eighth = run(0.85, false, TIMED, seventh.state);
    expect(eighth.decision.action).toBe("promote_fluency_flag");
    expect(eighth.state).toEqual(INITIAL_GATE_LADDER_STATE);
    expect(eighth.decision.detail.note).toMatch(/fluency/);
  });

  it("an accurate within-pass breaks the over-target streak (consecutive rule)", () => {
    const after1 = run(0.85, false).state;
    const within = run(0.85, true, TIMED, after1);
    expect(within.decision.action).toBe("stay");
    expect(within.state.overTargetStreak).toBe(0);
    // Two more over passes are needed before the first tighten fires.
    const again = run(0.85, false, TIMED, within.state);
    expect(again.decision.action).toBe("stay");
  });
});

describe("timed gate: beating a tightened target", () => {
  const tightened: GateLadderState = { tightenCycles: 1, overTargetStreak: 0, tightenedBeatStreak: 0, cleanCpaStreak: 0 };

  it("first beat: stay (1 of 2), beat streak counted", () => {
    const { decision, state } = run(0.85, true, TIMED, tightened);
    expect(decision.action).toBe("stay");
    expect(state.tightenedBeatStreak).toBe(1);
    expect(decision.detail.note).toMatch(/1 of 2/);
  });

  it("second consecutive beat: advance", () => {
    const after1 = run(0.85, true, TIMED, tightened).state;
    const { decision } = run(0.85, true, TIMED, after1);
    expect(decision.action).toBe("advance");
  });

  it("an over-target pass between beats resets the beat streak", () => {
    const after1 = run(0.85, true, TIMED, tightened).state;
    const over = run(0.85, false, TIMED, after1);
    expect(over.state.tightenedBeatStreak).toBe(0);
    expect(over.state.overTargetStreak).toBe(1);
    const beat = run(0.85, true, TIMED, over.state);
    expect(beat.decision.action).toBe("stay"); // beat streak starts over at 1
    expect(beat.state.tightenedBeatStreak).toBe(1);
  });
});

describe("timed gate: below 80% enters CPA mode, no dead end at the bottom", () => {
  it("enter_cpa_mode with a drop note", () => {
    const { decision, state } = run(0.5, false);
    expect(decision.action).toBe("enter_cpa_mode");
    expect(state).toEqual(INITIAL_GATE_LADDER_STATE);
    expect(decision.detail.note).toMatch(/drop one step/);
  });

  it("at the bottom step: stays in CPA mode on the bottom with easier params", () => {
    const { decision } = run(0.5, false, BOTTOM);
    expect(decision.action).toBe("enter_cpa_mode");
    expect(decision.detail.note).toMatch(/bottom step/);
  });

  it("accuracy exactly 0.8 is 'accurate' (over-target ladder), 0.7999 is not", () => {
    expect(run(0.8, false).decision.detail.consecutiveOverTargetPasses).toBe(1);
    expect(run(0.7999, false).decision.action).toBe("enter_cpa_mode");
    expect(run(8 / 10, false).decision.detail.consecutiveOverTargetPasses).toBe(1);
  });
});

describe("CPA mode (untimed): two clean passes exit", () => {
  it("withinSct is ignored in CPA mode", () => {
    const { decision } = run(1, false, CPA);
    expect(decision.action).toBe("stay");
    expect(decision.detail.consecutiveCleanCpaPasses).toBe(1);
  });

  it("clean pass 1 stays; clean pass 2 exits and resets the ladder", () => {
    const first = run(1, false, CPA);
    expect(first.decision.action).toBe("stay");
    const second = run(1, true, CPA, first.state);
    expect(second.decision.action).toBe("exit_cpa_mode");
    expect(second.state).toEqual(INITIAL_GATE_LADDER_STATE);
  });

  it("a non-clean pass resets the clean streak (0.95 is not clean)", () => {
    const first = run(1, false, CPA);
    const broken = run(0.95, false, CPA, first.state);
    expect(broken.decision.action).toBe("stay");
    expect(broken.state.cleanCpaStreak).toBe(0);
    expect(broken.decision.detail.consecutiveCleanCpaPasses).toBe(0);
  });

  it("below 80% while already in CPA mode keeps sitting with hints open", () => {
    const { decision, state } = run(0.3, false, CPA);
    expect(decision.action).toBe("stay");
    expect(state.cleanCpaStreak).toBe(0);
  });
});

describe("tightenedSctSeconds", () => {
  it("compounds the ~10% tightening and rounds to a tenth of a second", () => {
    expect(tightenedSctSeconds(60, 0)).toBe(60);
    expect(tightenedSctSeconds(60, 1)).toBe(54);
    expect(tightenedSctSeconds(60, 2)).toBe(48.6);
    expect(tightenedSctSeconds(60, 3)).toBe(43.7);
    expect(tightenedSctSeconds(37.3, 1)).toBe(33.6);
  });
});

describe("foldGateHistory replays ladder state from raw attempts", () => {
  it("reproduces the tighten -> beat -> advance arc", () => {
    const entries = [
      { outcome: { accuracy: 0.9, withinSct: false }, context: TIMED },
      { outcome: { accuracy: 0.9, withinSct: false }, context: TIMED },
      { outcome: { accuracy: 0.9, withinSct: true }, context: TIMED }, // beat 1
      { outcome: { accuracy: 0.9, withinSct: true }, context: TIMED }, // beat 2
    ];
    const { decision } = foldGateHistory(entries);
    expect(decision.action).toBe("advance");
  });

  it("reproduces the CPA arc: fail -> enter, clean x2 -> exit", () => {
    const entries = [
      { outcome: { accuracy: 0.4, withinSct: false }, context: TIMED },
      { outcome: { accuracy: 1, withinSct: false }, context: CPA },
      { outcome: { accuracy: 1, withinSct: false }, context: CPA },
    ];
    const { decision } = foldGateHistory(entries);
    expect(decision.action).toBe("exit_cpa_mode");
  });

  it("empty history stays put with the initial state", () => {
    const { decision, state } = foldGateHistory([]);
    expect(decision.action).toBe("stay");
    expect(state).toEqual(INITIAL_GATE_LADDER_STATE);
  });
});

describe("gate constants match plan 3.1 step 5", () => {
  it("exposes the documented thresholds", () => {
    expect(GATES.ADVANCE_ACCURACY).toBe(0.95);
    expect(GATES.ACCURATE_ACCURACY).toBe(0.8);
    expect(GATES.TIGHTEN_FACTOR).toBe(0.9);
    expect(GATES.OVER_TARGET_PASSES_TO_TIGHTEN).toBe(2);
    expect(GATES.MAX_TIGHTEN_CYCLES).toBe(3);
    expect(GATES.BEATS_TO_ADVANCE).toBe(2);
    expect(GATES.CLEAN_CPA_PASSES_TO_EXIT).toBe(2);
  });

  it("rejects a non-finite accuracy", () => {
    expect(() => decideGate({ accuracy: NaN, withinSct: true }, TIMED)).toThrow(/finite/);
  });
});
