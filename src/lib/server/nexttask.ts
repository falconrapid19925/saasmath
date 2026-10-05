/**
 * The next-task decision — the server's core job (plan sections 3.1 and 6):
 * "the server decides the next task, skill plus step plus seed". This module
 * is the pure decision core; the route (src/app/api/session/next) loads the
 * child's data, filters it for island access, and passes it in.
 *
 * Mixing rule (plan 3.1 step 8 — due review "mixed with" ladder progression):
 * the day's FIRST session is always ladder progression (the daily Kumon set);
 * once a progression set is done today, a due SM-2 review takes priority.
 * With no active ladder skill, due reviews come first, then the next
 * prerequisite-satisfied skill.
 */

export type TaskSkill = {
  id: string;
  orderIndex: number;
  prereqIds: string[];
};

export type TaskMastery = {
  skillId: string;
  state: "Baru" | "Lancar" | "Kuasai";
  step: number;
  cpaMode: boolean;
  /** SM-2 due date for Kuasai skills; null = never scheduled. */
  dueAt: Date | null;
  /** Order for "most recently worked on" tie-breaks. */
  updatedAt: Date;
};

export type NextTaskInput = {
  now: Date;
  /** True when the child already completed a progression set today. */
  hasAttemptToday: boolean;
  /** Island-accessible skills for the child's grade, orderIndex order. */
  skills: TaskSkill[];
  masteryRows: TaskMastery[];
};

export type NextTaskDecision =
  | { kind: "placement_required" }
  | {
      kind: "progression" | "review" | "cpa";
      skillId: string;
      step: number;
      /** Developer-facing English reason for the decision detail. */
      reason: string;
    };

function isDue(row: TaskMastery, now: Date): boolean {
  return row.state === "Kuasai" && row.dueAt !== null && row.dueAt.getTime() <= now.getTime();
}

export function decideNextTask(input: NextTaskInput): NextTaskDecision {
  const byId = new Map(input.skills.map((s) => [s.id, s]));
  // Mastery rows only count when their skill is visible (island filter).
  const rows = input.masteryRows.filter((row) => byId.has(row.skillId));

  if (rows.length === 0) {
    return { kind: "placement_required" };
  }

  const due = rows
    .filter((row) => isDue(row, input.now))
    .sort((a, b) => (a.dueAt as Date).getTime() - (b.dueAt as Date).getTime());

  const active = rows
    .filter((row) => row.state === "Baru" || row.state === "Lancar")
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];

  // Daily progression first; due review kicks in after today's set is done.
  if (active) {
    if (due.length > 0 && input.hasAttemptToday) {
      const review = due[0] as TaskMastery;
      return {
        kind: "review",
        skillId: review.skillId,
        step: review.step,
        reason: "Daily progression set already done; serving the most overdue SM-2 review.",
      };
    }
    return active.cpaMode
      ? {
          kind: "cpa",
          skillId: active.skillId,
          step: active.step,
          reason: "Continuing untimed CPA-hint mode on the active skill.",
        }
      : {
          kind: "progression",
          skillId: active.skillId,
          step: active.step,
          reason: "Continuing the ladder on the most recently active skill.",
        };
  }

  // No active skill: due review, else the next prerequisite-satisfied skill.
  if (due.length > 0) {
    const review = due[0] as TaskMastery;
    return {
      kind: "review",
      skillId: review.skillId,
      step: review.step,
      reason: "No active ladder skill; serving the most overdue SM-2 review.",
    };
  }

  const mastered = new Set(rows.filter((r) => r.state === "Kuasai").map((r) => r.skillId));
  const startedIds = new Set(rows.map((r) => r.skillId));
  const next = input.skills.find(
    (skill) =>
      !startedIds.has(skill.id) &&
      skill.prereqIds.every((prereqId) => mastered.has(prereqId)),
  );

  if (next) {
    return {
      kind: "progression",
      skillId: next.id,
      step: 1,
      reason: "Ladder skill complete; starting the next prerequisite-satisfied skill at step 1.",
    };
  }

  // Everything started or blocked: maintain the most recently mastered skill.
  const fallback =
    rows
      .filter((row) => row.state === "Kuasai")
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0] ?? rows[0]!;
  return {
    kind: "review",
    skillId: fallback.skillId,
    step: fallback.step,
    reason: "No new skill available (blocked prerequisites or ladder complete); maintenance review.",
  };
}
