import { describe, expect, it } from "vitest";

import { STARS_PER_SET, STARS_SCT_BONUS, starsForSet } from "./stars";

/**
 * Worked examples pinning the predicted award to the server's rule
 * (src/lib/server/attempts.ts processAttempt: base 10 per set, +5 only when
 * accuracy >= 0.95 AND within the served SCT — no timed-mode special case,
 * because untimed CPA sets record timeMs 0 and the server computes
 * withinSct = 0 <= sctSeconds * 1000 = true for them).
 */
describe("starsForSet — the predicted award equals the server's award rule", () => {
  it("awards the base 10 for an accurate-but-below-bar set, even within SCT", () => {
    expect(starsForSet(0.8, true)).toBe(10);
    expect(starsForSet(0.85, true)).toBe(10);
    expect(starsForSet(0.9499, true)).toBe(10);
  });

  it("awards 15 for a clean within-SCT set, from exactly 95% up", () => {
    expect(starsForSet(0.95, true)).toBe(15);
    expect(starsForSet(19 / 20, true)).toBe(15);
    expect(starsForSet(1, true)).toBe(15);
  });

  it("awards the base 10 when over SCT, whatever the accuracy", () => {
    expect(starsForSet(1, false)).toBe(10);
    expect(starsForSet(0.5, false)).toBe(10);
  });

  it("a clean CPA set earns the bonus (untimed -> withinSct true)", () => {
    // CPA sets queue timeMs 0, so both the client prediction and the server
    // pipeline see withinSct = true; the accuracy bar is all that remains.
    expect(starsForSet(1, true)).toBe(15);
    expect(starsForSet(0.96, true)).toBe(15);
  });

  it("exposes the plan 4.2 constants the server awards by", () => {
    expect(STARS_PER_SET).toBe(10);
    expect(STARS_SCT_BONUS).toBe(5);
  });
});
