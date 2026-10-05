/**
 * Request-time glue between the API and the drill engine (plan section 6:
 * "the server decides the next task, skill plus step plus seed"). Loads
 * skills and regenerates the exact items a (skill, step, seed) triple
 * produces — the client regenerates the same items offline from the seed.
 * All functions are called inside handlers — never at module scope.
 *
 * Seed convention: attempts.seed stores the seed value passed to the engine's
 * generateSet, which canonicalizes internally (createRng(setSeed(skillId,
 * step, seed))) and stamps item ids `${skillId}-s${step}-${seed}-${index}`.
 */

import { eq } from "drizzle-orm";

import type { SaasMathDb } from "@/db";
import { skills, type Skill } from "@/db/schema";
import {
  GENERATOR_FAMILY_IDS,
  type GeneratorFamilyId,
} from "../engine/families";
import { generateSet } from "../engine/set";
import type { Item, StepParams } from "../engine/types";

import { HttpError } from "./http";
import { difficultyFactorForStep } from "./sct";
import { engineParamsFor } from "./family-params";

export function isGeneratorFamilyId(value: string): value is GeneratorFamilyId {
  return (GENERATOR_FAMILY_IDS as readonly string[]).includes(value);
}

/** Load one skill or 404. */
export async function loadSkill(db: SaasMathDb, skillId: string): Promise<Skill> {
  const rows = await db.select().from(skills).where(eq(skills.id, skillId)).limit(1);
  const skill = rows[0];
  if (!skill) throw new HttpError(404, `Skill not found: ${skillId}`);
  return skill;
}

/** Step params for a 1-based step, validated. */
export function stepParamsFor(skill: Skill, step: number): StepParams {
  const params = skill.steps[step - 1];
  if (!params) {
    throw new HttpError(
      400,
      `Skill ${skill.id} has no step ${step} (has ${skill.steps.length})`,
    );
  }
  return params;
}

/** A fresh seed value for a set (stored verbatim in attempts.seed). */
export function newSetSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] as number;
}

/**
 * Regenerate the items for a stored (skill, step, seed) triple via the
 * engine's registered generator families. 503 when the family cannot
 * produce a set (unregistered/unknown family or content bug).
 */
export function generateSetItems(skill: Skill, step: number, seed: number): Item[] {
  if (!isGeneratorFamilyId(skill.family)) {
    throw new HttpError(500, `Skill ${skill.id} has unknown family "${skill.family}"`);
  }
  try {
    return generateSet({
      skillId: skill.id,
      step,
      seed,
      family: skill.family,
      // skills.steps store the AUTHORED params (src/data/skills/params.ts);
      // translate them into the family convention here — the single point
      // where authored content enters the generators.
      params: engineParamsFor(skill.family, stepParamsFor(skill, step).params),
      baseSctSecondsPerItem: skill.baseSctSecondsPerItem,
      difficultyFactor: difficultyFactorForStep(step),
    }).items;
  } catch (error) {
    throw new HttpError(
      503,
      `Set generation failed for ${skill.id} step ${step}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
