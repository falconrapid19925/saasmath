import { describe, expect, it } from "vitest";

import { PLACEMENT_RUNGS } from "../engine/placement";

import { clampPlacementRung } from "./placement";

describe("clampPlacementRung (server-only placement clamp)", () => {
  it("keeps the placed rung when its skill exists and is accessible", () => {
    const usable = new Set([PLACEMENT_RUNGS[4]!.skillId]);
    expect(clampPlacementRung(4, usable)).toBe(4);
  });

  it("falls back to the deepest usable rung at or below the placement", () => {
    const usable = new Set([PLACEMENT_RUNGS[1]!.skillId, PLACEMENT_RUNGS[6]!.skillId]);
    // Placed at rung 6 but only rungs 1 and 6 usable... 6 is usable: keep it.
    expect(clampPlacementRung(6, usable)).toBe(6);
    // Placed at rung 7 -> deepest usable is 6.
    expect(clampPlacementRung(7, usable)).toBe(6);
    // Placed at rung 4 -> deepest usable at or below is 1.
    expect(clampPlacementRung(4, usable)).toBe(1);
  });

  it("never returns a rung above the placement (deliberately easy start)", () => {
    const usable = new Set([PLACEMENT_RUNGS[8]!.skillId]);
    expect(clampPlacementRung(2, usable)).toBeNull();
  });

  it("returns null when no rung is usable (content not seeded)", () => {
    expect(clampPlacementRung(5, new Set())).toBeNull();
  });

  it("clamps an out-of-range placement to the ladder", () => {
    const usable = new Set([PLACEMENT_RUNGS[PLACEMENT_RUNGS.length - 1]!.skillId]);
    expect(clampPlacementRung(99, usable)).toBe(PLACEMENT_RUNGS.length - 1);
  });
});
