import { describe, expect, it } from "vitest";

import { ELO, provisionalStepDifficulty } from "../engine/elo";

import { masteryEloUpdate } from "./elo";

/**
 * The engine owns the Elo math (src/lib/engine/elo.ts, with its own
 * constants and uncertainty schedule). This pins the server adapter: the
 * mastery row's (eloRating, eloN) round-trips through set-level updates.
 */
describe("masteryEloUpdate (server adapter)", () => {
  it("starts from the engine's INITIAL_ELO when no mastery row exists", () => {
    const result = masteryEloUpdate(null, 1, [true, true, true, true]);
    expect(result.eloN).toBe(4); // one update per answered item
    expect(result.eloRating).toBeGreaterThan(ELO.INITIAL_RATING); // all correct
  });

  it("moves the rating up on correct sets and down on failed ones", () => {
    const current = { eloRating: 1000, eloN: 10 };
    const up = masteryEloUpdate(current, 1, [true, true, true, true, true]);
    const down = masteryEloUpdate(current, 1, [false, false, false, false, false]);
    expect(up.eloRating).toBeGreaterThan(current.eloRating);
    expect(down.eloRating).toBeLessThan(current.eloRating);
    expect(up.eloN).toBe(15);
    expect(down.eloN).toBe(15);
  });

  it("uses the engine's provisional step difficulty (harder steps rate higher)", () => {
    // A perfect set at step 5 (difficulty 1000 + 4*40) must yield a bigger
    // gain than the same set at step 1 (difficulty 1000).
    const atStep1 = masteryEloUpdate({ eloRating: 1000, eloN: 0 }, 1, [true, true]);
    const atStep5 = masteryEloUpdate({ eloRating: 1000, eloN: 0 }, 5, [true, true]);
    expect(atStep5.eloRating).toBeGreaterThan(atStep1.eloRating);
    expect(provisionalStepDifficulty(5)).toBe(1000 + 4 * ELO.STEP_DIFFICULTY_PER_STEP);
  });
});
