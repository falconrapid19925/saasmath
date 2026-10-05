/**
 * The shared attempt pipeline for /api/session/submit and /api/sync (plan
 * sections 3.1 and 6): regenerate the set from (skill, step, seed), re-grade
 * server-side via the engine, compute the SCT delta and the gate decision
 * (engine gates, ladder state replayed from stored attempts), then apply —
 * in one transaction — the consumed served task, the attempt row, mastery
 * (step/state/CPA/fluency/Elo/SM-2), the streak, and stars. Returns the
 * grading detail (the client uses it for in-session self-correction) plus
 * the gate decision.
 *
 * Every submission must match an unconsumed served_tasks row (written by
 * /api/session/next, see ./served) — grading follows the served kind and SCT,
 * duplicates are rejected by the attempts UNIQUE index, and the claim+insert
 * commit atomically. Offline sync reuses the exact same pipeline so
 * server-visible records are identical whether the set was played online or
 * queued in IndexedDB.
 */

import { and, count, desc, eq, gte, lt, sql } from "drizzle-orm";

import type { SaasMathDb } from "@/db";
import {
  attempts,
  children,
  mastery,
  starsLedger,
  streaks,
  type Mastery,
  type Skill,
} from "@/db/schema";
import type { Answer, GradeOutcome, GateDecision } from "../engine/types";
import type { GateLadderState } from "../engine/gates";
import { starsForSet, STARS_PER_SET } from "../engine/stars";

import { formatAnswer, gradeItems } from "./answers";
import { loadIslandAccess } from "./curriculum";
import { generateSetItems, loadSkill, stepParamsFor } from "./engine";
import { masteryEloUpdate } from "./elo";
import {
  decideGate,
  decideReviewGate,
  episodeState,

  type AttemptFactRow,
  type GateMutation,
} from "./gate";
import { HttpError } from "./http";
import { flagImplausible, type ReviewFlag } from "./implausibility";
import { canAccessSkill } from "./island";
import {
  claimServedTask,
  findUnconsumedServedTask,
  type DbLike,
} from "./served";
import { kuasaiInitSm2, reviewSm2 } from "./sm2";
import {
  jakartaDateString,
  jakartaDayStartUtc,
  updateStreak,
  type StreakState,
} from "./streak";

// Star award rule (plan 4.2) lives in the shared engine module
// (src/lib/engine/stars.ts) so the drill player's predicted "+N ⭐" is
// computed by the same function the server awards by.
export { STARS_PER_SET, STARS_SCT_BONUS } from "../engine/stars";

export type SubmitAttemptInput = {
  skillId: string;
  step: number;
  /** Seed the set was generated from (attempts.seed form). */
  seed: number;
  /** Aligned with the regenerated items; null = skipped. */
  answers: (Answer | null)[];
  /** Wall-clock play time in milliseconds (>= 0). */
  timeMs: number;
  /**
   * When the set was completed. "now" for online submits; offline sync passes
   * the client timestamp so streaks attribute the right day. Clamped to the
   * past (at most 5 minutes ahead).
   */
  completedAt?: Date;
};

export type ProcessAttemptResult = {
  attemptId: string;
  mode: "progression" | "cpa" | "review";
  grade: GradeOutcome;
  gate: GateDecision;
  streak: StreakState;
  starsAwarded: number;
  /** Implausibility flag (plan section 6) computed for this attempt. */
  implausible: ReviewFlag | null;
  /** Answer-key lines for self-correction, in item order. */
  answerKey: { itemId: string; index: number; answer: string }[];
  masteryAfter: {
    skillId: string;
    state: Mastery["state"];
    step: number;
    cpaMode: boolean;
    fluencyFlag: boolean;
  };
};

/** Recent same-skill attempts for one child, NEWEST FIRST. */
export async function loadRecentAttemptRows(
  db: SaasMathDb,
  childId: string,
  skillId: string,
  limit: number,
): Promise<AttemptFactRow[]> {
  return db
    .select({
      correctCount: attempts.correctCount,
      total: attempts.total,
      timeMs: attempts.timeMs,
      sctSeconds: attempts.sctSeconds,
      gateResult: attempts.gateResult,
    })
    .from(attempts)
    .where(and(eq(attempts.childId, childId), eq(attempts.skillId, skillId)))
    .orderBy(desc(attempts.createdAt))
    .limit(limit);
}

