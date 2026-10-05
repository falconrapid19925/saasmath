/**
 * Free-island gating (plan sections 5 and 7): the first island is always
 * free; a 7-day full trial unlocks all kelas 4-5 content; paid plans unlock
 * everything. Payment-pending subscriptions stay restricted until the
 * Midtrans webhook activates them.
 *
 * NOTE vs the build ask: the ask compressed this to "free/trial restricted
 * to is_free_island skills", but plan section 5 states "a 7-day full trial
 * unlocks all kelas 4-5 content" and the schema carries trialEndsAt — the
 * plan is followed: trial = full access while unexpired, free afterwards.
 */

export type SubscriptionPlanName = "free" | "trial" | "bulanan" | "bundle";
/** "pending" rows exist (checkout started) but grant nothing until active. */
export type SubscriptionStatus = "pending" | "active";

export type SubscriptionFact = {
  plan: SubscriptionPlanName;
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
};

export type IslandAccess = "free" | "full";

/** Resolve a subscription row (or null = never subscribed) to access level. */
export function subscriptionAccess(
  subscription: SubscriptionFact | null,
  now: Date,
): IslandAccess {
  if (!subscription) return "free";
  switch (subscription.plan) {
    case "free":
      return "free";
    case "trial":
      return subscription.trialEndsAt !== null && subscription.trialEndsAt > now
        ? "full"
        : "free";
    case "bulanan":
    case "bundle":
      return subscription.status === "active" ? "full" : "free";
  }
}

/** Whether a child at the given access level may drill this skill. */
export function canAccessSkill(
  access: IslandAccess,
  skill: { isFreeIsland: boolean },
): boolean {
  return access === "full" || skill.isFreeIsland;
}

/** Trial expiry for a child starting (or restarting) the 7-day trial. */
export function trialEndsFrom(now: Date, days = 7): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}
