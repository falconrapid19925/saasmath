"use server";

/**
 * Session server actions: session reader, child setup (parent), child login
 * by profile + PIN, and logout. Sessions use the scaffold's HMAC cookie
 * token (src/lib/auth.ts); cookie writing goes through
 * src/lib/server/authz.setSessionCookie so actions and route handlers share
 * one cookie policy.
 *
 * The credential-establishing endpoints (parent register/login, child
 * name+PIN login) deliberately live as POST /api/auth/* route handlers —
 * they are the authentication boundary itself and legitimately run for
 * anonymous callers (see src/lib/server/credentials.ts). DB access happens
 * inside the remaining action bodies only.
 */

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";

import { getDb } from "@/db/index";
import { children, streaks, subscriptions } from "@/db/schema";
import {
  hashPassword,
  verifyPassword,
  verifySessionToken,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";
import { setSessionCookie } from "@/lib/server/authz";
import { RATE_LIMITED_MESSAGE, loginRateLimiter } from "@/lib/server/ratelimit";

type ActionResult = { ok: true } | { ok: false; error: string };

/** Read the current session (server components use this via page guards). */
export async function getSession(): Promise<{
  sub: string;
  role: "parent" | "child";
} | null> {
  const cookieStore = await cookies();
  const payload = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  return payload ? { sub: payload.sub, role: payload.role } : null;
}

const childSchema = z.object({
  name: z.string().trim().min(2, "Nama anak minimal 2 huruf.").max(40),
  grade: z.union([z.literal(4), z.literal(5)]),
  pin: z.string().regex(/^\d{6}$/, "PIN harus 6 angka."),
});

export async function createChild(input: unknown): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== "parent") {
    return { ok: false, error: "Masuk sebagai orang tua dulu." };
  }
  const parsed = childSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  }
  const { name, grade, pin } = parsed.data;
  const db = getDb();
  const inserted = await db
    .insert(children)
    .values({
      parentId: session.sub,
      name,
      grade,
      pinHash: hashPassword(pin),
    })
    .returning({ id: children.id });
  const childId = inserted[0].id;
  await db.insert(streaks).values({ childId }).onConflictDoNothing();
  await db.insert(subscriptions).values({ childId, plan: "free" }).onConflictDoNothing();
  await setSessionCookie(childId, "child");
  return { ok: true };
}

/** Child login from the parent dashboard: pick a profile, then PIN. */
export async function loginChildById(input: unknown): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== "parent") {
    return { ok: false, error: "Masuk sebagai orang tua dulu." };
  }
  const parsed = z
    .object({ childId: z.string().min(1), pin: z.string().regex(/^\d{6}$/) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "PIN harus 6 angka." };
  const db = getDb();
  const found = await db
    .select()
    .from(children)
    .where(eq(children.id, parsed.data.childId))
    .limit(1);
  const child = found[0];
  if (!child || child.parentId !== session.sub) {
    return { ok: false, error: "Profil tidak ditemukan." };
  }
  // Per-child lockout, same key namespace as POST /api/auth/child/login.
  const key = `child-login:child:${child.id}`;
  if (loginRateLimiter.retryAfterSeconds(key) > 0) {
    return { ok: false, error: RATE_LIMITED_MESSAGE };
  }
  if (!verifyPassword(parsed.data.pin, child.pinHash)) {
    loginRateLimiter.recordFailure(key);
    return { ok: false, error: "PIN salah. Coba lagi ya." };
  }
  loginRateLimiter.recordSuccess(key);
  await setSessionCookie(child.id, "child");
  return { ok: true };
}

export async function logout(): Promise<ActionResult> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  return { ok: true };
}

/** <form action={...}>-compatible logout: takes FormData, returns nothing. */
export async function logoutForm(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