/**
 * The gate ladder state as of now for a (child, skill), replayed from stored
 * attempts. Used by /api/session/next to know how tight the served SCT
 * should be, and by processAttempt for the decision itself.
 */
export async function loadEpisodeState(
  db: SaasMathDb,
  childId: string,
  skillId: string,
  cpaMode: boolean,
  step: number,
): Promise<GateLadderState> {
  const historyRows = await loadRecentAttemptRows(db, childId, skillId, 20);
  return episodeState(historyRows, cpaMode, step <= 1);
}

/**
 * SCT calibration inputs (plan 3.1 step 3): total completing attempts plus
 * the passing attempts' completion times in seconds (most recent 100).
 * Scoped PER SKILL across all children — the plan's "once a skill has
 * roughly 100 completing attempts" is a property of the skill's population,
 * not of one child (a per-child scope never reaches 100 attempts at 1 set/day
 * and the recalibration would never fire).
 */
export async function sctCalibrationSample(
  db: SaasMathDb,
  skillId: string,
): Promise<{ completingAttempts: number; passingTimesSeconds: number[] }> {
  const totalRows = await db
    .select({ value: count() })
    .from(attempts)
    .where(eq(attempts.skillId, skillId));
  const completingAttempts = Number(totalRows[0]?.value ?? 0);

  const rows = await db
    .select({
      correctCount: attempts.correctCount,
      total: attempts.total,
      timeMs: attempts.timeMs,
    })
    .from(attempts)
    .where(eq(attempts.skillId, skillId))
    .orderBy(desc(attempts.createdAt))
    .limit(100);
  const passingTimesSeconds = rows
    .filter((row) => row.total > 0 && row.correctCount / row.total >= 0.8) // engine "accurate" bar
    .map((row) => row.timeMs / 1000)
    .reverse();

  return { completingAttempts, passingTimesSeconds };
}

/** True when the driver rejected the insert on the attempts unique index. */
function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}

// --- Anti-farm bounds (audit fix: stars and streaks were farmable) --------
// completedAt was clamped only against the future, timeMs 0 earned the SCT
// bonus, and nothing bounded the stars one child could credit per day.

/** How far back a client-claimed completion may be credited (7 days). */
export const COMPLETED_AT_PAST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Clock-skew tolerance for client-claimed completions (5 minutes). */
export const COMPLETED_AT_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
/**
 * daily_set stars one child can earn per Jakarta day: the daily progression
 * set plus up to two clean review sets at the maximum award (3 x 15).
 */
export const DAILY_STARS_CAP = 45;

/** Clamp a client-claimed completion into [now - 7d, now + 5 min]. */
export function clampCompletedAt(date: Date, now: Date = new Date()): Date {
  const min = now.getTime() - COMPLETED_AT_PAST_WINDOW_MS;
  const max = now.getTime() + COMPLETED_AT_FUTURE_TOLERANCE_MS;
  return new Date(Math.min(Math.max(date.getTime(), min), max));
}

/**
 * Process one completed set. Throws 4xx HttpError on bad input, 409 when the
 * submission matches no unconsumed served task or duplicates an existing
 * attempt (offline double-sync), 503 when set generation fails.
 */
