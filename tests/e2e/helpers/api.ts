/**
 * API-side setup helpers for the e2e specs. They reuse the app's own
 * endpoints (the same ones the UI calls) so fixtures are real persisted
 * state, not mocks.
 *
 * Session handling: the server marks its session cookie Secure in production
 * (src/lib/server/authz.ts), and plain-HTTP request contexts (Playwright's
 * APIRequestContext, and non-Chromium cookie jars generally) will not store
 * or resend it. The suite therefore installs the session cookie directly —
 * signed by the test run's AUTH_SECRET with the app's own createSessionToken
 * (src/lib/auth.ts), i.e. byte-for-byte what setSessionCookie would issue.
 * The credential endpoints are still exercised for real (register/login
 * validate the credentials); only the cookie handover is injected.
 */

import { expect } from "@playwright/test";
import type { BrowserContext } from "@playwright/test";

import { createSessionToken } from "../../../src/lib/auth";
import type { Item } from "../../../src/lib/engine/types";

import { getParentByEmail } from "./db";
import { E2E_AUTH_SECRET, E2E_BASE_URL } from "./e2e-env.mjs";

// The runner process signs session tokens itself (installSession) — give it
// the same secret the webServer runs on.
process.env.AUTH_SECRET ??= E2E_AUTH_SECRET;

/** Mirror of SESSION_COOKIE_NAME in src/lib/auth.ts. */
export const SESSION_COOKIE_NAME = "saasmath_session";

/** The child PIN policy is exactly 6 digits (src/lib/server/schemas.ts). */
export const E2E_CHILD_PIN = "135790";

export type ParentAccount = { email: string; password: string; id: string };
export type ChildAccount = { id: string; name: string; grade: 4 | 5; pin: string };

let uniqueCounter = 0;

/** Unique per-call names/emails keep re-runs inside one DB conflict-free. */
export function uniqueId(prefix: string): string {
  uniqueCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${uniqueCounter}`;
}

/**
 * Install a session cookie the server will accept (see module note). Any
 * Secure-flagged cookie a route already dropped for this name is cleared
 * first: a Secure cookie occupies the (name, domain, path) slot and blocks
 * overwriting it with the injectable non-Secure cookie.
 */
export async function installSession(
  context: BrowserContext,
  session: { sub: string; role: "parent" | "child" },
): Promise<void> {
  await context.clearCookies({ name: SESSION_COOKIE_NAME });
  await context.addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: createSessionToken(session),
      url: E2E_BASE_URL,
    },
  ]);
}

/** POST /api/auth/register, then make this context the parent session. */
export async function registerParent(
  context: BrowserContext,
  label: string,
): Promise<ParentAccount> {
  const account = {
    name: `Orang Tua ${label}`,
    email: `${uniqueId(`e2e-${label}`)}@test.example`,
    password: "rahasia-123",
  };
  const res = await context.request.post("/api/auth/register", { data: account });
  expect(res.status(), await res.text()).toBe(200);
  const parent: ParentAccount = {
    email: account.email,
    password: account.password,
    id: getParentByEmail(account.email).id,
  };
  await installSession(context, { sub: parent.id, role: "parent" });
  return parent;
}

/** POST /api/auth/login (credential check) and re-install the parent session. */
export async function loginParent(
  context: BrowserContext,
  account: ParentAccount,
): Promise<void> {
  const res = await context.request.post("/api/auth/login", {
    data: { email: account.email, password: account.password },
  });
  expect(res.status(), await res.text()).toBe(200);
  await installSession(context, { sub: account.id, role: "parent" });
}

/**
 * POST /api/auth/children as the parent session of this context. The route's
 * own child-cookie handoff is Secure-flagged away on http, so the caller
 * decides the role via installSession.
 */
export async function createChild(
  context: BrowserContext,
  label: string,
  grade: 4 | 5 = 4,
): Promise<ChildAccount> {
  const name = `Anak ${label.slice(-8)} ${Math.floor(Math.random() * 900 + 100)}`;
  const res = await context.request.post("/api/auth/children", {
    data: { name, grade, pin: E2E_CHILD_PIN },
  });
  const body = (await res.json()) as { child?: { id: string }; error?: string };
  expect(res.status(), JSON.stringify(body)).toBe(201);
  if (!body.child) throw new Error("createChild: no child in response");
  return { id: body.child.id, name, grade, pin: E2E_CHILD_PIN };
}

/**
 * POST /api/auth/child-login (real name+PIN verification against the seeded
 * scrypt hash), then install the child session on this context.
 */
export async function loginChild(
  context: BrowserContext,
  child: ChildAccount,
): Promise<void> {
  const res = await context.request.post("/api/auth/child-login", {
    data: { name: child.name, pin: child.pin },
  });
  expect(res.status(), await res.text()).toBe(200);
  await installSession(context, { sub: child.id, role: "child" });
}

/** The GET /api/placement response (items carry their answer key). */
export type PlacementDiagnostic = {
  childId: string;
  seed: number;
  totalItems: number;
  items: Item[];
};

/** Complete the placement diagnostic with a perfect score via the API. */
export async function placeChildPerfectly(
  context: BrowserContext,
  childId: string,
): Promise<void> {
  const get = await context.request.get(`/api/placement?childId=${encodeURIComponent(childId)}`);
  expect(get.status(), await get.text()).toBe(200);
  const diagnostic = (await get.json()) as PlacementDiagnostic;
  const post = await context.request.post("/api/placement", {
    data: {
      childId,
      seed: diagnostic.seed,
      answers: diagnostic.items.map((item) => item.answer),
    },
  });
  expect(post.status(), await post.text()).toBe(200);
}

export type ServedTask = {
  kind: "progression" | "review" | "cpa";
  skill: { id: string; titleId: string };
  step: number;
  stepCount: number;
  seed: number;
  items: Item[];
  sctSeconds: number;
  timed: boolean;
};

/** POST /api/session/next for a logged-in child context. */
export async function fetchNextTask(context: BrowserContext): Promise<ServedTask> {
  const res = await context.request.post("/api/session/next");
  expect(res.status(), await res.text()).toBe(200);
  const body = (await res.json()) as ServedTask | { kind: "placement_required"; reason: string };
  if (body.kind === "placement_required") {
    throw new Error(`fetchNextTask: placement_required (${body.reason})`);
  }
  return body;
}
