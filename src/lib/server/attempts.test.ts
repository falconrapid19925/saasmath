/**
 * Seam tests for the shared attempt pipeline (processAttempt — the public
 * seam behind /api/session/submit AND /api/sync) on the in-memory SQLite
 * harness from ./test-db: write-path island gating, duplicate rejection,
 * SCT calibration scope, and the mastery/streak/star side effects.
 */

import { asc, eq } from "drizzle-orm";
import { dayKeyJakarta } from "../../lib/dates";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  attempts,
  children,
  mastery,
  starsLedger,
  streaks,
} from "../../db/schema";
import { HttpError } from "./http";
import { generateSetItems, loadSkill } from "./engine";
import {
  clampCompletedAt,
  COMPLETED_AT_FUTURE_TOLERANCE_MS,
  COMPLETED_AT_PAST_WINDOW_MS,
  processAttempt,
  sctCalibrationSample,
  STARS_PER_SET,
  STARS_SCT_BONUS,
  type SubmitAttemptInput,
} from "./attempts";
import { servedTasks } from "../../db/schema";
import {
  makeDb,
  seedChild,
  seedTwoStepFreeSkill,
  serveTask,
} from "./test-db";

function inputFor(skillId: string): SubmitAttemptInput {
  return {
    skillId,
    step: 1,
    seed: 42,
    answers: [null, null, null, null], // matches itemCount: 4
    timeMs: 5000,
  };
}

