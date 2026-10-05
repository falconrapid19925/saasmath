/**
 * E2E journey 3 (offline): a set loaded while online is completed under
 * context.setOffline(true) — the attempt lands in the browser outbox and
 * nothing reaches the server. On reconnect the outbox drains through
 * POST /api/sync (status "applied", stars awarded), and replaying the exact
 * same batch answers "duplicate" with no second attempt and no double stars.
 */

import { expect, test } from "@playwright/test";

import { createChild, installSession, placeChildPerfectly, registerParent } from "./helpers/api";
import type { ServedTask } from "./helpers/api";
import { countAttempts, starsBalance } from "./helpers/db";
import { answerAllItems, captureResponseJson, readOutboxCount } from "./helpers/play";

test("offline completion drains via /api/sync; replay reports duplicate without double stars", async ({
  page,
}) => {
  // Setup: parent + child via the app's own API, then the page context is
  // made the child (the route's own Secure-cookie handoff does not survive
  // plain http — see helpers/api.ts — so the session is installed directly).
  const label = "offline";
  const context = page.context();
  await registerParent(context, label);
  const child = await createChild(context, label, 4);
  await installSession(context, { sub: child.id, role: "child" });
  await placeChildPerfectly(context, child.id);

  // Load a set online (DrillPlayer POSTs /api/session/next on mount).
  const task = await captureResponseJson<ServedTask>(page, "/api/session/next", "POST", async () => {
    await page.goto("/anak/latihan");
  });
  expect(task.items.length).toBeGreaterThan(0);
  await expect(page.getByText(`Soal 1 / ${task.items.length}`)).toBeVisible();

  const balanceBefore = starsBalance(child.id);

  // --- offline: complete the loaded set ------------------------------------
  await page.context().setOffline(true);
  await answerAllItems(page, task.items);

  // The graded attempt is queued in the browser outbox only. (The result
  // screen's offline note is not asserted: the offline router.refresh in
  // finish() can hard-reload the page, so the outbox is polled instead.)
  await expect.poll(() => readOutboxCount(page), {
    message: "one queued attempt while offline",
  }).toBe(1);

  // Nothing reached the server while offline.
  expect(countAttempts(child.id, task.skill.id)).toBe(0);
  expect(starsBalance(child.id)).toBe(balanceBefore);

  // --- reconnect: the outbox drains via /api/sync ---------------------------
  await page.context().setOffline(false);
  const [syncRequest, syncResponse] = await Promise.all([
    page.waitForRequest((request) => request.url().includes("/api/sync")),
    page.waitForResponse((response) => response.url().includes("/api/sync")),
    page.goto("/anak"), // remount flushes the outbox (SyncIndicator/useOutbox)
  ]);

  const syncResults = (await syncResponse.json()) as {
    results: { status: string; skillId: string; starsAwarded?: number }[];
  };
  expect(syncResults.results).toHaveLength(1);
  expect(syncResults.results[0]?.status).toBe("applied");
  expect(syncResults.results[0]?.skillId).toBe(task.skill.id);
  expect(syncResults.results[0]?.starsAwarded).toBeGreaterThan(0);

  const batch = JSON.parse(syncRequest.postData() ?? "{}") as {
    attempts: { skillId: string; seed: number; step: number }[];
  };
  expect(batch.attempts).toHaveLength(1);
  expect(batch.attempts[0]?.skillId).toBe(task.skill.id);
  expect(batch.attempts[0]?.seed).toBe(task.seed);
  expect(batch.attempts[0]?.step).toBe(task.step);

  await expect.poll(() => readOutboxCount(page), {
    message: "outbox drained after reconnect",
  }).toBe(0);

  const attemptCount = countAttempts(child.id, task.skill.id);
  expect(attemptCount).toBe(1);
  const balanceAfterSync = starsBalance(child.id);
  expect(balanceAfterSync).toBe(balanceBefore + (syncResults.results[0]?.starsAwarded ?? 0));

  // --- replay the exact same batch: duplicate, no double stars --------------
  const replay = await page.request.post("/api/sync", { data: batch });
  expect(replay.status()).toBe(200);
  const replayBody = (await replay.json()) as {
    results: { status: string; skillId: string }[];
  };
  expect(replayBody.results).toHaveLength(1);
  expect(replayBody.results[0]?.status).toBe("duplicate");
  expect(replayBody.results[0]?.skillId).toBe(task.skill.id);

  expect(countAttempts(child.id, task.skill.id)).toBe(attemptCount);
  expect(starsBalance(child.id)).toBe(balanceAfterSync);
});
