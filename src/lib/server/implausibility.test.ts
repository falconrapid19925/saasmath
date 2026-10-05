import { describe, expect, it } from "vitest";

import {
  coefficientOfVariation,
  flagImplausible,
  MIN_PLAUSIBLE_MS_PER_ITEM,
  PERFECT_RUN_MIN,
  type AttemptFact,
} from "./implausibility";

const fact = (correctCount: number, total: number, timeMs: number): AttemptFact => ({
  correctCount,
  total,
  timeMs,
});

describe("flagImplausible — superhuman speed (plan section 6)", () => {
  it("flags attempts answered faster than a human can respond", () => {
    // 10 items in 2 seconds -> 200 ms/item, below the 300 ms/item floor.
    const flag = flagImplausible(fact(10, 10, 2_000), []);
    expect(flag).toBe("superhuman_speed");
  });

  it("accepts attempts at or above the plausible floor", () => {
    const timeMs = 10 * MIN_PLAUSIBLE_MS_PER_ITEM;
    expect(flagImplausible(fact(10, 10, timeMs), [])).toBeNull();
  });

  it("property check: the floor scales with item count", () => {
    for (let total = 1; total <= 30; total++) {
      const justTooFast = total * MIN_PLAUSIBLE_MS_PER_ITEM - 1;
      const justPlausible = total * MIN_PLAUSIBLE_MS_PER_ITEM;
      expect(flagImplausible(fact(total, total, justTooFast), [])).toBe("superhuman_speed");
      expect(flagImplausible(fact(total, total, justPlausible), [])).toBeNull();
    }
  });
});

describe("flagImplausible — uniform perfect patterns (plan section 6)", () => {
  it("flags a metronomic run of perfect attempts on the same skill", () => {
    const run = Array.from({ length: PERFECT_RUN_MIN - 1 }, () => fact(10, 10, 60_000));
    expect(flagImplausible(fact(10, 10, 60_100), run)).toBe("uniform_perfect");
  });

  it("does not flag perfect attempts with natural timing variance", () => {
    const run = [fact(10, 10, 45_000), fact(10, 10, 70_000), fact(10, 10, 58_000)];
    expect(flagImplausible(fact(10, 10, 61_000), run)).toBeNull();
  });

  it("does not flag when the run breaks on a non-perfect attempt", () => {
    const run = [fact(8, 10, 60_000), fact(10, 10, 60_000), fact(10, 10, 60_000)];
    expect(flagImplausible(fact(10, 10, 60_100), run)).toBeNull();
  });

  it("does not flag a short run", () => {
    const run = [fact(10, 10, 60_000), fact(10, 10, 60_500)];
    expect(flagImplausible(fact(10, 10, 60_200), run)).toBeNull();
  });

  it("history is read newest-first: a break anywhere in the run stops it", () => {
    // history[0] is the most recent; a mistake two back still allows a run of
    // three, which stays below PERFECT_RUN_MIN.
    const run = [fact(10, 10, 60_000), fact(7, 10, 60_000), fact(10, 10, 60_000)];
    expect(flagImplausible(fact(10, 10, 60_050), run)).toBeNull();
  });
});

describe("coefficientOfVariation", () => {
  it("is 0 for constant samples and grows with spread", () => {
    expect(coefficientOfVariation([5, 5, 5])).toBe(0);
    expect(coefficientOfVariation([4.9, 5, 5.1])).toBeLessThan(0.15);
    expect(coefficientOfVariation([1, 5, 9])).toBeGreaterThan(0.5);
  });
});
