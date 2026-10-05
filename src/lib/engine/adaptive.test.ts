import { describe, expect, it } from "vitest";

import {
  ELO,
  INITIAL_ELO,
  expectedScore,
  provisionalStepDifficulty,
  uncertainty,
  updateItem,
  updateStudent,
  updateStudentFromSet,
} from "./elo";
import {
  INITIAL_SM2_STATE,
  qualityFromOutcome,
  sm2Review,
  sm2Update,
} from "./sm2";

// ---------------------------------------------------------------------------
// Elo (plan section 6: per-skill Elo with U(n) = a/(1+bn))
// ---------------------------------------------------------------------------

describe("Elo expected score", () => {
  it("is 0.5 at equal ratings", () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5, 12);
  });

  it("increases with student rating and decreases with difficulty", () => {
    expect(expectedScore(1200, 1000)).toBeGreaterThan(expectedScore(1000, 1000));
    expect(expectedScore(1000, 1200)).toBeLessThan(expectedScore(1000, 1000));
    expect(expectedScore(1400, 1000)).toBeCloseTo(1 / (1 + Math.exp(-1)), 10);
  });

  it("stays in (0, 1) at extremes", () => {
    expect(expectedScore(3000, 100)).toBeGreaterThan(0);
    expect(expectedScore(3000, 100)).toBeLessThan(1);
    expect(expectedScore(100, 3000)).toBeGreaterThan(0);
  });
});

describe("Elo uncertainty U(n) = a/(1+bn)", () => {
  it("starts at A and decays monotonically", () => {
    expect(uncertainty(0, ELO.STUDENT_A, ELO.STUDENT_B)).toBe(ELO.STUDENT_A);
    let last = Infinity;
    for (let n = 0; n <= 200; n += 10) {
      const u = uncertainty(n, ELO.STUDENT_A, ELO.STUDENT_B);
      expect(u).toBeLessThan(last);
      expect(u).toBeGreaterThan(0);
      last = u;
    }
  });

  it("matches the documented schedule values", () => {
    expect(uncertainty(10, ELO.STUDENT_A, ELO.STUDENT_B)).toBeCloseTo(42.7, 1);
    expect(uncertainty(50, ELO.STUDENT_A, ELO.STUDENT_B)).toBeCloseTo(18.3, 1);
    expect(uncertainty(100, ELO.STUDENT_A, ELO.STUDENT_B)).toBeCloseTo(10.7, 1);
  });
});

describe("Elo student update", () => {
  it("moves up on a correct answer at even odds and down on a wrong one", () => {
    const up = updateStudent(INITIAL_ELO, 1000, true);
    const down = updateStudent(INITIAL_ELO, 1000, false);
    expect(up.rating).toBeCloseTo(1000 + ELO.STUDENT_A * 0.5, 10);
    expect(down.rating).toBeCloseTo(1000 - ELO.STUDENT_A * 0.5, 10);
    expect(up.n).toBe(1);
  });

  it("a correct answer against a harder item moves more", () => {
    const easy = updateStudent(INITIAL_ELO, 800, true).rating - 1000;
    const hard = updateStudent(INITIAL_ELO, 1400, true).rating - 1000;
    expect(hard).toBeGreaterThan(easy);
  });

  it("the uncertainty schedule shrinks later updates", () => {
    let side = INITIAL_ELO;
    const first = updateStudent(side, 1400, true).rating - 1000;
    for (let i = 0; i < 50; i++) side = updateStudent(side, 1400, true);
    const perAnswerAt51 = uncertainty(51, ELO.STUDENT_A, ELO.STUDENT_B);
    expect(perAnswerAt51).toBeLessThan(first);
  });

  it("clamps runaway ratings", () => {
    let side = INITIAL_ELO;
    for (let i = 0; i < 500; i++) side = updateStudent(side, 100, true);
    expect(side.rating).toBeLessThanOrEqual(ELO.MAX_RATING);
  });

  it("folding a graded set increments n once per item", () => {
    const side = updateStudentFromSet(INITIAL_ELO, 1000, [true, false, true, true]);
    expect(side.n).toBe(4);
  });
});

