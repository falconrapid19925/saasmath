/**
 * Placement diagnostic (plan section 3.1 step 1): a short ladder of 10 rungs x
 * 2 items = 20 items climbing the kelas-4 Bilangan rungs, with a stop rule and
 * deliberately conservative placement — Kumon places below school grade on
 * purpose, so the child lands on the last rung they passed cleanly, never on
 * the rung they failed.
 *
 * Rungs use the placement skill ids below, which match the skills rows the
 * content builder ships in src/data/skills (see the note on PLACEMENT_RUNGS).
 * All rung params come from the families' documented defaults,
 * so this module needs no content rows to generate items.
 *
 * Flow:
 *  1. generatePlacementItems(seed) -> the full 20-item ladder, ids
 *     `placement-r{rung}-{index}` (rung recoverable from the id alone, so
 *     placement_results.items stays serializable).
 *  2. The runner may present rung by rung and stop early on the first failed
 *     rung (that is the stop rule; grading ignores anything after it anyway).
 *  3. placeFromResults(items, correct[]) -> PlacementOutcome with the placed
 *     (skillId, step).
 */

import { getFamily, registerBuiltinFamilies } from "./families";
import type { GeneratorFamilyId } from "./families";
import { createRng, setSeed } from "./rng";
import type { Item, StepParams } from "./types";

export const PLACEMENT_ITEMS_PER_RUNG = 2;
/** 10 rungs x 2 items: the plan's "roughly 15-20 items". */
export const PLACEMENT_RUNG_COUNT = 10;
export const PLACEMENT_TOTAL_ITEMS = PLACEMENT_ITEMS_PER_RUNG * PLACEMENT_RUNG_COUNT;

/** A rung passed = every item in it correct. */
export const PLACEMENT_PASS = "all-correct" as const;

export type PlacementRung = {
  skillId: string;
  family: GeneratorFamilyId;
  step: number;
  params: Record<string, unknown>;
};

/**
 * Kelas-4 Bilangan ladder, easy -> hard (plan section 3.3 kelas-4 list, with
 * the Kumon level C-D mirror in the middle).
 *
 * skillIds are retargeted (integrator, content-builder sync) to the ids the
 * content seed actually ships in src/data/skills — placement_results.placed_skill
 * has an FK to skills.id, so every rung must land on a seeded skill. Rung
 * family/step/params still drive diagnostic item generation and are unchanged.
 * Rungs 1/3/4/7 map into the free island (Bilangan units 1-2) so a free child
 * always has a placeable rung.
 */
export const PLACEMENT_RUNGS: readonly PlacementRung[] = [
  { skillId: "k4-add-1000", family: "addsub", step: 1, params: { max: 20, kinds: ["add", "sub"] } },
  { skillId: "k4-mult-facts", family: "mult", step: 1, params: { kinds: ["tables"], tablesMax: 10 } },
  { skillId: "k4-add-regroup", family: "addsub", step: 1, params: { max: 100, kinds: ["add", "sub"], regroup: true } },
  {
    skillId: "k4-placevalue-compare",
    family: "placevalue",
    step: 1,
    params: { max: 10000, kinds: ["compare", "order"] },
  },
  {
    skillId: "k4-div-facts",
    family: "div",
    step: 1,
    params: { kinds: ["quotient"], dividendMax: 100, divisorMax: 9 },
  },
  { skillId: "k4-mult-2x1", family: "mult", step: 1, params: { kinds: ["2x1"] } },
  {
    skillId: "k4-addsub-mixed",
    family: "addsub",
    step: 1,
    params: { max: 1000, kinds: ["add", "sub"], regroup: true },
  },
  {
    skillId: "k4-div-remainder",
    family: "div",
    step: 1,
    params: { kinds: ["remainder"], dividendMax: 100, divisorMax: 9 },
  },
  {
    skillId: "k4-fract-add-sameden",
    family: "fractions",
    step: 1,
    params: { kinds: ["addSame", "subSame", "compare", "equivalent"], maxDen: 6 },
  },
  {
    skillId: "k4-money-addsub",
    family: "money",
    step: 1,
    params: { kinds: ["add", "sub", "multiply"], maxTotal: 100000 },
  },
];