export async function processAttempt(
  db: SaasMathDb,
  childId: string,
  input: SubmitAttemptInput,
): Promise<ProcessAttemptResult> {
  if (input.timeMs < 0) throw new HttpError(400, "timeMs must be >= 0");

  // Server-side paywall (plan sections 5 and 7): /api/session/next filters
  // skills by island access, but the write path must not trust the client to
  // submit only accessible skills. Checking here covers both pipelines that
  // share processAttempt (/api/session/submit and /api/sync), and runs before
  // step validation so probing a paywalled skill leaks nothing. The skill row
  // and the access level are independent reads.
  const [skill, access] = await Promise.all([
    loadSkill(db, input.skillId),
    loadIslandAccess(db, childId, new Date()),
  ]);
  if (!canAccessSkill(access, skill)) {
    throw new HttpError(
      403,
      `Skill ${skill.id} is not accessible on the child's current plan`,
    );
  }

  stepParamsFor(skill, input.step); // validate the step early (400)

  // The client's items are never trusted: regenerate from the seed.
  const items = generateSetItems(skill, input.step, input.seed);
  if (input.answers.length !== items.length) {
    throw new HttpError(
      400,
      `answers length (${input.answers.length}) != items length (${items.length})`,
    );
  }

  // --- Served-task binding (audit fix: progression was forgeable) ----------
  // The submission must match an unconsumed served_tasks row written by
  // /api/session/next. The row carries the served kind and SCT, so grading
  // follows the task that was actually served — not a mode re-derived from
  // mastery (the review-mode drift the audit flagged) and not a client-chosen
  // (skillId, step, seed).
  const served = findUnconsumedServedTask(db, childId, {
    skillId: skill.id,
    step: input.step,
    seed: input.seed,
  });
  if (!served) {
    throw new HttpError(409, "No unconsumed served task matches this submission");
  }

  // Untimed CPA sets legitimately record timeMs 0 (see engine/stars.ts); a
  // timed set never does.
  if (input.timeMs === 0 && served.kind !== "cpa") {
    throw new HttpError(400, "timeMs must be > 0 for timed sets");
  }

  const completedAt = clampCompletedAt(input.completedAt ?? new Date());

  // --- Mode, ladder state, and SCT -----------------------------------------
  // Mastery row and recent same-skill history are independent reads.
  const [masteryRows, historyRows] = await Promise.all([
    db
      .select()
      .from(mastery)
      .where(and(eq(mastery.childId, childId), eq(mastery.skillId, skill.id)))
      .limit(1),
    loadRecentAttemptRows(db, childId, skill.id, 20),
  ]);
  const masteryRow = masteryRows[0] ?? null;

  const mode: ProcessAttemptResult["mode"] = served.kind;

  const stateBefore = episodeState(
    historyRows,
    masteryRow?.cpaMode ?? false,
    input.step <= 1,
  );

  // Grade against the exact SCT the set was served with.
  const sctSeconds = served.sctSeconds;

  // --- Server-side re-grade (client grades are advisory only) --------------
  const graded = gradeItems(items, input.answers);
  const accuracy = graded.total > 0 ? graded.correctCount / graded.total : 0;
  const withinSct = input.timeMs <= sctSeconds * 1000;

  const grade: GradeOutcome = {
    correctCount: graded.correctCount,
    total: graded.total,
    timeMs: input.timeMs,
    sctSeconds,
    withinSct,
    items: graded.items,
  };

  // --- Gate decision (engine rules; review sets use the SM-2 gate) ---------
  const reviewGate = mode === "review" ? decideReviewGate(grade) : null;
  const ladderGate =
    reviewGate === null
      ? decideGate({
          correctCount: graded.correctCount,
          total: graded.total,
          withinSct,
          cpaMode: mode === "cpa",
          step: input.step,
          stepCount: skill.steps.length,
          stateBefore,
        })
      : null;
  const gate = (reviewGate ?? ladderGate)!.decision;
  const mutation = ladderGate?.mutation ?? null;

  const implausible = flagImplausible(
    { correctCount: graded.correctCount, total: graded.total, timeMs: input.timeMs },
    historyRows.map((row) => ({
      correctCount: row.correctCount,
      total: row.total,
      timeMs: row.timeMs,
    })),
  );

  // --- Mutations: mastery, attempt row, streak, stars -----------------------
  // Streak/star attribution is floored at the served time: a client can claim
  // any completedAt inside the 7-day window, but a task can only have been
  // played on or after the moment the server actually served it — so fresh
  // served rows cannot farm past-day streaks, while a genuinely offline
  // attempt (completed after it was served) still lands on its completion day.
  const attributedAt =
    completedAt < served.servedAt ? served.servedAt : completedAt;
  const today = jakartaDateString(attributedAt);
  // Implausible results keep the completion base but never the SCT bonus.
  const earnedStars = implausible ? STARS_PER_SET : starsForSet(accuracy, withinSct);

  const result = db.transaction((tx) => {
    // Atomic claim: the served task is consumed in the same transaction as
    // the attempt insert, so a raced double-submit fails here (409) and can
    // never produce a second graded attempt for one served task.
    const claimed = claimServedTask(
      tx,
      childId,
      { skillId: skill.id, step: input.step, seed: input.seed },
      completedAt,
    );
    if (!claimed) {
      throw new HttpError(409, "No unconsumed served task matches this submission");
    }

    const attemptId = insertAttempt(tx, childId, skill, input, {
      items,
      grade,
      gate,
      completedAt,
    });

    const masteryAfter = applyMasteryUpdate(tx, childId, skill, masteryRow, {
      mode,
      step: input.step,
      quality: reviewGate?.quality ?? null,
      mutation,
      correctFlags: graded.items.map((item) => item.correct),
      now: completedAt,
    });

    const { streak, starsAwarded } = applyStreakAndStars(
      tx,
      childId,
      today,
      earnedStars,
      attributedAt,
    );

    return { attemptId, masteryAfter, streak, starsAwarded };
  });

  return {
    attemptId: result.attemptId,
    mode,
    grade,
    gate,
    streak: result.streak,
    starsAwarded: result.starsAwarded,
    implausible,
    answerKey: items.map((item, i) => ({
      itemId: item.id,
      index: i + 1,
      answer: formatAnswer(item.answer),
    })),
    masteryAfter: result.masteryAfter,
  };
}

