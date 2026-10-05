import { eq } from "drizzle-orm";

import { z } from "zod";

import { getDb } from "@/db";
import { parents } from "@/db/schema";
import { verifyPassword } from "@/lib/auth";
import { setSessionCookie } from "@/lib/server/authz";
import { handleRoute, HttpError, parseJson } from "@/lib/server/http";
import { RATE_LIMITED_MESSAGE, clientIp, loginRateLimiter } from "@/lib/server/ratelimit";
import { emailSchema, passwordSchema } from "@/lib/server/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({ email: emailSchema, password: passwordSchema });

export async function POST(req: Request) {
  return handleRoute(async () => {
    const ipKey = `parent-login:ip:${clientIp(req)}`;
    if (loginRateLimiter.retryAfterSeconds(ipKey) > 0) {
      throw new HttpError(429, RATE_LIMITED_MESSAGE);
    }

    const body = await parseJson(req, bodySchema);
    const email = body.email.toLowerCase();
    const emailKey = `parent-login:email:${email}`;
    if (loginRateLimiter.retryAfterSeconds(emailKey) > 0) {
      throw new HttpError(429, RATE_LIMITED_MESSAGE);
    }

    const db = getDb();
    const rows = await db
      .select()
      .from(parents)
      .where(eq(parents.email, email))
      .limit(1);
    const parent = rows[0];
    // Same error for unknown email and wrong password (no account probing).
    if (!parent || !verifyPassword(body.password, parent.passwordHash)) {
      loginRateLimiter.recordFailure(ipKey);
      loginRateLimiter.recordFailure(emailKey);
      throw new HttpError(401, "Email atau kata sandi salah");
    }

    loginRateLimiter.recordSuccess(ipKey);
    loginRateLimiter.recordSuccess(emailKey);
    await setSessionCookie(parent.id, "parent");
    return Response.json({
      parent: { id: parent.id, email: parent.email, name: parent.name },
    });
  });
}