describe("processAttempt write-path island gating (smoke-test regression)", () => {
  let handle: ReturnType<typeof makeDb>;

  beforeEach(() => {
    handle = makeDb();
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  it("403s a free child submitting a paywalled skill directly and writes nothing", async () => {
    const { db } = handle;
    await seedChild(db, "child-1", { plan: "free", status: "active" });

    await expect(
      processAttempt(db, "child-1", inputFor("paid-skill")),
    ).rejects.toMatchObject({ name: "HttpError", status: 403 } satisfies Partial<HttpError>);

    expect((await db.select().from(attempts)).length).toBe(0);
    expect((await db.select().from(starsLedger)).length).toBe(0);
    expect((await db.select().from(mastery)).length).toBe(0);
    expect((await db.select().from(streaks)).length).toBe(0);
    const child = (await db.select().from(children).where(eq(children.id, "child-1")))[0]!;
    expect(child.starsBalance).toBe(0);
  });

  it("403s a pending (unpaid) subscription on a paywalled skill", async () => {
    const { db } = handle;
    await seedChild(db, "child-2", { plan: "bulanan", status: "pending" });

    await expect(
      processAttempt(db, "child-2", inputFor("paid-skill")),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("still accepts a free-island skill for a free child (stars, attempt, mastery)", async () => {
    const { db } = handle;
    await seedChild(db, "child-3", { plan: "free", status: "active" });
    serveTask(db, "child-3", "free-skill");

    const result = await processAttempt(db, "child-3", inputFor("free-skill"));

    expect(result.attemptId).toBeTruthy();
    expect(result.starsAwarded).toBe(STARS_PER_SET);
    expect((await db.select().from(attempts)).length).toBe(1);
    const child = (await db.select().from(children).where(eq(children.id, "child-3")))[0]!;
    expect(child.starsBalance).toBe(STARS_PER_SET);
    const ledger = await db
      .select()
      .from(starsLedger)
      .orderBy(asc(starsLedger.createdAt));
    expect(ledger.length).toBe(1);
    expect(ledger[0]!.delta).toBe(STARS_PER_SET);
  });

  it("accepts a paywalled skill once the subscription is active", async () => {
    const { db } = handle;
    await seedChild(db, "child-4", { plan: "bulanan", status: "active" });
    serveTask(db, "child-4", "paid-skill");

    const result = await processAttempt(db, "child-4", inputFor("paid-skill"));

    expect(result.attemptId).toBeTruthy();
    expect((await db.select().from(attempts)).length).toBe(1);
  });
});

describe("processAttempt duplicate rejection (attempts unique index backstop)", () => {
  let handle: ReturnType<typeof makeDb>;

  beforeEach(() => {
    handle = makeDb();
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  it("409s an exact double submit with one attempt row and one star credit", async () => {
    const { db } = handle;
    await seedChild(db, "child-dup-1", { plan: "free", status: "active" });
    serveTask(db, "child-dup-1", "free-skill");

    const first = await processAttempt(db, "child-dup-1", inputFor("free-skill"));
    expect(first.attemptId).toBeTruthy();

    await expect(
      processAttempt(db, "child-dup-1", inputFor("free-skill")),
    ).rejects.toMatchObject({ name: "HttpError", status: 409 } satisfies Partial<HttpError>);

    expect((await db.select().from(attempts)).length).toBe(1);
    expect((await db.select().from(starsLedger)).length).toBe(1);
    const child = (await db.select().from(children).where(eq(children.id, "child-dup-1")))[0]!;
    expect(child.starsBalance).toBe(STARS_PER_SET);
  });

  it("409s a replay with the same (child, skill, seed, timeMs) but doctored answers", async () => {
    const { db } = handle;
    await seedChild(db, "child-dup-2", { plan: "free", status: "active" });
    // Two unconsumed served rows for the same seed (a 2^-32 double-serve, or
    // any future caller that records a task twice) so the replay's served-task
    // claim succeeds and the UNIQUE index on attempts(child_id, skill_id,
    // seed, time_ms) is what backstops the second insert.
    serveTask(db, "child-dup-2", "free-skill");
    serveTask(db, "child-dup-2", "free-skill");

    const first = await processAttempt(db, "child-dup-2", inputFor("free-skill"));
    expect(first.attemptId).toBeTruthy();

    // Same unique key (child, skill, seed, timeMs), different answer payload.
    const doctored: SubmitAttemptInput = {
      ...inputFor("free-skill"),
      answers: [
        { kind: "integer", value: 1 },
        { kind: "integer", value: 2 },
        { kind: "integer", value: 3 },
        { kind: "integer", value: 4 },
      ],
    };
    await expect(
      processAttempt(db, "child-dup-2", doctored),
    ).rejects.toMatchObject({ name: "HttpError", status: 409 } satisfies Partial<HttpError>);

    expect((await db.select().from(attempts)).length).toBe(1);
    expect((await db.select().from(starsLedger)).length).toBe(1);
  });
});

describe("processAttempt served-task binding", () => {
  let handle: ReturnType<typeof makeDb>;

  beforeEach(() => {
    handle = makeDb();
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  it("409s a submission matching no unconsumed served task and writes nothing", async () => {
    const { db } = handle;
    await seedChild(db, "child-bind-1", { plan: "free", status: "active" });
    // No serveTask call: the client picked (skillId, step, seed) itself.

    await expect(
      processAttempt(db, "child-bind-1", inputFor("free-skill")),
    ).rejects.toMatchObject({ name: "HttpError", status: 409 } satisfies Partial<HttpError>);

    expect((await db.select().from(attempts)).length).toBe(0);
    expect((await db.select().from(starsLedger)).length).toBe(0);
    expect((await db.select().from(mastery)).length).toBe(0);
    expect((await db.select().from(streaks)).length).toBe(0);
  });

  it("grades by the served kind: a served review runs SM-2 even when mastery says Lancar", async () => {
    const { db } = handle;
    await seedChild(db, "child-bind-2", { plan: "free", status: "active" });
    await db.insert(mastery).values({
      childId: "child-bind-2",
      skillId: "free-skill",
      state: "Lancar",
      step: 1,
      updatedAt: new Date(),
    });
    serveTask(db, "child-bind-2", "free-skill", { kind: "review" });

    // A truthful submission: correct answers for the regenerated set.
    const skill = await loadSkill(db, "free-skill");
    const items = generateSetItems(skill, 1, 42);
    const completedAt = new Date("2026-10-05T01:00:00Z");
    const result = await processAttempt(db, "child-bind-2", {
      ...inputFor("free-skill"),
      answers: items.map((item) => item.answer),
      completedAt,
    });

    expect(result.mode).toBe("review");
    const row = (
      await db
        .select()
        .from(mastery)
        .where(eq(mastery.childId, "child-bind-2"))
    )[0]!;
    // SM-2 first clean rep: the review schedule advanced, the ladder did not.
    expect(row.state).toBe("Lancar");
    expect(row.reps).toBe(1);
    expect(row.dueAt?.getTime()).toBe(completedAt.getTime() + 24 * 60 * 60 * 1000);
  });

  it("409s a replay of an already-consumed served task with different answers/time", async () => {
    const { db } = handle;
    await seedChild(db, "child-bind-3", { plan: "free", status: "active" });
    serveTask(db, "child-bind-3", "free-skill");

    const first = await processAttempt(db, "child-bind-3", inputFor("free-skill"));
    expect(first.attemptId).toBeTruthy();

    // Same served task, different play time: not an attempts-row duplicate
    // (different timeMs), so only the consumed served task rejects it.
    await expect(
      processAttempt(db, "child-bind-3", { ...inputFor("free-skill"), timeMs: 6000 }),
    ).rejects.toMatchObject({ name: "HttpError", status: 409 } satisfies Partial<HttpError>);

    expect((await db.select().from(attempts)).length).toBe(1);
    expect((await db.select().from(starsLedger)).length).toBe(1);
  });
});

describe("processAttempt anti-farm bounds (completedAt window, timeMs, star cap, bonus)", () => {
  let handle: ReturnType<typeof makeDb>;

  beforeEach(() => {
    handle = makeDb();
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  it("clamps completedAt to a 7-day past / 5-minute future window", () => {
    const now = new Date("2026-10-05T09:00:00Z");
    // Ten days old: clamped to the window edge, not the claimed time.
    expect(clampCompletedAt(new Date("2026-09-25T09:00:00Z"), now).getTime()).toBe(
      now.getTime() - COMPLETED_AT_PAST_WINDOW_MS,
    );
    // Ten minutes ahead: clamped to the tolerance.
    expect(clampCompletedAt(new Date("2026-10-05T09:10:00Z"), now).getTime()).toBe(
      now.getTime() + COMPLETED_AT_FUTURE_TOLERANCE_MS,
    );
    // Inside the window: untouched.
    expect(clampCompletedAt(new Date("2026-10-03T09:00:00Z"), now).toISOString()).toBe(
      "2026-10-03T09:00:00.000Z",
    );
  });

  it("rejects timeMs 0 on a timed (non-CPA) served task with 400", async () => {
    const { db } = handle;
    await seedChild(db, "child-farm-1", { plan: "free", status: "active" });
    serveTask(db, "child-farm-1", "free-skill", { kind: "progression" });

    await expect(
      processAttempt(db, "child-farm-1", { ...inputFor("free-skill"), timeMs: 0 }),
    ).rejects.toMatchObject({ name: "HttpError", status: 400 } satisfies Partial<HttpError>);
    expect((await db.select().from(attempts)).length).toBe(0);
  });

  it("still accepts timeMs 0 on an untimed CPA served task", async () => {
    const { db } = handle;
    await seedChild(db, "child-farm-2", { plan: "free", status: "active" });
    serveTask(db, "child-farm-2", "free-skill", { kind: "cpa" });

    const result = await processAttempt(db, "child-farm-2", {
      ...inputFor("free-skill"),
      timeMs: 0,
    });

    expect(result.mode).toBe("cpa");
    expect((await db.select().from(attempts)).length).toBe(1);
  });

  it("withholds the SCT bonus from an implausible (superhuman) set", async () => {
    const { db } = handle;
    await seedChild(db, "child-farm-3", { plan: "free", status: "active" });
    serveTask(db, "child-farm-3", "free-skill");
    const skill = await loadSkill(db, "free-skill");
    const items = generateSetItems(skill, 1, 42);

    // 4 correct answers in 500 ms: 125 ms/item is below the 300 ms/item a
    // human needs — flagged superhuman_speed, so the +5 SCT bonus is withheld.
    const result = await processAttempt(db, "child-farm-3", {
      ...inputFor("free-skill"),
      answers: items.map((item) => item.answer),
      timeMs: 500,
    });

    expect(result.implausible).not.toBeNull();
    expect(result.starsAwarded).toBe(STARS_PER_SET);
  });

  it("still pays the SCT bonus for a plausible clean set", async () => {
    const { db } = handle;
    await seedChild(db, "child-farm-4", { plan: "free", status: "active" });
    serveTask(db, "child-farm-4", "free-skill");
    const skill = await loadSkill(db, "free-skill");
    const items = generateSetItems(skill, 1, 42);

    const result = await processAttempt(db, "child-farm-4", {
      ...inputFor("free-skill"),
      answers: items.map((item) => item.answer),
      timeMs: 6000,
    });

    expect(result.implausible).toBeNull();
    expect(result.starsAwarded).toBe(STARS_PER_SET + STARS_SCT_BONUS);
  });

  it("caps daily_set stars per child per Jakarta day", async () => {
    const { db } = handle;
    await seedChild(db, "child-cap-full", { plan: "free", status: "active" });
    await seedChild(db, "child-cap-partial", { plan: "free", status: "active" });
    const now = new Date();
    // Policy: the cap is 45 = three maximum-award sets (10 + 5 bonus each).
    await db.insert(starsLedger).values([
      { childId: "child-cap-full", delta: 15, reason: "daily_set", createdAt: now },
      { childId: "child-cap-full", delta: 15, reason: "daily_set", createdAt: now },
      { childId: "child-cap-full", delta: 15, reason: "daily_set", createdAt: now },
      { childId: "child-cap-partial", delta: 40, reason: "daily_set", createdAt: now },
    ]);
    serveTask(db, "child-cap-full", "free-skill");
    serveTask(db, "child-cap-partial", "free-skill");

    const full = await processAttempt(db, "child-cap-full", inputFor("free-skill"));
    const partial = await processAttempt(db, "child-cap-partial", inputFor("free-skill"));

    expect(full.starsAwarded).toBe(0);
    expect(partial.starsAwarded).toBe(5); // 45 - 40 already credited today
  });

  it("credits a legitimately backdated offline attempt to its completion day", async () => {
    const { db } = handle;
    await seedChild(db, "child-farm-5", { plan: "free", status: "active" });
    // Served a bit over a day ago, completed ~26h ago (still inside the
    // 7-day window), synced now: the streak must land on the completion day.
    const servedAt = new Date(Date.now() - 30 * 60 * 60 * 1000);
    const completedAt = new Date(Date.now() - 26 * 60 * 60 * 1000);
    await db.insert(servedTasks).values({
      childId: "child-farm-5",
      skillId: "free-skill",
      step: 1,
      seed: 42,
      kind: "progression",
      sctSeconds: 32,
      servedAt,
    });

    await processAttempt(db, "child-farm-5", { ...inputFor("free-skill"), completedAt });

    const row = (await db.select().from(streaks))[0]!;
    expect(row.lastCompletedDate).toBe(dayKeyJakarta(completedAt));
  });

  it("does not credit a backdated claim from before the task was served", async () => {
    const { db } = handle;
    await seedChild(db, "child-farm-6", { plan: "free", status: "active" });
    serveTask(db, "child-farm-6", "free-skill"); // served now
    const claimed = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    const result = await processAttempt(db, "child-farm-6", {
      ...inputFor("free-skill"),
      completedAt: claimed,
    });

    // Attribution is floored at the served time: the streak lands today, not
    // three days ago, so fresh served rows cannot farm past-day streaks.
    const row = (await db.select().from(streaks))[0]!;
    expect(row.lastCompletedDate).toBe(dayKeyJakarta(new Date()));
    expect(row.current).toBe(1);
    expect(result.streak.lastCompletedDate).toBe(row.lastCompletedDate);
  });
});

describe("processAttempt mastery ladder (plan 3.1: mastery before advancing)", () => {
  let handle: ReturnType<typeof makeDb>;

  beforeEach(() => {
    handle = makeDb();
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  it("advances the ladder on a clean set: step +1 and Baru -> Lancar", async () => {
    const { db } = handle;
    await seedChild(db, "child-ladder-1", { plan: "free", status: "active" });
    await seedTwoStepFreeSkill(db);
    serveTask(db, "child-ladder-1", "free-two-step", { step: 1, seed: 42 });
    const skill = await loadSkill(db, "free-two-step");
    const items = generateSetItems(skill, 1, 42);

    const result = await processAttempt(db, "child-ladder-1", {
      skillId: "free-two-step",
      step: 1,
      seed: 42,
      answers: items.map((item) => item.answer),
      timeMs: 6000,
    });

    expect(result.gate.action).toBe("advance");
    expect(result.masteryAfter).toMatchObject({ skillId: "free-two-step", state: "Lancar", step: 2 });
    const row = (
      await db.select().from(mastery).where(eq(mastery.childId, "child-ladder-1"))
    )[0]!;
    expect(row.step).toBe(2);
    expect(row.state).toBe("Lancar");
  });

  it("completes the skill on the final step: Kuasai with an SM-2 due date", async () => {
    const { db } = handle;
    await seedChild(db, "child-ladder-2", { plan: "free", status: "active" });
    await seedTwoStepFreeSkill(db);
    const skill = await loadSkill(db, "free-two-step");
    const completedAt = new Date("2026-10-05T01:00:00Z");

    // Step 1 first: the advance is what puts the child on step 2.
    serveTask(db, "child-ladder-2", "free-two-step", { step: 1, seed: 42 });
    const step1 = generateSetItems(skill, 1, 42);
    await processAttempt(db, "child-ladder-2", {
      skillId: "free-two-step",
      step: 1,
      seed: 42,
      answers: step1.map((item) => item.answer),
      timeMs: 6000,
      completedAt,
    });

    serveTask(db, "child-ladder-2", "free-two-step", { step: 2, seed: 43 });
    const step2 = generateSetItems(skill, 2, 43);
    const result = await processAttempt(db, "child-ladder-2", {
      skillId: "free-two-step",
      step: 2,
      seed: 43,
      answers: step2.map((item) => item.answer),
      timeMs: 6000,
      completedAt,
    });

    expect(result.gate.action).toBe("advance");
    expect(result.masteryAfter.state).toBe("Kuasai");
    const row = (
      await db.select().from(mastery).where(eq(mastery.childId, "child-ladder-2"))
    )[0]!;
    expect(row.state).toBe("Kuasai");
    // First SM-2 rep after mastering: due one day later (plan 3.1 step 8).
    expect(row.reps).toBe(1);
    expect(row.dueAt?.getTime()).toBe(completedAt.getTime() + 24 * 60 * 60 * 1000);
  });

  it("downgrades a lapsed review to Lancar and clears the SM-2 schedule", async () => {
    const { db } = handle;
    await seedChild(db, "child-ladder-3", { plan: "free", status: "active" });
    await seedTwoStepFreeSkill(db);
    await db.insert(mastery).values({
      childId: "child-ladder-3",
      skillId: "free-two-step",
      state: "Kuasai",
      step: 2,
      ease: 2.5,
      intervalDays: 1,
      reps: 1,
      dueAt: new Date("2026-10-01T00:00:00Z"),
      updatedAt: new Date(),
    });
    serveTask(db, "child-ladder-3", "free-two-step", { step: 2, seed: 43, kind: "review" });

    // All-skipped review: accuracy 0 < 80% is a lapse (quality 2).
    const result = await processAttempt(db, "child-ladder-3", {
      skillId: "free-two-step",
      step: 2,
      seed: 43,
      answers: [null, null, null, null],
      timeMs: 6000,
    });

    expect(result.mode).toBe("review");
    expect(result.masteryAfter.state).toBe("Lancar");
    const row = (
      await db.select().from(mastery).where(eq(mastery.childId, "child-ladder-3"))
    )[0]!;
    expect(row.state).toBe("Lancar");
    expect(row.dueAt).toBeNull(); // back on the ladder, off the SM-2 schedule
  });
});

describe("sctCalibrationSample is per-skill, not per-child (plan 3.1 step 3)", () => {
  it("counts attempts and passing times from ALL children of the skill", async () => {
    const handle2 = makeDb();
    try {
      const { db } = handle2;
      await seedChild(db, "child-a", { plan: "free", status: "active" });
      await seedChild(db, "child-b", { plan: "free", status: "active" });

      const attemptRow = (childId: string, i: number, correct: number) => ({
        childId,
        skillId: "free-skill",
        step: 1,
        seed: i,
        items: [],
        answers: [],
        correctCount: correct,
        total: 4,
        timeMs: 30000,
        sctSeconds: 32,
        gateResult: {
          action: "stay" as const,
          detail: { accuracy: correct / 4, withinSct: true, note: "t" },
        },
      });

      // 100 attempts by child-a and 5 by child-b: the skill population is 105.
      for (let i = 0; i < 100; i++) {
        await db.insert(attempts).values(attemptRow("child-a", i, 4));
      }
      for (let i = 0; i < 5; i++) {
        await db.insert(attempts).values(attemptRow("child-b", 1000 + i, 4));
      }

      const sample = await sctCalibrationSample(db, "free-skill");
      expect(sample.completingAttempts).toBe(105); // per-child scope would see 100 (or 5)
      expect(sample.passingTimesSeconds.length).toBe(100); // newest-100 window across children
    } finally {
      handle2.sqlite.close();
    }
  });
});
