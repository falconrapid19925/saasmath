import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { parents } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { requireParentSession, setSessionCookie } from "@/lib/server/authz";
import { handleRoute, HttpError, parseJson } from "@/lib/server/http";
import { RATE_LIMITED_MESSAGE, clientIp, loginRateLimiter } from "@/lib/server/ratelimit";
import { emailSchema, passwordSchema } from "@/lib/server/schemas";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().min(2).max(80),
});

export async function POST(req: Request) {
  return handleRoute(async () => {
    const ipKey = `register:ip:${clientIp(req)}`;
    if (loginRateLimiter.retryAfterSeconds(ipKey) > 0) {
      throw new HttpError(429, RATE_LIMITED_MESSAGE);
    }

    const body = await parseJson(req, bodySchema);
    const email = body.email.toLowerCase();
    const emailKey = `register:email:${email}`;
    if (loginRateLimiter.retryAfterSeconds(emailKey) > 0) {
      throw new HttpError(429, RATE_LIMITED_MESSAGE);
    }

    const db = getDb();

    const existing = await db
      .select({ id: parents.id })
      .from(parents)
      .where(eq(parents.email, email))
      .limit(1);
    if (existing[0]) {
      loginRateLimiter.recordFailure(ipKey);
      loginRateLimiter.recordFailure(emailKey);
      throw new HttpError(409, "Email sudah terdaftar");
    }

    const inserted = await db
      .insert(parents)
      .values({
        email,
        passwordHash: hashPassword(body.password),
        name: body.name,
      })
      .returning({ id: parents.id, email: parents.email, name: parents.name });
    const parent = inserted[0];
    if (!parent) throw new HttpError(500, "Gagal membuat akun");

    loginRateLimiter.recordSuccess(ipKey);
    loginRateLimiter.recordSuccess(emailKey);
    await setSessionCookie(parent.id, "parent");
    return Response.json({ parent });
  });
}

/** GET: who am I (session check for the client). */
export async function GET() {
  return handleRoute(async () => {
    const session = await requireParentSession();
    const db = getDb();
    const rows = await db
      .select({ id: parents.id, email: parents.email, name: parents.name })
      .from(parents)
      .where(eq(parents.id, session.sub))
      .limit(1);
    if (!rows[0]) throw new HttpError(404, "Parent not found");
    return Response.json({ parent: rows[0] });
  });
}
