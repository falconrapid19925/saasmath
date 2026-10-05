/**
 * Server-side placement support over the drill engine's diagnostic
 * (src/lib/engine/placement.ts). The engine generates the 20-item rung
 * ladder and decides the placed rung; this module adds the server-only
 * clamp: a placed rung whose skill is missing from the DB (content not
 * seeded yet — the engine flags this mismatch to the integrator) or is
 * outside the child's island access falls back to the deepest usable rung.
 */

import { PLACEMENT_RUNGS } from "../engine/placement";

/**
 * Index of the deepest rung at or above `placedRung` whose skill exists and
 * is island-accessible; null when no rung is usable (content missing).
 */
export function clampPlacementRung(
  placedRung: number,
  usableSkillIds: ReadonlySet<string>,
): number | null {
  for (let rung = Math.min(placedRung, PLACEMENT_RUNGS.length - 1); rung >= 0; rung--) {
    const rungSkillId = PLACEMENT_RUNGS[rung]?.skillId;
    if (rungSkillId && usableSkillIds.has(rungSkillId)) return rung;
  }
  return null;
}
