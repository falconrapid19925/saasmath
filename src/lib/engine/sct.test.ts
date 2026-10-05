import { describe, expect, it } from "vitest";

import { calibrateSct, computeSct, percentile, SCT } from "./sct";

describe("computeSct (plan 3.1 step 3: base x count x difficulty)", () => {
  it("multiplies the three factors", () => {
    expect(computeSct(30, 10, 1.2)).toBe(360);
    expect(computeSct(12.5, 20, 1)).toBe(250);
    expect(computeSct(0, 10, 1)).toBe(0);
  });

  it("rejects bad inputs", () => {
    expect(() => computeSct(-1, 10, 1)).toThrow(/baseSecondsPerItem/);
    expect(() => computeSct(30, 10.5, 1)).toThrow(/itemCount/);
    expect(() => computeSct(30, 10, NaN)).toThrow(/difficultyFactor/);
  });
});

describe("percentile (linear interpolation)", () => {
  it("matches hand-computed order statistics", () => {
    expect(percentile([1, 2, 3, 4], 0.75)).toBe(3.25);
    expect(percentile([5], 0.75)).toBe(5);
    expect(percentile([1, 2, 3, 4], 0)).toBe(1);
    expect(percentile([1, 2, 3, 4], 1)).toBe(4);
    expect(percentile([10, 1, 5, 3], 0.5)).toBe(4); // sorted [1,3,5,10], rank 1.5
    expect(percentile([7, 7, 7, 7, 7], 0.75)).toBe(7);
  });

  it("rejects empty input and out-of-range p", () => {
    expect(() => percentile([], 0.75)).toThrow(/empty/);
    expect(() => percentile([1], 1.5)).toThrow(/\[0, 1\]/);
  });
});

describe("calibrateSct (recalibrate to the 75th percentile after ~100 attempts)", () => {
  it("keeps the current target below 100 completing attempts", () => {
    const result = calibrateSct({
      completingAttempts: 99,
      passingTimesSeconds: [60, 61, 62],
      currentSctSeconds: 300,
    });
    expect(result).toEqual({ sctSeconds: 300, calibrated: false });
  });

  it("recalibrates to the 75th percentile of passing times at >= 100 attempts", () => {
    // 100 passing attempts, times 40..139 seconds.
    const times = Array.from({ length: 100 }, (_, i) => 40 + i);
    const result = calibrateSct({
      completingAttempts: 100,
      passingTimesSeconds: times,
      currentSctSeconds: 300,
    });
    expect(result.calibrated).toBe(true);
    expect(result.sctSeconds).toBeCloseTo(Math.round(percentile(times, 0.75) * 10) / 10, 5);
  });

  it("rounds the calibrated target to a tenth of a second", () => {
    const times = [10.11, 20.23, 30.37, 40.41];
    const result = calibrateSct({
      completingAttempts: 150,
      passingTimesSeconds: times,
      currentSctSeconds: 999,
    });
    expect(result.calibrated).toBe(true);
    expect(result.sctSeconds).toBe(Math.round(percentile(times, 0.75) * 10) / 10);
  });

  it("keeps the current target when nothing passing exists yet", () => {
    const result = calibrateSct({
      completingAttempts: 500,
      passingTimesSeconds: [],
      currentSctSeconds: 300,
    });
    expect(result).toEqual({ sctSeconds: 300, calibrated: false });
  });

  it("exposes the passing bar so callers pre-filter times consistently", () => {
    expect(SCT.PASSING_ACCURACY).toBe(0.8);
    expect(SCT.CALIBRATION_MIN_ATTEMPTS).toBe(100);
    expect(SCT.CALIBRATION_PERCENTILE).toBe(0.75);
  });
});
