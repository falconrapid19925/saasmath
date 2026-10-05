import { describe, expect, it } from "vitest";

import { decideNextTask, type NextTaskInput, type TaskMastery, type TaskSkill } from "./nexttask";

const NOW = new Date("2026-10-04T10:00:00Z");

const skill = (id: string, orderIndex: number, prereqIds: string[] = []): TaskSkill => ({
  id,
  orderIndex,
  prereqIds,
});

const mastery = (overrides: Partial<TaskMastery> & { skillId: string }): TaskMastery => ({
  state: "Baru",
  step: 1,
  cpaMode: false,
  dueAt: null,
  updatedAt: new Date("2026-10-03T10:00:00Z"),
  ...overrides,
});

const input = (overrides: Partial<NextTaskInput> = {}): NextTaskInput => ({
  now: NOW,
  hasAttemptToday: false,
  skills: [skill("a", 1), skill("b", 2, ["a"]), skill("c", 3, ["b"])],
  masteryRows: [],
  ...overrides,
});

describe("decideNextTask (plan 3.1 step 8: review mixed with progression)", () => {
  it("asks for placement when the child has no mastery rows", () => {
    expect(decideNextTask(input())).toEqual({ kind: "placement_required" });
  });

  it("continues the ladder on the most recently active skill", () => {
    const decision = decideNextTask(
      input({
        masteryRows: [
          mastery({ skillId: "a", state: "Lancar", step: 2, updatedAt: new Date("2026-10-04T08:00:00Z") }),
          mastery({ skillId: "b", state: "Kuasai", dueAt: new Date("2026-10-03T00:00:00Z") }),
        ],
      }),
    );
    expect(decision).toMatchObject({ kind: "progression", skillId: "a", step: 2 });
  });

  it("serves CPA mode for the active skill still in CPA-hint mode", () => {
    const decision = decideNextTask(
      input({ masteryRows: [mastery({ skillId: "a", state: "Baru", step: 1, cpaMode: true })] }),
    );
    expect(decision).toMatchObject({ kind: "cpa", skillId: "a", step: 1 });
  });

  it("prioritizes the most overdue review only after today's progression set", () => {
    const rows = [
      mastery({ skillId: "a", state: "Lancar", step: 2 }),
      mastery({ skillId: "b", state: "Kuasai", dueAt: new Date("2026-10-01T00:00:00Z") }),
      mastery({ skillId: "c", state: "Kuasai", dueAt: new Date("2026-10-02T00:00:00Z") }),
    ];
    // Before any set today: progression.
    expect(
      decideNextTask(input({ masteryRows: rows, hasAttemptToday: false })),
    ).toMatchObject({ kind: "progression", skillId: "a" });
    // After a set today: the most overdue review (b, due 10-01).
    expect(
      decideNextTask(input({ masteryRows: rows, hasAttemptToday: true })),
    ).toMatchObject({ kind: "review", skillId: "b" });
  });

  it("ignores reviews that are not due yet", () => {
    const decision = decideNextTask(
      input({
        masteryRows: [
          mastery({ skillId: "a", state: "Lancar" }),
          mastery({ skillId: "b", state: "Kuasai", dueAt: new Date("2026-10-05T00:00:00Z") }),
        ],
        hasAttemptToday: true,
      }),
    );
    expect(decision).toMatchObject({ kind: "progression", skillId: "a" });
  });

  it("starts the next prerequisite-satisfied skill when the ladder is clear", () => {
    const decision = decideNextTask(
      input({
        masteryRows: [
          mastery({ skillId: "a", state: "Kuasai", dueAt: new Date("2026-10-09T00:00:00Z") }),
        ],
        hasAttemptToday: true,
      }),
    );
    expect(decision).toMatchObject({ kind: "progression", skillId: "b", step: 1 });
  });

  it("never starts a skill whose prerequisites are not mastered", () => {
    const decision = decideNextTask(
      input({
        masteryRows: [
          mastery({ skillId: "a", state: "Lancar", step: 1 }),
        ],
        hasAttemptToday: true,
      }),
    );
    // "b" requires "a" (not Kuasai); "a" itself is active -> progression on a.
    expect(decision).toMatchObject({ kind: "progression", skillId: "a" });

    const blocked = decideNextTask(
      input({
        masteryRows: [
          mastery({ skillId: "a", state: "Kuasai", dueAt: new Date("2026-10-20T00:00:00Z") }),
        ],
      }),
    );
    // No active skill, b blocked (a Kuasai? a IS Kuasai -> b unlocked).
    expect(blocked).toMatchObject({ kind: "progression", skillId: "b", step: 1 });
  });

  it("falls back to a maintenance review when everything is mastered and not due", () => {
    const decision = decideNextTask(
      input({
        skills: [skill("a", 1)],
        masteryRows: [
          mastery({ skillId: "a", state: "Kuasai", dueAt: new Date("2026-10-20T00:00:00Z") }),
        ],
        hasAttemptToday: true,
      }),
    );
    expect(decision).toMatchObject({ kind: "review", skillId: "a" });
  });

  it("ignores mastery rows for skills outside island access", () => {
    const decision = decideNextTask(
      input({
        skills: [skill("a", 1)], // skill "b" locked behind the paywall
        masteryRows: [
          mastery({ skillId: "b", state: "Lancar", step: 2 }),
          mastery({ skillId: "a", state: "Baru", step: 1 }),
        ],
      }),
    );
    expect(decision).toMatchObject({ kind: "progression", skillId: "a" });
  });
});
