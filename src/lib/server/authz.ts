/**
 * Route-handler session helpers over the signed cookie (src/lib/auth.ts).
 * Children authenticate with name+PIN (child session); parents with
 * email+password (parent session). Every helper throws HttpError so the
 * handleRoute wrapper turns it into a JSON response.
 */

import { cookies } from "next/headers";

import { eq } from "drizzle-orm";

import type { SaasMathDb } from "@/db";
import { children } from "@/db/schema";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  createSessionToken,
  verifySessionToken,
  type SessionPayload,
} from "@/lib/auth";

import { HttpError } from "./http";

export async function getSessionPayload(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE_NAME)?.value);
}

export async function requireParentSession(): Promise<SessionPayload> {
  const session = await getSessionPayload();
  if (!session || session.role !== "parent") {
    throw new HttpError(401, "Parent authentication required");
  }
  return session;
}

export async function requireChildSession(): Promise<SessionPayload> {
  const session = await getSessionPayload();
  if (!session || session.role !== "child") {
    throw new HttpError(401, "Child authentication required");
  }
  return session;
}

/**
 * For endpoints a child uses but a parent may also call on their behalf
 * (placement, PDF export): child session must be the child themself, parent
 * session must own the child.
 */
export async function requireChildAccess(
  db: SaasMathDb,
  childId: string,
): Promise<SessionPayload> {
  const session = await getSessionPayload();
  if (!session) throw new HttpError(401, "Authentication required");

  if (session.role === "child") {
    if (session.sub !== childId) {
      throw new HttpError(403, "Child session may only access its own data");
    }
    return session;
  }

  const rows = await db
    .select({ parentId: children.parentId })
    .from(children)
    .where(eq(children.id, childId))
    .limit(1);
  if (!rows[0] || rows[0].parentId !== session.sub) {
    throw new HttpError(404, "Child not found");
  }
  return session;
}

/** Parent session that provably owns childId; returns the child row. */
export async function requireOwnedChild(db: SaasMathDb, childId: string) {
  const parent = await requireParentSession();
  const rows = await db
    .select()
    .from(children)
    .where(eq(children.id, childId))
    .limit(1);
  const child = rows[0];
  if (!child || child.parentId !== parent.sub) {
    throw new HttpError(404, "Child not found");
  }
  return child;
}

export async function setSessionCookie(sub: string, role: "parent" | "child"): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, createSessionToken({ sub, role }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}
