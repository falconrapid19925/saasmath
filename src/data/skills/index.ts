/**
 * Skill-graph assembly: concatenates the authored grade files, cross-checks
 * the unit layout, derives the free island (plan section 5: the first two
 * units of the kelas-4 Bilangan strand), assigns orderIndex, and exposes the
 * DB row mapper used by the seed script.
 *
 * Every inconsistency throws at import time — content bugs must never reach
 * the drill loop. The full graph property tests live in src/data/content.test.ts.
 */

import type { Skill } from "../../db/schema";

import {
  K4_BILANGAN_SKILLS,
  K4_BILANGAN_UNITS,
  K4_DATA_SKILLS,
  K4_DATA_UNITS,
  K4_GEOMETRI_SKILLS,
  K4_GEOMETRI_UNITS,
  K4_PENGUKURAN_SKILLS,
  K4_PENGUKURAN_UNITS,
} from "./kelas4.ts";
import {
  K5_BILANGAN_SKILLS,
  K5_BILANGAN_UNITS,
  K5_DATA_SKILLS,
  K5_DATA_UNITS,
  K5_GEOMETRI_SKILLS,
  K5_GEOMETRI_UNITS,
  K5_PENGUKURAN_SKILLS,
  K5_PENGUKURAN_UNITS,
} from "./kelas5.ts";
import type { SkillSpec, UnitDef } from "./types";

// Runtime re-exports need explicit .ts extensions: the seed script loads this
// graph through Node's native TypeScript stripping, which resolves relative
// imports literally.
export * from "./params.ts";
export * from "./types.ts";

/** Launch free tier (plan section 5): the first two units of k4 Bilangan. */
const FREE_ISLAND_UNITS = 2;

/** Free-island unit keys, in order. */
const FREE_ISLAND_UNIT_KEYS = K4_BILANGAN_UNITS.slice(0, FREE_ISLAND_UNITS).map(
  (unitDef) => `${unitDef.grade}:${unitDef.strand}:${unitDef.unit}`,
);

function buildSkillSpecs(): SkillSpec[] {
  const authored = [
    ...K4_BILANGAN_SKILLS,
    ...K4_PENGUKURAN_SKILLS,
    ...K4_GEOMETRI_SKILLS,
    ...K4_DATA_SKILLS,
    ...K5_BILANGAN_SKILLS,
    ...K5_PENGUKURAN_SKILLS,
    ...K5_GEOMETRI_SKILLS,
    ...K5_DATA_SKILLS,
  ].map((skill) => ({ ...skill }));

  const byId = new Map<string, SkillSpec>();
  for (const skill of authored) {
    if (byId.has(skill.id)) {
      throw new Error(`Duplicate skill id: ${skill.id}`);
    }
    byId.set(skill.id, skill);
  }

  // Prerequisites must resolve.
  for (const skill of authored) {
    for (const prereqId of skill.prereqIds) {
      if (!byId.has(prereqId)) {
        throw new Error(`[${skill.id}] unknown prerequisite: ${prereqId}`);
      }
    }
  }

  // Unit layout must partition the skills exactly.
  const unitDefs = allUnitDefs();
  const unitsBySkillId = new Map<string, UnitDef>();
  for (const unitDef of unitDefs) {
    for (const skillId of unitDef.skillIds) {
      const existing = unitsBySkillId.get(skillId);
      if (existing) {
        throw new Error(`Skill ${skillId} listed in two units (${existing.titleId}, ${unitDef.titleId})`);
      }
      unitsBySkillId.set(skillId, unitDef);
    }
  }
  for (const skill of authored) {
    const unitDef = unitsBySkillId.get(skill.id);
    if (!unitDef) {
      throw new Error(`[${skill.id}] not listed in any unit`);
    }
    if (unitDef.grade !== skill.grade || unitDef.strand !== skill.strand || unitDef.unit !== skill.unit) {
      throw new Error(`[${skill.id}] unit metadata mismatch with ${unitDef.titleId}`);
    }
    skill.isFreeIsland = FREE_ISLAND_UNIT_KEYS.includes(
      `${unitDef.grade}:${unitDef.strand}:${unitDef.unit}`,
    );
  }

  // orderIndex: authored array order within each (grade, strand) group.
  const counters = new Map<string, number>();
  for (const skill of authored) {
    const key = `${skill.grade}:${skill.strand}`;
    const next = counters.get(key) ?? 0;
    skill.orderIndex = next;
    counters.set(key, next + 1);
  }

  return authored;
}

function allUnitDefs(): UnitDef[] {
  return [
    ...K4_BILANGAN_UNITS,
    ...K4_PENGUKURAN_UNITS,
    ...K4_GEOMETRI_UNITS,
    ...K4_DATA_UNITS,
    ...K5_BILANGAN_UNITS,
    ...K5_PENGUKURAN_UNITS,
    ...K5_GEOMETRI_UNITS,
    ...K5_DATA_UNITS,
  ];
}

/** All authored launch skills (kelas 4-5), validated and ordered. */
export const SKILL_SPECS: SkillSpec[] = buildSkillSpecs();

const SPECS_BY_ID: Map<string, SkillSpec> = new Map(
  SKILL_SPECS.map((skill) => [skill.id, skill]),
);

/** Unit layout for the skill map UI (not persisted; DB has no unit column). */
export const UNIT_DEFS: UnitDef[] = allUnitDefs();

/** Free-island skill ids, in display order (plan section 5). */
export const FREE_ISLAND_SKILL_IDS: string[] = SKILL_SPECS.filter(
  (skill) => skill.isFreeIsland,
).map((skill) => skill.id);

/** Look up one authored spec; throws on unknown id (content bug, not data). */
export function getSkillSpec(id: string): SkillSpec {
  const spec = SPECS_BY_ID.get(id);
  if (!spec) throw new Error(`Unknown skill id: ${id}`);
  return spec;
}

/**
 * Map a spec to the exact skills-table row shape (identical to
 * skills.$inferInsert for this table, whose columns are all content). Kept
 * pure and exported so the seed script stays thin and the tests can pin the
 * mapping. Type-only schema import: erased at runtime, so client bundles
 * never pull in drizzle.
 */
export function skillSpecToRow(spec: SkillSpec): Skill {
  return {
    id: spec.id,
    grade: spec.grade,
    strand: spec.strand,
    titleId: spec.titleId,
    family: spec.family,
    steps: spec.steps,
    prereqIds: spec.prereqIds,
    baseSctSecondsPerItem: spec.baseSctSecondsPerItem,
    cpaModels: spec.cpaModels,
    isFreeIsland: spec.isFreeIsland,
    orderIndex: spec.orderIndex,
  };
}
