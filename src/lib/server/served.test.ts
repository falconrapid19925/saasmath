/**
 * Seam tests for the served-task record (./served): one row per task handed
 * out by /api/session/next, consumable exactly once by the write path.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { servedTasks } from "../../db/schema";
import { makeDb, seedChild } from "./test-db";
import { claimServedTask, findUnconsumedServedTask, recordServedTask } from "./served";

const MATCH = { skillId: "free-skill", step: 1, seed: 42 };

describe("served tasks", () => {
  let handle: ReturnType<typeof makeDb>;

  beforeEach(() => {
    handle = makeDb();
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  it("records a task and finds it unconsumed for its child only", async () => {
    const { db } = handle;
    await seedChild(db, "child-s1", null);

    recordServedTask(db, {
      childId: "child-s1",
      skillId: "free-skill",
      step: 1,
      seed: 42,
      kind: "progression",
      sctSeconds: 32,
    });

    const served = findUnconsumedServedTask(db, "child-s1", MATCH);
    expect(served?.kind).toBe("progression");
    expect(served?.sctSeconds).toBe(32);
    expect(served?.consumedAt).toBeNull();
    // Another child's submission never matches this row.
    expect(findUnconsumedServedTask(db, "child-other", MATCH)).toBeNull();
  });

  it("claims a task exactly once: the second claim finds nothing", async () => {
    const { db } = handle;
    await seedChild(db, "child-s2", null);

    recordServedTask(db, {
      childId: "child-s2",
      skillId: "free-skill",
      step: 1,
      seed: 42,
      kind: "review",
      sctSeconds: 32,
    });
    const consumedAt = new Date("2026-10-05T01:00:00Z");

    const claimed = claimServedTask(db, "child-s2", MATCH, consumedAt);
    expect(claimed?.kind).toBe("review");
    expect(findUnconsumedServedTask(db, "child-s2", MATCH)).toBeNull();
    expect(claimServedTask(db, "child-s2", MATCH, consumedAt)).toBeNull();
  });

  it("serves the oldest matching task first when several are unconsumed", async () => {
    const { db } = handle;
    await seedChild(db, "child-s3", null);

    // recordServedTask defaults servedAt to now(); an explicitly older row
    // models a task served earlier that was never submitted.
    await db.insert(servedTasks).values({
      id: "older",
      childId: "child-s3",
      skillId: "free-skill",
      step: 1,
      seed: 42,
      kind: "progression",
      sctSeconds: 32,
      servedAt: new Date(0),
    });
    recordServedTask(db, {
      childId: "child-s3",
      skillId: "free-skill",
      step: 1,
      seed: 42,
      kind: "progression",
      sctSeconds: 32,
    });

    const claimed = claimServedTask(db, "child-s3", MATCH, new Date());
    expect(claimed?.id).toBe("older");
  });
});
