import { describe, expect, it } from "vitest";

import { aggregateWeek, starCalendar, sumStars, type SummaryAttempt } from "./summary";

const attempt = (overrides: Partial<SummaryAttempt>): SummaryAttempt => ({
  attemptId: "a1",
  skillId: "k4-mult",
  correctCount: 9,
  total: 10,
  timeMs: 100_000,
  sctSeconds: 120,
  createdAt: new Date("2026-10-04T09:00:00Z"),
  ...overrides,
});

describe("aggregateWeek (dashboard + digest facts)", () => {
  it("averages accuracy, time, and SCT and counts within-SCT sets", () => {
    const week = aggregateWeek(
      [
        attempt({ attemptId: "1", timeMs: 90_000, sctSeconds: 100 }),
        attempt({ attemptId: "2", timeMs: 150_000, sctSeconds: 100, correctCount: 6 }),
      ],
      [{ delta: 15, createdAt: new Date("2026-10-04T09:05:00Z"), }],
    );
    expect(week.setsDone).toBe(2);
    expect(week.avgAccuracy).toBeCloseTo((0.9 + 0.6) / 2);
    expect(week.avgTimeMs).toBeCloseTo(120_000);
    expect(week.avgSctSeconds).toBeCloseTo(100);
    expect(week.withinSctCount).toBe(1); // 90s <= 100s; 150s > 100s
    expect(week.starsWeek).toBe(15);    expect(week.flaggedCount).toBe(0);
  });

  it("excludes implausible attempts from every aggregate but reports them", () => {
    const week = aggregateWeek(
      [
        attempt({ attemptId: "ok", timeMs: 90_000, sctSeconds: 100 }),
        attempt({ attemptId: "fake", timeMs: 2_000, correctCount: 10, implausible: true }),
      ],
      [],
    );
    expect(week.setsDone).toBe(1);
    expect(week.avgTimeMs).toBeCloseTo(90_000);
    expect(week.flaggedCount).toBe(1);
    expect(week.activeDays).toHaveLength(1);
  });

  it("collects distinct Jakarta day keys and per-skill breakdowns", () => {
    const week = aggregateWeek(
      [
        attempt({ attemptId: "1", skillId: "k4-mult", createdAt: new Date("2026-10-03T10:00:00Z") }),
        attempt({ attemptId: "2", skillId: "k4-mult", createdAt: new Date("2026-10-03T12:00:00Z") }),
        attempt({ attemptId: "3", skillId: "k4-div", createdAt: new Date("2026-10-04T02:00:00Z") }),
      ],
      [],
    );
    expect(week.activeDays).toEqual(["2026-10-03", "2026-10-04"]); // 02:00Z = 09:00 WIB same day
    expect(week.perSkill).toEqual([
      { skillId: "k4-div", sets: 1, avgAccuracy: 0.9 },
      { skillId: "k4-mult", sets: 2, avgAccuracy: 0.9 },
    ]);
  });

  it("returns nulls for an empty week", () => {
    const week = aggregateWeek([], []);
    expect(week.setsDone).toBe(0);
    expect(week.avgAccuracy).toBeNull();
    expect(week.avgTimeMs).toBeNull();
    expect(week.avgSctSeconds).toBeNull();
    expect(week.starsWeek).toBe(0);
  });
});

describe("starCalendar", () => {
  it("marks the last N days oldest-first against attempt date keys", () => {
    const now = new Date("2026-10-04T10:00:00Z"); // 17:00 WIB
    const calendar = starCalendar(new Set(["2026-10-03", "2026-10-04"]), 3, now);
    expect(calendar).toEqual([
      { date: "2026-10-02", done: false },
      { date: "2026-10-03", done: true },
      { date: "2026-10-04", done: true },
    ]);
  });
});

describe("sumStars", () => {
  it("sums ledger deltas", () => {
    const at = new Date("2026-10-04T09:00:00Z");
    expect(sumStars([{ delta: 10, createdAt: at }, { delta: 15, createdAt: at }, { delta: -20, createdAt: at }])).toBe(5);
  });
});
