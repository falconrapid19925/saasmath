/**
 * Request-time curriculum loading: island-accessible skills for a child
 * (grade filter + free-island gating, plan sections 5 and 7). Used by
 * /api/session/next and /api/placement.
 */

import { and, asc, eq } from "drizzle-orm";

import type { SaasMathDb } from "@/db";
import { skills, subscriptions, type Child, type Skill } from "@/db/schema";

import { canAccessSkill, subscriptionAccess, type IslandAccess } from "./island";

export type SubscriptionRowLike = {
  plan: typeof subscriptions.$inferSelect.plan;
  status?: typeof subscriptions.$inferSelect.status;
  trialEndsAt: typeof subscriptions.$inferSelect.trialEndsAt;
};

/** Load the child's subscription row (or null) and resolve access level. */
export async function loadIslandAccess(
  db: SaasMathDb,
  childId: string,
  now: Date,
): Promise<IslandAccess> {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.childId, childId))
    .limit(1);
  const row = rows[0];
  return subscriptionAccess(
    row
      ? {
          plan: row.plan,
          // status column arrives with the shared schema change; until then a
          // missing value is treated as "active" (rows default to free anyway).
          status: row.status ?? "active",
          trialEndsAt: row.trialEndsAt,
        }
      : null,
    now,
  );
}

/**
 * Island-accessible skills for the child's grade in ladder order
 * (orderIndex), plus the resolved access level for the response.
 */
export async function loadAccessibleSkills(
  db: SaasMathDb,
  child: Pick<Child, "id" | "grade">,
  now: Date,
): Promise<{ access: IslandAccess; skills: Skill[] }> {
  // Access level and the grade's skill ladder are independent reads.
  const [access, rows] = await Promise.all([
    loadIslandAccess(db, child.id, now),
    db
      .select()
      .from(skills)
      .where(and(eq(skills.grade, child.grade)))
      .orderBy(asc(skills.orderIndex)),
  ]);
  return { access, skills: rows.filter((skill) => canAccessSkill(access, skill)) };
}
