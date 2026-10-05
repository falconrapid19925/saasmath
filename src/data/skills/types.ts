/**
 * Typed authoring layer for the skill graph (plan sections 3.3 and 5).
 *
 * Skills are authored as SkillSpec objects via defineSkill(), which validates
 * each step's params against the family's zod schema at definition time —
 * bad content fails fast at import, not at drill time. The seed script and
 * the tests both build on these specs; the drill engine consumes the plain
 * StepParams[] through the skills table.
 */

import type { Grade, Strand } from "../../db/schema";
import type { GeneratorFamilyId } from "../../lib/engine/families";
import type { HintModel, StepParams } from "../../lib/engine/types";

import type { FamilyParams } from "./params";
import { STEP_PARAM_SCHEMAS } from "./params.ts";

/** A difficulty unit on the skill map (e.g. "Penjumlahan dan Pengurangan"). */
export type UnitDef = {
  grade: Grade;
  strand: Strand;
  /** 1-based unit number within grade+strand. */
  unit: number;
  /** Unit title in Bahasa Indonesia. */
  titleId: string;
  /** Skill ids in the unit, in display order. */
  skillIds: string[];
};

/** Fully-authored skill definition (mirrors the skills table row shape). */
export type SkillSpec = {
  /** Stable id, e.g. "k4-mult-2x1" (pattern: k<grade>-<slug>). */
  id: string;
  grade: Grade;
  strand: Strand;
  /** 1-based unit number within grade+strand (see UnitDef). */
  unit: number;
  /** Skill title in Bahasa Indonesia. */
  titleId: string;
  family: GeneratorFamilyId;
  /** Difficulty ladder, step 1..N; index 0 is the entry step. */
  steps: StepParams[];
  /** Prerequisite skill ids on the prerequisite graph. */
  prereqIds: string[];
  /** Authored SCT estimate, seconds per item (recalibrates from attempts). */
  baseSctSecondsPerItem: number;
  /** CPA hint models this skill supports (plan section 3.2). */
  cpaModels: HintModel[];
  /** Part of the free tier's first island (plan section 5). */
  isFreeIsland: boolean;
  /** Display order within grade+strand; assigned by the assembly in index.ts. */
  orderIndex: number;
};

/** Authoring input: steps are typed by the family, flags are derived later. */
export type SkillSpecInput<F extends GeneratorFamilyId> = {
  id: string;
  grade: Grade;
  strand: Strand;
  unit: number;
  titleId: string;
  family: F;
  /** Authored step params, in difficulty order; step numbers are assigned. */
  steps: FamilyParams<F>[];
  prereqIds: string[];
  baseSctSecondsPerItem: number;
  cpaModels?: HintModel[];
};

const SKILL_ID_PATTERN = /^k[45]-[a-z0-9]+(-[a-z0-9]+)*$/;

function zodMessage(error: {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
}): string {
  return error.issues
    .map((issue) => `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

/**
 * Validate and finalize one skill definition. Throws on invalid params,
 * malformed ids, bad prereq lists, or ladders outside 3-6 steps — content
 * errors must surface at import time, never at drill time.
 */
export function defineSkill<F extends GeneratorFamilyId>(input: SkillSpecInput<F>): SkillSpec {
  const { id, family, steps } = input;

  if (!SKILL_ID_PATTERN.test(id)) {
    throw new Error(`[${id}] skill id must match ${SKILL_ID_PATTERN}`);
  }
  const expectedGradePrefix = `k${input.grade}-`;
  if (!id.startsWith(expectedGradePrefix)) {
    throw new Error(`[${id}] id prefix must match grade ${input.grade} ("${expectedGradePrefix}")`);
  }
  if (steps.length < 3 || steps.length > 6) {
    throw new Error(`[${id}] needs 3-6 difficulty steps, got ${steps.length}`);
  }
  const stepSignatures = steps.map((params) => JSON.stringify(params));
  if (new Set(stepSignatures).size !== stepSignatures.length) {
    throw new Error(`[${id}] duplicate (identical) step params`);
  }
  if (
    !Number.isFinite(input.baseSctSecondsPerItem) ||
    input.baseSctSecondsPerItem < 1 ||
    input.baseSctSecondsPerItem > 600
  ) {
    throw new Error(`[${id}] baseSctSecondsPerItem must be a sane positive number`);
  }
  if (input.prereqIds.includes(id)) {
    throw new Error(`[${id}] cannot be its own prerequisite`);
  }
  if (new Set(input.prereqIds).size !== input.prereqIds.length) {
    throw new Error(`[${id}] duplicate prerequisite ids`);
  }
  const schema = STEP_PARAM_SCHEMAS[family];
  const validatedSteps: StepParams[] = steps.map((params, index) => {
    const parsed = schema.safeParse(params);
    if (!parsed.success) {
      throw new Error(
        `[${id}] step ${index + 1} params invalid for family "${family}": ${zodMessage(parsed.error)}`,
      );
    }
    return { step: index + 1, params: parsed.data as Record<string, unknown> };
  });

  return {
    id,
    grade: input.grade,
    strand: input.strand,
    unit: input.unit,
    titleId: input.titleId,
    family,
    steps: validatedSteps,
    prereqIds: [...input.prereqIds],
    baseSctSecondsPerItem: input.baseSctSecondsPerItem,
    cpaModels: input.cpaModels ? [...new Set(input.cpaModels)] : [],
    isFreeIsland: false, // derived in the assembly (index.ts) from unit layout
    orderIndex: -1, // assigned by the assembly (index.ts)
  };
}
