import { eq } from "drizzle-orm";

import { z } from "zod";

import { getDb } from "@/db";
import { children } from "@/db/schema";
import { verifyPassword } from "@/lib/auth";
import { setSessionCookie } from "@/lib/server/authz";
import { handleRoute, HttpError, parseJson } from "@/lib/server/http";
import { RATE_LIMITED_MESSAGE, clientIp, loginRateLimiter } from "@/lib/server/ratelimit";
import { pinSchema } from "@/lib/server/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({ childId: z.string().min(1), pin: pinSchema });

/** Child sign-in: profile id + PIN (scrypt-verified, same as passwords). */
export async function POST(req: Request) {
  return handleRoute(async () => {
    const ipKey = `child-login:ip:${clientIp(req)}`;
    if (loginRateLimiter.retryAfterSeconds(ipKey) > 0) {
      throw new HttpError(429, RATE_LIMITED_MESSAGE);
    }

    const body = await parseJson(req, bodySchema);
    const childKey = `child-login:child:${body.childId}`;
    if (loginRateLimiter.retryAfterSeconds(childKey) > 0) {
      throw new HttpError(429, RATE_LIMITED_MESSAGE);
    }

    const db = getDb();
    const rows = await db
      .select()
      .from(children)
      .where(eq(children.id, body.childId))
      .limit(1);
    const child = rows[0];
    // Same error for unknown profile and wrong PIN.
    if (!child || !verifyPassword(body.pin, child.pinHash)) {
      loginRateLimiter.recordFailure(ipKey);
      loginRateLimiter.recordFailure(childKey);
      throw new HttpError(401, "PIN salah");
    }

    loginRateLimiter.recordSuccess(ipKey);
    loginRateLimiter.recordSuccess(childKey);
    await setSessionCookie(child.id, "child");
    return Response.json({
      child: {
        id: child.id,
        name: child.name,
        grade: child.grade,
        avatar: child.avatar,
        starsBalance: child.starsBalance,
      },
    });
  });
}