describe("Elo item difficulty update", () => {
  it("moves opposite to the student side", () => {
    const item = updateItem(INITIAL_ELO, 1000, false);
    expect(item.rating).toBeGreaterThan(1000); // wrong answer -> item seems harder
    expect(item.n).toBe(1);
    const solved = updateItem(INITIAL_ELO, 1000, true);
    expect(solved.rating).toBeLessThan(1000);
  });
});

describe("provisionalStepDifficulty", () => {
  it("ramps linearly from the initial rating", () => {
    expect(provisionalStepDifficulty(1)).toBe(1000);
    expect(provisionalStepDifficulty(2)).toBe(1040);
    expect(provisionalStepDifficulty(5)).toBe(1160);
    expect(() => provisionalStepDifficulty(0)).toThrow(/1-based/);
  });
});

// ---------------------------------------------------------------------------
// SM-2 (plan sections 3.1 step 8 and 6)
// ---------------------------------------------------------------------------

const NOW = new Date("2026-10-04T09:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

describe("SM-2 update", () => {
  it("q=5: ease +0.1, first interval 1 day, second 6 days, then ease-scaled", () => {
    const s1 = sm2Update(INITIAL_SM2_STATE, 5, NOW);
    expect(s1.ease).toBeCloseTo(2.6, 10);
    expect(s1.intervalDays).toBe(1);
    expect(s1.reps).toBe(1);
    expect(s1.dueAt?.getTime()).toBe(NOW.getTime() + DAY);

    const s2 = sm2Update(s1, 5, NOW);
    expect(s2.ease).toBeCloseTo(2.7, 10);
    expect(s2.intervalDays).toBe(6);

    const s3 = sm2Update(s2, 5, NOW);
    expect(s3.intervalDays).toBe(Math.round(6 * 2.8)); // 17
  });

  it("q=4 leaves ease unchanged (0.1 - 1*0.1 = 0)", () => {
    const s = sm2Update(INITIAL_SM2_STATE, 4, NOW);
    expect(s.ease).toBe(2.5);
  });

  it("a failed review (q<3) restarts repetitions with a 1-day re-drill", () => {
    const grown = sm2Update(sm2Update(INITIAL_SM2_STATE, 5, NOW), 5, NOW);
    const failed = sm2Update(grown, 2, NOW);
    expect(failed.reps).toBe(0);
    expect(failed.intervalDays).toBe(1);
    expect(failed.ease).toBeCloseTo(2.7 - 0.32, 10);
  });

  it("ease never drops below 1.3 and never exceeds the ceiling", () => {
    let s = INITIAL_SM2_STATE;
    for (let i = 0; i < 20; i++) s = sm2Update(s, 0, NOW);
    expect(s.ease).toBe(1.3);
    let up = INITIAL_SM2_STATE;
    for (let i = 0; i < 20; i++) up = sm2Update(up, 5, NOW);
    expect(up.ease).toBeLessThanOrEqual(3.2);
  });

  it("rejects out-of-range quality", () => {
    expect(() => sm2Update(INITIAL_SM2_STATE, 6, NOW)).toThrow(/quality/);
    expect(() => sm2Update(INITIAL_SM2_STATE, 2.5, NOW)).toThrow(/quality/);
  });

  it("is deterministic in (state, quality, now)", () => {
    const a = sm2Update(INITIAL_SM2_STATE, 4, NOW);
    const b = sm2Update(INITIAL_SM2_STATE, 4, NOW);
    expect(a.dueAt?.getTime()).toBe(b.dueAt?.getTime());
    expect(a.ease).toBe(b.ease);
  });
});

describe("qualityFromOutcome mapping", () => {
  it("maps drill outcomes to SM-2 qualities", () => {
    expect(qualityFromOutcome({ correct: true, usedHint: false, withinSct: true })).toBe(5);
    expect(qualityFromOutcome({ correct: true, usedHint: false, withinSct: false })).toBe(4);
    expect(qualityFromOutcome({ correct: true, usedHint: false })).toBe(5); // untimed context
    expect(qualityFromOutcome({ correct: true, usedHint: true, withinSct: true })).toBe(3);
    expect(qualityFromOutcome({ correct: false, usedHint: false, withinSct: true })).toBe(2);
  });

  it("sm2Review chains the mapping into an update", () => {
    const s = sm2Review(INITIAL_SM2_STATE, { correct: false, usedHint: true }, NOW);
    expect(s.reps).toBe(0);
    expect(s.intervalDays).toBe(1);
  });
});
