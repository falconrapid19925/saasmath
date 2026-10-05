import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchNextTask, fetchPlacement, loginChildApi, submitPlacementApi } from "./api";
import type { GateLadderState } from "@/lib/engine/gates";
import type { Item } from "@/lib/engine/types";

/**
 * The POST /api/session/next contract (route: src/app/api/session/next):
 * the server-decided task carries the gate ladder state the child's episode
 * folded to (so the result screen predicts with the engine's decideGate on
 * the server's inputs), the step count for the result header, and the served
 * (already tightened) SCT.
 */

const LADDER: GateLadderState = {
  tightenCycles: 2,
  overTargetStreak: 1,
  tightenedBeatStreak: 0,
  cleanCpaStreak: 0,
};

function nextResponseBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    kind: "progression",
    reason: "Continuing the ladder on the most recently active skill.",
    today: "2026-10-05",
    skill: { id: "k4-add-1", titleId: "k4.add.title", strand: "Bilangan", family: "add", grade: 4 },
    step: 3,
    seed: 12345,
    items: [] as Item[],
    sctSeconds: 108,
    timed: true,
    stepCount: 7,
    gateLadder: LADDER,
    cpaModels: [],
    ...overrides,
  };
}

function stubNextRoute(body: Record<string, unknown>) {
  const response = { ok: true, status: 200, json: async () => body };
  vi.stubGlobal("fetch", vi.fn(async () => response as Response));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchNextTask — the /api/session/next response contract", () => {
  it("carries the server-provided gate ladder state into the task descriptor", async () => {
    stubNextRoute(nextResponseBody());
    const next = await fetchNextTask();
    if (next.status !== "ok") throw new Error("expected an ok task");
    expect(next.task.gateLadder).toEqual(LADDER);
  });

  it("carries the skill's step count into the task descriptor", async () => {
    stubNextRoute(nextResponseBody());
    const next = await fetchNextTask();
    if (next.status !== "ok") throw new Error("expected an ok task");
    expect(next.task.stepCount).toBe(7);
  });

  it("marks CPA sets untimed from the decided kind", async () => {
    stubNextRoute(nextResponseBody({ kind: "cpa", timed: false }));
    const next = await fetchNextTask();
    if (next.status !== "ok") throw new Error("expected an ok task");
    expect(next.task.cpaMode).toBe(true);
    expect(next.task.timed).toBe(false);
  });
});

describe("offline error mapping — one friendly message for fetch-level failures", () => {
  const OFFLINE = "Tidak ada internet — coba lagi ya.";

  function stubBrokenNetwork() {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
  }

  it("maps a fetch rejection on /api/session/next to the friendly message", async () => {
    stubBrokenNetwork();
    await expect(fetchNextTask()).rejects.toThrow(OFFLINE);
  });

  it("maps placement load and submit fetch rejections to the same message", async () => {
    stubBrokenNetwork();
    await expect(fetchPlacement("child-1")).rejects.toThrow(OFFLINE);
    await expect(
      submitPlacementApi({ childId: "child-1", seed: 1, answers: [] }),
    ).rejects.toThrow(OFFLINE);
  });

  it("reports auth fetch rejections as a failed attempt instead of throwing", async () => {
    stubBrokenNetwork();
    await expect(loginChildApi({ name: "Anak", pin: "123456" })).resolves.toEqual({
      ok: false,
      error: OFFLINE,
    });
  });

  it("keeps server-provided error messages untouched (only network failures map)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 403,
        json: async () => ({ error: "Child authentication required" }),
      })),
    );
    await expect(fetchNextTask()).rejects.toThrow("Child authentication required");
  });
});