function insertAttempt(
  tx: DbLike,
  childId: string,
  skill: Skill,
  input: SubmitAttemptInput,
  data: {
    items: ReturnType<typeof generateSetItems>;
    grade: GradeOutcome;
    gate: GateDecision;
    completedAt: Date;
  },
): string {
  let inserted: { id: string } | undefined;
  try {
    inserted = tx
      .insert(attempts)
      .values({
        childId,
        skillId: skill.id,
        step: input.step,
        seed: input.seed,
        items: data.items,
        answers: input.answers,
        correctCount: data.grade.correctCount,
        total: data.grade.total,
        timeMs: input.timeMs,
        sctSeconds: data.grade.sctSeconds,
        gateResult: data.gate,
        createdAt: data.completedAt,
      })
      .returning({ id: attempts.id })
      .get();
  } catch (error) {
    // Duplicate detection is the UNIQUE index on (child, skill, seed, timeMs)
    // enforced inside this transaction — check-then-act outside it would race.
    if (isUniqueConstraintError(error)) {
      throw new HttpError(409, "Duplicate attempt (already synced)");
    }
    throw error;
  }
  if (!inserted) throw new Error("insertAttempt: no returning row");
  return inserted.id;
}

function applyMasteryUpdate(
  tx: DbLike,
  childId: string,
  skill: Skill,
  current: Mastery | null,
  ctx: {
    mode: ProcessAttemptResult["mode"];
    step: number;
    quality: 2 | 4 | 5 | null;
    mutation: GateMutation | null;
    correctFlags: boolean[];
    now: Date;
  },
): ProcessAttemptResult["masteryAfter"] {
  const stepCount = skill.steps.length;
  const now = ctx.now;

  // Next-field computation; inserted when the row does not exist yet.
  let state: Mastery["state"] = current?.state ?? "Baru";
  let step = current?.step ?? ctx.step;
  let cpaMode = current?.cpaMode ?? false;
  let fluencyFlag = current?.fluencyFlag ?? false;
  let ease = current?.ease ?? 2.5;
  let intervalDays = current?.intervalDays ?? 0;
  let reps = current?.reps ?? 0;
  let dueAt: Date | null = current?.dueAt ?? null;

  const elo = masteryEloUpdate(
    current ? { eloRating: current.eloRating, eloN: current.eloN } : null,
    ctx.step,
    ctx.correctFlags,
  );

  if (ctx.mode === "review" || state === "Kuasai") {
    // Review attempt: SM-2 only; a lapse drops the skill back to "Lancar".
    const sm2 = reviewSm2(
      { ease, intervalDays, reps, dueAt },
      ctx.quality ?? 2,
      now,
    );
    ease = sm2.state.ease;
    reps = sm2.state.reps;
    intervalDays = sm2.state.intervalDays;
    if (sm2.downgrade) {
      state = "Lancar";
      dueAt = null;
    } else {
      dueAt = sm2.state.dueAt;
    }
  } else if (ctx.mutation) {
    const mutation = ctx.mutation;
    if (mutation.cpaEnter) {
      cpaMode = true;
      step = Math.max(1, ctx.step + mutation.stepDelta);
    } else if (mutation.cpaExit) {
      cpaMode = false;
    } else if (mutation.stepDelta !== 0) {
      if (mutation.complete) {
        step = Math.min(ctx.step, stepCount);
        state = "Kuasai";
        const init = kuasaiInitSm2(now);
        ease = init.ease;
        intervalDays = init.intervalDays;
        reps = init.reps;
        dueAt = init.dueAt;
      } else {
        step = ctx.step + mutation.stepDelta;
        if (state === "Baru") state = "Lancar";
      }
    }
    if (mutation.fluencyFlag === true) fluencyFlag = true;
  }

  const next = {
    state,
    step,
    cpaMode,
    fluencyFlag,
    ease,
    intervalDays,
    reps,
    dueAt,
    eloRating: elo.eloRating,
    eloN: elo.eloN,
    updatedAt: now,
  };

  tx.insert(mastery)
    .values({ childId, skillId: skill.id, ...next })
    .onConflictDoUpdate({
      target: [mastery.childId, mastery.skillId],
      set: next,
    })
    .run();

  return {
    skillId: skill.id,
    state,
    step,
    cpaMode,
    fluencyFlag,
  };
}

