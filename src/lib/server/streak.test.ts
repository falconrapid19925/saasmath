import { describe, expect, it } from "vitest";

import {
  diffCalendarDays,
  jakartaDateString,
  jakartaDayStartUtc,
  updateStreak,
  type StreakState,
} from "./streak";

const state = (overrides: Partial<StreakState> = {}): StreakState => ({
  current: 0,
  best: 0,
  freezesLeft: 2,
  lastCompletedDate: null,
  ...overrides,
});

describe("Jakarta calendar helpers", () => {
  it("formats dates in Asia/Jakarta (UTC+7), not UTC", () => {
    // 2026-10-04T17:30:00Z is 2026-10-05 00:30 in Jakarta (next day).
    expect(jakartaDateString(new Date("2026-10-04T17:30:00Z"))).toBe("2026-10-05");
    expect(jakartaDateString(new Date("2026-10-04T16:59:00Z"))).toBe("2026-10-04");
  });

  it("day start is Jakarta midnight expressed in UTC", () => {
    expect(jakartaDayStartUtc(new Date("2026-10-04T17:30:00Z")).toISOString()).toBe(
      "2026-10-04T17:00:00.000Z",
    );
  });

  it("counts calendar days between date keys", () => {
    expect(diffCalendarDays("2026-10-01", "2026-10-02")).toBe(1);
    expect(diffCalendarDays("2026-10-02", "2026-10-01")).toBe(-1);
    expect(diffCalendarDays("2026-09-30", "2026-10-02")).toBe(2);
    expect(diffCalendarDays("2026-10-01", "2026-10-01")).toBe(0);
  });
});

describe("updateStreak", () => {
  it("starts a streak on the first completion", () => {
    const next = updateStreak(state(), "2026-10-04");
    expect(next.current).toBe(1);
    expect(next.best).toBe(1);
    expect(next.changed).toBe(true);
    expect(next.lastCompletedDate).toBe("2026-10-04");
  });

  it("ignores same-day repeat completions", () => {
    const next = updateStreak(state({ current: 3, best: 5, lastCompletedDate: "2026-10-04" }), "2026-10-04");
    expect(next.changed).toBe(false);
    expect(next.current).toBe(3);
    expect(next.freezesLeft).toBe(2);
  });

  it("treats an out-of-order or backdated completion as a same-day no-op", () => {
    // Offline sync applies attempts in client-given order, so a backdated
    // key can arrive after a newer one — it must neither reset the streak
    // nor regress lastCompletedDate.
    const next = updateStreak(
      state({ current: 3, best: 5, freezesLeft: 2, lastCompletedDate: "2026-10-05" }),
      "2026-10-04",
    );
    expect(next.changed).toBe(false);
    expect(next.current).toBe(3);
    expect(next.best).toBe(5);
    expect(next.freezesLeft).toBe(2);
    expect(next.lastCompletedDate).toBe("2026-10-05");
  });

  it("extends on a consecutive day", () => {
    const next = updateStreak(state({ current: 3, best: 5, lastCompletedDate: "2026-10-04" }), "2026-10-05");
    expect(next.current).toBe(4);
    expect(next.best).toBe(5);
    expect(next.freezeUsed).toBe(false);
  });

  it("absorbs exactly one missed day with a freeze token", () => {
    const next = updateStreak(state({ current: 3, best: 5, freezesLeft: 2, lastCompletedDate: "2026-10-04" }), "2026-10-06");
    expect(next.current).toBe(4);
    expect(next.freezesLeft).toBe(1);
    expect(next.freezeUsed).toBe(true);
  });

  it("resets after a missed day with no freeze left", () => {
    const next = updateStreak(state({ current: 3, best: 5, freezesLeft: 0, lastCompletedDate: "2026-10-04" }), "2026-10-06");
    expect(next.current).toBe(1);
    expect(next.best).toBe(5);
  });

  it("resets after a multi-day gap even with freezes left", () => {
    const next = updateStreak(state({ current: 6, best: 6, freezesLeft: 2, lastCompletedDate: "2026-10-01" }), "2026-10-08");
    expect(next.current).toBe(1);
    expect(next.freezesLeft).toBe(2);
  });

  it("property check: never decreases best, keeps current >= 1", () => {
    const keys = ["2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06", "2026-10-07"];
    let current = state({ freezesLeft: 1 });
    for (const key of keys) {
      current = updateStreak(current, key);
      expect(current.current).toBeGreaterThanOrEqual(1);
      expect(current.best).toBeGreaterThanOrEqual(current.current);
      expect(current.freezesLeft).toBeGreaterThanOrEqual(0);
    }
    // 1, 2, reset(1), 2, 3 — freeze only bridges a single missed day.
    expect(current.current).toBe(3);
  });
});