/** Rung index encoded in a placement item id, or null for foreign ids. */
export function placementRungIndex(itemId: string): number | null {
  const match = /^placement-r(\d+)-/.exec(itemId);
  if (!match) return null;
  const rung = Number(match[1]);
  return rung >= 0 && rung < PLACEMENT_RUNG_COUNT ? rung : null;
}

/** The full diagnostic ladder, deterministic in the seed. */
export function generatePlacementItems(seed: number): Item[] {
  registerBuiltinFamilies();
  const rng = createRng(setSeed("placement", 1, seed));
  const items: Item[] = [];
  PLACEMENT_RUNGS.forEach((rung, rungIndex) => {
    const stepParams: StepParams = {
      step: rung.step,
      params: { ...rung.params, itemCount: PLACEMENT_ITEMS_PER_RUNG },
    };
    const family = getFamily(rung.family);
    if (!family) throw new Error(`placement: family "${rung.family}" not registered`);
    const generated = family.generate(stepParams, rng);
    generated.forEach((item, i) => {
      items.push({ ...item, id: `placement-r${rungIndex}-${i}` });
    });
  });
  if (items.length !== PLACEMENT_TOTAL_ITEMS) {
    throw new Error("placement: ladder generator produced the wrong item count");
  }
  return items;
}

export type PlacementOutcome = {
  placedSkillId: string;
  placedStep: number;
  /** Highest rung fully passed; 0 when the child failed the very first rung. */
  lastPassedRung: number;
  /** First failed rung; null when the child cleared the whole ladder. */
  firstFailedRung: number | null;
  rungsAttempted: number;
  note: string;
};

/**
 * Stop-rule grading: walk rungs in order; the first rung with any wrong (or
 * missing) answer stops the climb. Placement lands on the LAST PASSED rung —
 * deliberately low (plan 3.1 step 1); a child who fails the first rung still
 * places at that bottom rung. Results after the stop are ignored, and a
 * results array shorter than the item list treats the missing tail as wrong.
 */
export function placeFromResults(items: readonly Item[], correct: readonly boolean[]): PlacementOutcome {
  if (correct.length > items.length) {
    throw new Error("placeFromResults: more results than items");
  }

  const indicesByRung = new Map<number, number[]>();
  items.forEach((item, index) => {
    const rung = placementRungIndex(item.id);
    if (rung === null) throw new Error(`placeFromResults: non-placement item id "${item.id}"`);
    const bucket = indicesByRung.get(rung) ?? [];
    bucket.push(index);
    indicesByRung.set(rung, bucket);
  });

  let lastPassedRung = 0;
  let firstFailedRung: number | null = null;
  let rungsAttempted = 0;

  for (let rung = 0; rung < PLACEMENT_RUNG_COUNT; rung++) {
    const indices = indicesByRung.get(rung);
    if (!indices || indices.length === 0) {
      firstFailedRung = firstFailedRung ?? rung;
      break;
    }
    rungsAttempted++;
    const passed = indices.every((i) => correct[i] === true);
    if (passed) {
      lastPassedRung = rung;
    } else {
      firstFailedRung = rung;
      break;
    }
  }

  const placed = PLACEMENT_RUNGS[lastPassedRung]!;
  const note =
    firstFailedRung === null
      ? "cleared the whole ladder; placed at the top kelas-4 rung"
      : lastPassedRung === firstFailedRung
        ? "failed the first rung; placed at the bottom rung (deliberately easy start)"
        : `stopped at rung ${firstFailedRung + 1}; placed on the last cleanly passed rung ${lastPassedRung + 1} (deliberately low)`;

  return {
    placedSkillId: placed.skillId,
    placedStep: placed.step,
    lastPassedRung,
    firstFailedRung,
    rungsAttempted,
    note,
  };
}
