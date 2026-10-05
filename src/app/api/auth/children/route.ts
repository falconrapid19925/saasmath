import { eq } from "drizzle-orm";

import { z } from "zod";

import { getDb } from "@/db";
import { children, streaks, subscriptions } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { requireParentSession, setSessionCookie } from "@/lib/server/authz";
import { handleRoute, HttpError, parseJson } from "@/lib/server/http";
import { INITIAL_FREEZES } from "@/lib/server/streak";
import { gradeSchema, pinSchema } from "@/lib/server/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const createBodySchema = z.object({
  name: z.string().min(1).max(60),
  grade: gradeSchema,
  pin: pinSchema,
});

/** GET: list the parent's children (profile picker for child sign-in). */
export async function GET() {
  return handleRoute(async () => {
    const session = await requireParentSession();
    const db = getDb();
    const rows = await db
      .select({
        id: children.id,
        name: children.name,
        grade: children.grade,
        avatar: children.avatar,
        starsBalance: children.starsBalance,
      })
      .from(children)
      .where(eq(children.parentId, session.sub));
    return Response.json({ children: rows });
  });
}

/**
 * POST: create a child profile (parent session required). Bootstraps the
 * one-to-one rows the drill loop relies on: streaks (2 freeze tokens, plan
 * 4.1) and a free subscription. PIN is stored scrypt-hashed.
 */
export async function POST(req: Request) {
  return handleRoute(async () => {
    const session = await requireParentSession();
    const body = await parseJson(req, createBodySchema);
    const db = getDb();

    const inserted = await db
      .insert(children)
      .values({
        parentId: session.sub,
        name: body.name,
        grade: body.grade,
        pinHash: hashPassword(body.pin),
      })
      .returning({
        id: children.id,
        name: children.name,
        grade: children.grade,
        starsBalance: children.starsBalance,
      });
    const child = inserted[0];
    if (!child) throw new HttpError(500, "Gagal membuat profil anak");

    await db.insert(streaks).values({ childId: child.id, freezesLeft: INITIAL_FREEZES });
    await db.insert(subscriptions).values({ childId: child.id, plan: "free" });

    // The parent immediately receives the child session on this device
    // (single-family device is the norm; PIN gates subsequent sign-ins).
    await setSessionCookie(child.id, "child");
    return Response.json({ child }, { status: 201 });
  });
}
