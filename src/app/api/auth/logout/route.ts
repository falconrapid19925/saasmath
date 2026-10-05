import { clearSessionCookie } from "@/lib/server/authz";
import { handleRoute } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Clears the session cookie (parent or child). */
export async function POST() {
  return handleRoute(async () => {
    await clearSessionCookie();
    return Response.json({ ok: true });
  });
}
