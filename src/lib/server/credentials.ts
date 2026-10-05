/**
 * Credential-establishing flows (plan section 5): parent register/login and
 * child name+PIN login. These endpoints ARE the authentication boundary —
 * they legitimately run for anonymous callers, so they are served as plain
 * POST /api/auth/* route handlers (the conventional, guardable HTTP seam)
 * instead of server actions. Everything privileged stays behind the session
 * checks in src/lib/server/authz.ts and src/app/actions/auth.ts.
 *
 * Every failed attempt feeds the shared limiter (src/lib/server/ratelimit.ts)
 * keyed by the credential itself; the routes add a per-IP key on top. The
 * child-login errors for an unknown name and a wrong PIN are identical so a
 * stranger cannot enumerate names. Emails are matched case-insensitively.
 *
 * Error strings are Bahasa Indonesia (user-facing form copy, unchanged from
 * the former server actions); status codes follow the API convention in
 * src/lib/server/http.ts.
 */

import { eq } from "drizzle-orm";
import { z } from "zod";

import type { SaasMathDb } from "@/db";
import { children, parents } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { RATE_LIMITED_MESSAGE, loginRateLimiter } from "@/lib/server/ratelimit";

export type CredentialResult =
  | { ok: true; sub: string; role: "parent" | "child" }
  | { ok: false; status: number; error: string };

const registerSchema = z.object({
  name: z.string().trim().min(2, "Nama minimal 2 huruf.").max(80),
  email: z.string().trim().email("Format email tidak valid."),
  password: z.string().min(8, "Kata sandi minimal 8 karakter."),
});

const parentLoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

const childLoginSchema = z.object({
  name: z.string().trim().min(1, "Tulis nama kamu."),
  pin: z.string().regex(/^\d{6}$/, "PIN harus 6 angka."),
});

const INVALID_PARENT_CREDENTIALS = "Email atau kata sandi salah.";

/** One generic child-login error: unknown name and wrong PIN are indistinguishable. */
const INVALID_CHILD_CREDENTIALS = "Nama atau PIN belum benar. Coba lagi ya.";

const DUPLICATE_NAME =
  "Ada beberapa anak dengan nama yang sama. Masuk lewat portal orang tua.";

/** 429 shortcut when the key is locked out. */
function locked(): CredentialResult {
  return { ok: false, status: 429, error: RATE_LIMITED_MESSAGE };
}

/** Create a parent account (the "Daftar" form). No prior session exists. */
export async function registerParentCredential(
  db: SaasMathDb,
  input: unknown,
): Promise<CredentialResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      error: parsed.error.issues[0]?.message ?? "Data tidak valid.",
    };
  }
  const { name, password } = parsed.data;
  const email = parsed.data.email.toLowerCase();
  const key = `register:email:${email}`;
  if (loginRateLimiter.retryAfterSeconds(key) > 0) return locked();

  const existing = await db.select().from(parents).where(eq(parents.email, email)).limit(1);
  if (existing.length > 0) {
    loginRateLimiter.recordFailure(key);
    return { ok: false, status: 409, error: "Email sudah terdaftar. Coba masuk." };
  }
  const inserted = await db
    .insert(parents)
    .values({ name, email, passwordHash: hashPassword(password) })
    .returning({ id: parents.id });
  loginRateLimiter.recordSuccess(key);
  return { ok: true, sub: inserted[0].id, role: "parent" };
}

/** Verify parent email + password (the "Masuk" form). No prior session exists. */
export async function loginParentCredential(
  db: SaasMathDb,
  input: unknown,
): Promise<CredentialResult> {
  const parsed = parentLoginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, status: 400, error: INVALID_PARENT_CREDENTIALS };
  const { password } = parsed.data;
  const email = parsed.data.email.toLowerCase();
  const key = `parent-login:email:${email}`;
  if (loginRateLimiter.retryAfterSeconds(key) > 0) return locked();

  const found = await db.select().from(parents).where(eq(parents.email, email)).limit(1);
  const parent = found[0];
  if (!parent || !verifyPassword(password, parent.passwordHash)) {
    loginRateLimiter.recordFailure(key);
    return { ok: false, status: 401, error: INVALID_PARENT_CREDENTIALS };
  }
  loginRateLimiter.recordSuccess(key);
  return { ok: true, sub: parent.id, role: "parent" };
}

/**
 * Child login from the family device: name + PIN (no parent session needed).
 * Duplicate names deliberately push the family to the parent portal, where
 * the profile switcher disambiguates (loginChildById server action).
 */
export async function loginChildCredential(
  db: SaasMathDb,
  input: unknown,
): Promise<CredentialResult> {
  const parsed = childLoginSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      error: parsed.error.issues[0]?.message ?? "Data tidak valid.",
    };
  }
  const { name, pin } = parsed.data;
  const key = `child-login:name:${name.toLowerCase()}`;
  if (loginRateLimiter.retryAfterSeconds(key) > 0) return locked();

  const found = await db.select().from(children).where(eq(children.name, name));
  if (found.length === 0) {
    loginRateLimiter.recordFailure(key);
    return { ok: false, status: 401, error: INVALID_CHILD_CREDENTIALS };
  }
  if (found.length > 1) {
    loginRateLimiter.recordFailure(key);
    return { ok: false, status: 409, error: DUPLICATE_NAME };
  }
  const child = found[0];
  if (!verifyPassword(pin, child.pinHash)) {
    loginRateLimiter.recordFailure(key);
    return { ok: false, status: 401, error: INVALID_CHILD_CREDENTIALS };
  }
  loginRateLimiter.recordSuccess(key);
  return { ok: true, sub: child.id, role: "child" };
}
