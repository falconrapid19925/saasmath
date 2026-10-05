/**
 * E2E journey 5 (printable worksheets): GET /api/sets/[id]/pdf as the owning
 * parent streams an application/pdf worksheet (regenerated from the stored
 * seed), strangers get nothing, anonymous callers are refused.
 */

import { expect, test } from "@playwright/test";
import type { BrowserContext } from "@playwright/test";

import {
  createChild,
  fetchNextTask,
  loginChild,
  loginParent,
  placeChildPerfectly,
  registerParent,
} from "./helpers/api";

/** One graded attempt via the direct submit pipeline (all items skipped). */
async function createAttemptAsChild(childContext: BrowserContext): Promise<string> {
  const task = await fetchNextTask(childContext);
  const res = await childContext.request.post("/api/session/submit", {
    data: {
      skillId: task.skill.id,
      step: task.step,
      seed: task.seed,
      // Skips are valid first-pass answers; the server re-grades from the
      // seed either way — this attempt only needs to exist.
      answers: task.items.map(() => null),
      timeMs: 60_000,
    },
  });
  expect(res.status(), await res.text()).toBe(200);
  const body = (await res.json()) as { attemptId: string };
  expect(body.attemptId).toBeTruthy();
  return body.attemptId;
}

test("GET /api/sets/[id]/pdf as the owning parent returns application/pdf", async ({
  browser,
}) => {
  const parentContext = await browser.newContext();
  const parent = await registerParent(parentContext, "pdf");
  const child = await createChild(parentContext, "pdf", 4);
  const childContext = await browser.newContext();
  await loginChild(childContext, child);
  await placeChildPerfectly(childContext, child.id);
  const attemptId = await createAttemptAsChild(childContext);

  // The owning parent (fresh parent session) downloads the worksheet.
  const ownerContext = await browser.newContext();
  await loginParent(ownerContext, parent);
  const pdf = await ownerContext.request.get(`/api/sets/${attemptId}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect(pdf.headers()["content-disposition"]).toContain(".pdf");
  const body = await pdf.body();
  expect(body.length).toBeGreaterThan(1000);
  expect(body.subarray(0, 5).toString("latin1")).toBe("%PDF-");

  // A different parent cannot read the child's set (no existence leak: 404).
  const strangerContext = await browser.newContext();
  await registerParent(strangerContext, "pdf-stranger");
  expect((await strangerContext.request.get(`/api/sets/${attemptId}/pdf`)).status()).toBe(404);

  // Anonymous callers get 401.
  const anonymous = await browser.newContext();
  expect((await anonymous.request.get(`/api/sets/${attemptId}/pdf`)).status()).toBe(401);

  for (const context of [
    parentContext,
    childContext,
    ownerContext,
    strangerContext,
    anonymous,
  ]) {
    await context.close();
  }
});
