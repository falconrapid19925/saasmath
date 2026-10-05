/**
 * Deterministic set assembly (plan sections 3.1 step 2 and 6): a set is fully
 * determined by the (skillId, step, seed) triple. The canonical numeric seed
 * is setSeed(skillId, step, seed) — the same number stored in attempts.seed —
 * and the items come from the registered family. Item ids follow the contract
 * convention `${skillId}-s${step}-${seed}-${index}`.
 */

import { getFamily, registerBuiltinFamilies } from "./families";
import type { GeneratorFamilyId } from "./families";
import { createRng, setSeed } from "./rng";
import type { GeneratedSet, StepParams } from "./types";
import { computeSct } from "./sct";

export type GenerateSetInput = {
  skillId: string;
  step: number;
  seed: number;
  family: GeneratorFamilyId;
  /** Family params including itemCount (see the family's JSDoc for keys). */
  params: Record<string, unknown>;
  /** SCT inputs per plan 3.1 step 3 — required unless sctSeconds is given. */
  baseSctSecondsPerItem?: number;
  difficultyFactor?: number;
  /** Explicit override (e.g. pre-calibrated and tightened by the gate ladder). */
  sctSeconds?: number;
};

export function generateSet(input: GenerateSetInput): GeneratedSet {
  registerBuiltinFamilies();
  const family = getFamily(input.family);
  if (!family) {
    throw new Error(`generateSet: no family registered for "${input.family}"`);
  }
  if (!Number.isInteger(input.step) || input.step < 1) {
    throw new Error(`generateSet: step must be a 1-based integer, got ${input.step}`);
  }
  if (!Number.isInteger(input.seed)) {
    throw new Error(`generateSet: seed must be an integer, got ${input.seed}`);
  }

  const stepParams: StepParams = { step: input.step, params: input.params };
  const rng = createRng(setSeed(input.skillId, input.step, input.seed));
  const generated = family.generate(stepParams, rng);
  const items = generated.map((item, index) => ({
    ...item,
    id: `${input.skillId}-s${input.step}-${input.seed}-${index}`,
  }));

  const sctSeconds =
    input.sctSeconds ??
    computeSct(
      requireNumber(input.baseSctSecondsPerItem, "baseSctSecondsPerItem"),
      items.length,
      requireNumber(input.difficultyFactor, "difficultyFactor"),
    );

  return {
    skillId: input.skillId,
    step: input.step,
    seed: input.seed,
    items,
    sctSeconds,
  };
}

function requireNumber(value: number | undefined, key: string): number {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
    throw new Error(
      `generateSet: ${key} must be a non-negative number (or pass sctSeconds directly)`,
    );
  }
  return value;
}
