import { describe, expect, it } from "vitest";

import {
  canAccessSkill,
  subscriptionAccess,
  trialEndsFrom,
  type SubscriptionFact,
} from "./island";

const NOW = new Date("2026-10-04T10:00:00Z");

const sub = (overrides: Partial<SubscriptionFact> = {}): SubscriptionFact => ({
  plan: "free",
  status: "active",
  trialEndsAt: null,
  ...overrides,
});

describe("subscriptionAccess (plan section 5: island free, trial unlocks all)", () => {
  it("free plan or no row: island only", () => {
    expect(subscriptionAccess(null, NOW)).toBe("free");
    expect(subscriptionAccess(sub({ plan: "free" }), NOW)).toBe("free");
  });

  it("unexpired trial: full access; expired trial: island only", () => {
    const ends = new Date("2026-10-10T00:00:00Z");
    expect(subscriptionAccess(sub({ plan: "trial", trialEndsAt: ends }), NOW)).toBe("full");
    const expired = new Date("2026-10-01T00:00:00Z");
    expect(subscriptionAccess(sub({ plan: "trial", trialEndsAt: expired }), NOW)).toBe("free");
    expect(subscriptionAccess(sub({ plan: "trial", trialEndsAt: null }), NOW)).toBe("free");
  });

  it("paid plans require an active status (pending checkout grants nothing)", () => {
    expect(subscriptionAccess(sub({ plan: "bulanan", status: "active" }), NOW)).toBe("full");
    expect(subscriptionAccess(sub({ plan: "bundle", status: "active" }), NOW)).toBe("full");
    expect(subscriptionAccess(sub({ plan: "bulanan", status: "pending" }), NOW)).toBe("free");
  });
});

describe("canAccessSkill", () => {
  it("free access only reaches island skills; full reaches everything", () => {
    expect(canAccessSkill("free", { isFreeIsland: true })).toBe(true);
    expect(canAccessSkill("free", { isFreeIsland: false })).toBe(false);
    expect(canAccessSkill("full", { isFreeIsland: false })).toBe(true);
  });
});

describe("trialEndsFrom", () => {
  it("adds the 7-day trial window", () => {
    expect(trialEndsFrom(NOW).toISOString()).toBe("2026-10-11T10:00:00.000Z");
  });
});
