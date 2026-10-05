import { describe, expect, it } from "vitest";

import type { GateDecision } from "../engine/types";

import {
  decideGate,
  decideReviewGate,
  episodeState,
  qualityForReviewSet,
  type AttemptFactRow,
} from "./gate";

// ---------------------------------------------------------------------------
// episodeState — ladder state replayed from stored attempts (engine folding)
// ---------------------------------------------------------------------------

const row = (
  correct: number,
  total: number,
  timeMs: number,
  sctSeconds: number,
  action: GateDecision["action"] = "stay",
): AttemptFactRow => ({
  correctCount: correct,
  total,
  timeMs,
  sctSeconds,
  gateResult: {
    action,
    detail: { accuracy: correct / total, withinSct: timeMs <= sctSeconds * 1000, note: "" },
  },
});

const over = (action: GateDecision["action"] = "stay") => row(9, 10, 200_000, 120, action);
const beat = () => row(9, 10, 100_000, 120); // accurate within
const clean = () => row(10, 10, 100_000, 120);
const failed = (action: GateDecision["action"] = "stay") => row(5, 10, 200_000, 120, action);

describe("episodeState (server-side ladder replay)", () => {
  it("starts at INITIAL with no history", () => {
    const state = episodeState([], false, false);
    expect(state).toEqual({
      tightenCycles: 0,
      overTargetStreak: 0,
      tightenedBeatStreak: 0,
      cleanCpaStreak: 0,
    });
  });

  it("counts the trailing over-target streak inside the episode", () => {
    const state = episodeState([over(), over(), beat()], false, false);
    // Newest first: [over, over, beat] -> oldest first: beat, over, over.
    // The beat happens within the base target; then two over passes follow,
    // the second of which fires the engine's tighten action (streak resets).
    expect(state.overTargetStreak).toBe(0);
    expect(state.tightenCycles).toBe(1); // two over passes -> one tighten cycle
  });

  it("an advance inside the history resets the episode mid-fold", () => {
    // Newest first: [over, beat, clean]; clean is 10/10 within -> advance ->
    // everything before it restarts from INITIAL.
    const state = episodeState([over(), beat(), clean()], false, false);
    expect(state.tightenCycles).toBe(0);
    expect(state.overTargetStreak).toBe(1); // only the newest over-pass counts
  });

  it("resets at enter_cpa_mode / exit_cpa_mode boundaries", () => {
    const state = episodeState([over(), over()], false, false);
    expect(state.tightenCycles).toBe(1);

    const afterExit = episodeState(
      [over(), row(9, 10, 200_000, 120, "exit_cpa_mode")],
      false,
      false,
    );
    // exit_cpa_mode is the SECOND-newest attempt -> episode stops before it,
    // leaving only the newest over-pass in the episode.
    expect(afterExit.tightenCycles).toBe(0);
    expect(afterExit.overTargetStreak).toBe(1);
  });

  it("folds CPA clean passes when the child is in CPA mode", () => {
    const state = episodeState([clean(), failed()], true, true);
    // Oldest first: failed (not clean -> streak 0), clean (streak 1).
    expect(state.cleanCpaStreak).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// decideGate — mutation mapping over the engine decision
// ---------------------------------------------------------------------------

describe("decideGate (adapter mapping)", () => {
  it("maps advance to +1 step and completion past the last step", () => {
    const mid = decideGate({
      correctCount: 10,
      total: 10,
      withinSct: true,
      cpaMode: false,
      step: 2,
      stepCount: 5,
      stateBefore: episodeState([], false, false),
    });
    expect(mid.decision.action).toBe("advance");
    expect(mid.mutation).toMatchObject({ stepDelta: 1, complete: false });

    const last = decideGate({
      correctCount: 10,
      total: 10,
      withinSct: true,
      cpaMode: false,
      step: 5,
      stepCount: 5,
      stateBefore: episodeState([], false, false),
    });
    expect(last.mutation).toMatchObject({ stepDelta: 1, complete: true });
  });

  it("maps below-80% to a one-step CPA drop, floored at the bottom step", () => {
    const dropped = decideGate({
      correctCount: 5,
      total: 10,
      withinSct: false,
      cpaMode: false,
      step: 3,
      stepCount: 5,
      stateBefore: episodeState([], false, false),
    });
    expect(dropped.decision.action).toBe("enter_cpa_mode");
    expect(dropped.mutation).toMatchObject({ stepDelta: -1, cpaEnter: true });

    const bottom = decideGate({
      correctCount: 5,
      total: 10,
      withinSct: false,
      cpaMode: false,
      step: 1,
      stepCount: 5,
      stateBefore: episodeState([], false, false),
    });
    expect(bottom.mutation).toMatchObject({ stepDelta: 0, cpaEnter: true });
  });

  it("advances after beating a tightened target twice (engine state)", () => {
    const tightened = episodeState([over(), over()], false, false); // 1 cycle
    const firstBeat = decideGate({
      correctCount: 9,
      total: 10,
      withinSct: true,
      cpaMode: false,
      step: 2,
      stepCount: 5,
      stateBefore: tightened,
    });
    expect(firstBeat.decision.action).toBe("stay");

    const secondBeat = decideGate({
      correctCount: 9,
      total: 10,
      withinSct: true,
      cpaMode: false,
      step: 2,
      stepCount: 5,
      stateBefore: { ...tightened, tightenedBeatStreak: 1 },
    });
    expect(secondBeat.decision.action).toBe("advance");
  });

  it("maps CPA exit without a step change", () => {
    const out = decideGate({
      correctCount: 10,
      total: 10,
      withinSct: true,
      cpaMode: true,
      step: 2,
      stepCount: 5,
      stateBefore: { tightenCycles: 0, overTargetStreak: 0, tightenedBeatStreak: 0, cleanCpaStreak: 1 },
    });
    expect(out.decision.action).toBe("exit_cpa_mode");
    expect(out.mutation).toMatchObject({ stepDelta: 0, cpaExit: true });
  });
});

// ---------------------------------------------------------------------------
// Review gate — SM-2 quality for Kuasai skills (plan 3.1 step 8)
// ---------------------------------------------------------------------------

describe("decideReviewGate / qualityForReviewSet", () => {
  it("maps accuracy bands to SM-2 quality", () => {
    expect(qualityForReviewSet(0.5, false)).toBe(2);
    expect(qualityForReviewSet(0.8, true)).toBe(4);
    expect(qualityForReviewSet(0.9, false)).toBe(4);
    expect(qualityForReviewSet(0.96, true)).toBe(5);
    expect(qualityForReviewSet(1, false)).toBe(4); // clean accuracy but over SCT
  });

  it("returns stay decisions with explanatory notes", () => {
    const lapsed = decideReviewGate({ correctCount: 4, total: 10, timeMs: 10_000, sctSeconds: 120 });
    expect(lapsed.decision.action).toBe("stay");
    expect(lapsed.decision.detail.note).toMatch(/lapsed/i);
    expect(lapsed.quality).toBe(2);

    const passed = decideReviewGate({ correctCount: 10, total: 10, timeMs: 60_000, sctSeconds: 120 });
    expect(passed.quality).toBe(5);
    expect(passed.decision.detail.note).toMatch(/interval grows/);
  });
});
