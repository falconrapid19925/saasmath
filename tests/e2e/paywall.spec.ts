/**
 * E2E journey 2 (paywall): a free child's direct submit of a paywalled skill
 * is refused 403 with nothing written; a stub-mode checkout records a PENDING
 * order (never the activation itself).
 *
 * NOTE vs the audit wording: the audit expected "the skill still 403" after
 * checkout. The shipped behavior (deliberate, see src/lib/server/island.ts
 * and src/lib/server/midtrans.ts) starts the one-time 7-day full trial when
 * checkout is initiated, so a kelas 4-5 child regains submit access through
 * the trial — while the PAID plan stays inactive until the verified webhook.
 * This spec pins the shipped contract: order pending, plan NOT upgraded to
 * bulanan, and the write path still bound by the served-task check (no
 * attempt row even after the unlock).
 */

import { expect, test } from "@playwright/test";

import {
  createChild,
  fetchNextTask,
  loginChild,
  loginParent,
  placeChildPerfectly,
  registerParent,
} from "./helpers/api";
import {
  countAttempts,
  countServedTasks,
  firstPaywalledSkill,
  getOrder,
  getSubscription,
} from "./helpers/db";

test("free child direct submit of a paywalled skill → 403, nothing written; stub checkout → pending order", async ({
  browser,
}) => {
  // Parent context (register leaves it holding the parent session) plus a
  // dedicated child context.
  const parentContext = await browser.newContext();
  const parent = await registerParent(parentContext, "paywall");
  const child = await createChild(parentContext, "paywall", 4);
  const childContext = await browser.newContext();
  await loginChild(childContext, child);

  const paywalled = firstPaywalledSkill(child.grade);
  expect(paywalled.itemCountStep1).toBeGreaterThan(0);
  expect(countAttempts(child.id, paywalled.id)).toBe(0);
  expect(countServedTasks(child.id, paywalled.id)).toBe(0);

  // 1. Direct submit for a paywalled skill — the server-side paywall rejects
  //    before anything else (step validation, served-task binding, grading).
  const submission = {
    skillId: paywalled.id,
    step: 1,
    seed: 424242,
    answers: Array.from({ length: paywalled.itemCountStep1 }, () => null),
    timeMs: 30_000,
  };
  const refused = await childContext.request.post("/api/session/submit", {
    data: submission,
  });
  expect(refused.status()).toBe(403);
  const refusedBody = (await refused.json()) as { error?: string };
  expect(refusedBody.error).toContain("not accessible on the child's current plan");

  // Nothing was written: no attempt, and not even a consumed/created served task.
  expect(countAttempts(child.id, paywalled.id)).toBe(0);
  expect(countServedTasks(child.id, paywalled.id)).toBe(0);

  // 2. Stub-mode checkout (MIDTRANS_SERVER_KEY unset): a pending order row is
  //    the only durable write — the subscription is activated by the webhook,
  //    never by checkout itself.
  const checkoutContext = await browser.newContext();
  await loginParent(checkoutContext, parent);
  const checkoutRes = await checkoutContext.request.post("/api/checkout", {
    data: { childId: child.id, months: 1 },
  });
  expect(checkoutRes.status()).toBe(202);
  const checkout = (await checkoutRes.json()) as {
    mode: string;
    orderId: string;
    snapUrl: string | null;
    amountIdr: number;
    plan: string;
  };
  expect(checkout.mode).toBe("stub");
  expect(checkout.snapUrl).toBeNull();

  const order = getOrder(checkout.orderId);
  expect(order.status).toBe("pending");
  expect(order.paid_at).toBeNull();
  expect(order.child_id).toBe(child.id);
  expect(order.plan).toBe("bulanan");
  expect(order.months).toBe(1);
  expect(order.amount_idr).toBe(checkout.amountIdr);

  // The paid plan is NOT active after checkout. What changed is the
  // documented one-time 7-day trial start.
  const subscription = getSubscription(child.id);
  expect(subscription.plan).toBe("trial");
  expect(subscription.trial_ends_at).not.toBeNull();
  expect(["bulanan", "bundle"]).not.toContain(subscription.plan);

  // 3. Same direct submit again: no longer a paywall 403 (trial = full
  //    kelas 4-5 island access), but the served-task binding still refuses
  //    the write — no attempt exists without a served task.
  const replay = await childContext.request.post("/api/session/submit", {
    data: submission,
  });
  expect(replay.status()).toBe(409);
  const replayBody = (await replay.json()) as { error?: string };
  expect(replayBody.error).toContain("No unconsumed served task");
  expect(countAttempts(child.id, paywalled.id)).toBe(0);

  for (const context of [parentContext, childContext, checkoutContext]) {
    await context.close();
  }
});

test("paywalled skills stay out of the free child's served tasks (/api/session/next)", async ({
  browser,
}) => {
  // Independent check of the read path: next() only ever serves
  // island-accessible skills, so a free child cannot even be handed a
  // paywalled set (the 403 above is the probe backstop, not the norm).
  const parentContext = await browser.newContext();
  await registerParent(parentContext, "paywall-next");
  const child = await createChild(parentContext, "paywallnext", 4);
  const childContext = await browser.newContext();
  await loginChild(childContext, child);
  await placeChildPerfectly(childContext, child.id);

  const paywalled = firstPaywalledSkill(child.grade);
  for (let i = 0; i < 3; i += 1) {
    const task = await fetchNextTask(childContext);
    expect(task.skill.id).not.toBe(paywalled.id);
  }
  await parentContext.close();
  await childContext.close();
});