function applyStreakAndStars(
  tx: DbLike,
  childId: string,
  today: string,
  earnedStars: number,
  attributedAt: Date,
): { streak: StreakState; starsAwarded: number } {
  const existing = tx
    .select()
    .from(streaks)
    .where(eq(streaks.childId, childId))
    .get();

  const prev: StreakState = existing
    ? {
        current: existing.current,
        best: existing.best,
        freezesLeft: existing.freezesLeft,
        lastCompletedDate: existing.lastCompletedDate,
      }
    : { current: 0, best: 0, freezesLeft: 2, lastCompletedDate: null };

  const next = updateStreak(prev, today);

  tx.insert(streaks)
    .values({
      childId,
      current: next.current,
      best: next.best,
      freezesLeft: next.freezesLeft,
      lastCompletedDate: next.lastCompletedDate,
    })
    .onConflictDoUpdate({
      target: streaks.childId,
      set: {
        current: next.current,
        best: next.best,
        freezesLeft: next.freezesLeft,
        lastCompletedDate: next.lastCompletedDate,
      },
    })
    .run();

  // Stars: ledger entry + wallet increment (plan 4.2, effort currency),
  // truncated at the per-day cap for the attribution day (anti-farm).
  const dayStart = jakartaDayStartUtc(attributedAt);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const creditedToday = tx
    .select({ delta: starsLedger.delta })
    .from(starsLedger)
    .where(
      and(
        eq(starsLedger.childId, childId),
        eq(starsLedger.reason, "daily_set"),
        gte(starsLedger.createdAt, dayStart),
        lt(starsLedger.createdAt, dayEnd),
      ),
    )
    .all()
    .reduce((sum, row) => sum + row.delta, 0);
  const starsAwarded = Math.max(
    0,
    Math.min(earnedStars, DAILY_STARS_CAP - creditedToday),
  );

  tx.insert(starsLedger)
    .values({
      childId,
      delta: starsAwarded,
      reason: "daily_set",
      createdAt: attributedAt,
    })
    .run();
  tx.update(children)
    .set({ starsBalance: sql`${children.starsBalance} + ${starsAwarded}` })
    .where(eq(children.id, childId))
    .run();

  return {
    streak: {
      current: next.current,
      best: next.best,
      freezesLeft: next.freezesLeft,
      lastCompletedDate: next.lastCompletedDate,
    },
    starsAwarded,
  };
}
