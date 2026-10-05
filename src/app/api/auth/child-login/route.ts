/**
 * POST /api/auth/child-login — child name + PIN sign-in on the family device.
 * A credential-establishing endpoint: it runs for anonymous callers by design
 * (see src/lib/server/credentials.ts). Duplicate child names answer 409 so
 * the family switches to the parent-portal profile switcher. Failed attempts
 * are counted per name (inside credentials.ts) and per IP (here).
 */

import { getDb } from "@/db";
import { loginChildCredential } from "@/lib/server/credentials";
import { setSessionCookie } from "@/lib/server/authz";
import { handleRoute } from "@/lib/server/http";
import { RATE_LIMITED_MESSAGE, clientIp, loginRateLimiter } from "@/lib/server/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  return handleRoute(async () => {
    const ipKey = `child-login:ip:${clientIp(req)}`;
    if (loginRateLimiter.retryAfterSeconds(ipKey) > 0) {
      return Response.json({ ok: false, error: RATE_LIMITED_MESSAGE }, { status: 429 });
    }

    const raw: unknown = await req.json().catch(() => null);
    const result = await loginChildCredential(getDb(), raw);
    if (result.ok) {
      loginRateLimiter.recordSuccess(ipKey);
      await setSessionCookie(result.sub, result.role);
      return Response.json({ ok: true });
    }
    if (result.status === 401 || result.status === 409) {
      loginRateLimiter.recordFailure(ipKey);
    }
    return Response.json({ ok: false, error: result.error }, { status: result.status });
  });
}
