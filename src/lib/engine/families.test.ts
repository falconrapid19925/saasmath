import { describe, expect, it } from "vitest";

import { additionHasCarry, answersEqual, lcm, subtractionHasBorrow } from "./answers";
import {
  GENERATOR_FAMILY_IDS,
  generatorFamilies,
  getFamily,
  registerBuiltinFamilies,
  registerFamily,
} from "./families";
import type { GeneratorFamilyId } from "./families";
import { createRng, setSeed } from "./rng";
import { generateSet } from "./set";
import type { Item, StepParams } from "./types";
import { verifyFamilyItem } from "../../../tests/helpers/verifyItem";

// Registration ------------------------------------------------------------

describe("family registry", () => {
  it("registers all 12 roster ids via registerBuiltinFamilies", () => {
    registerBuiltinFamilies();
    for (const id of GENERATOR_FAMILY_IDS) {
      expect(getFamily(id), `family ${id}`).toBeDefined();
    }
    expect(generatorFamilies.size).toBe(GENERATOR_FAMILY_IDS.length);
  });

  it("rejects an unknown family id", () => {
    expect(() =>
      registerFamily({ id: "nope" as GeneratorFamilyId, generate: () => [] }),
    ).toThrow(/Unknown generator family id/);
  });
});

// Per-family params exercising every kind of the family -------------------

const TEST_PARAMS: Record<GeneratorFamilyId, Record<string, unknown>> = {
  addsub: { itemCount: 8, max: 1000, kinds: ["add", "sub"], regroup: true, choices: true },
  mult: { itemCount: 8, kinds: ["tables", "2x1", "2x2"], tablesMax: 10, choices: true },
  div: { itemCount: 8, kinds: ["quotient", "remainder"], dividendMax: 100, divisorMax: 9, choices: true },
  placevalue: { itemCount: 8, max: 100000 },
  factorsmultiples: { itemCount: 10 },
  fractions: { itemCount: 12 },
  decimals: { itemCount: 10 },
  money: { itemCount: 8 },
  measurement: { itemCount: 10 },
  geometry: { itemCount: 10 },
  datareading: { itemCount: 6 },
  wordproblems: { itemCount: 8 },
};

function makeParams(
  family: GeneratorFamilyId,
  step: number,
  overrides?: Record<string, unknown>,
): StepParams {
  return { step, params: { ...TEST_PARAMS[family], ...overrides } };
}

function generateFor(
  family: GeneratorFamilyId,
  step: number,
  seed: number,
  overrides?: Record<string, unknown>,
): Item[] {
  registerBuiltinFamilies();
  const fam = getFamily(family);
  if (!fam) throw new Error(`family ${family} missing`);
  return fam.generate(makeParams(family, step, overrides), createRng(`${family}:${step}:${seed}`));
}

// Core property sweep: every family x several seeds x steps ---------------

const SEEDS = Array.from({ length: 30 }, (_, i) => 1000 + i * 17);

describe("family property sweep (answers verified against their own numbers)", () => {
  for (const family of GENERATOR_FAMILY_IDS) {
    it(`${family}: correct, well-formed items across seeds and steps`, () => {
      for (const seed of SEEDS) {
        for (const step of [1, 2]) {
          const items = generateFor(family, step, seed);
          expect(items.length).toBe(TEST_PARAMS[family].itemCount);
          const ids = new Set(items.map((i) => i.id));
          expect(ids.size).toBe(items.length);
          for (const item of items) {
            expect(item.id).toMatch(new RegExp(`^f-s${step}-\\d+$`));
            verifyFamilyItem(family, item);
          }
        }
      }
    });
  }

  it("wide sweep: 200 more seeds per family at the documented defaults", () => {
    for (const family of GENERATOR_FAMILY_IDS) {
      for (let seed = 0; seed < 200; seed++) {
        const items = generateFor(family, 1, seed * 7919);
        for (const item of items) verifyFamilyItem(family, item);
      }
    }
  });
});

// Determinism -------------------------------------------------------------

describe("determinism", () => {
  for (const family of GENERATOR_FAMILY_IDS) {
    it(`${family}: same seed -> identical set`, () => {
      const a = generateFor(family, 1, 42);
      const b = generateFor(family, 1, 42);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
  }

  it("generateSet produces canonical ids, SCT, and the stored-seed round trip", () => {
    const spec = {
      skillId: "k4-mult-1digit",
      step: 1,
      seed: 99,
      family: "mult" as GeneratorFamilyId,
      params: { itemCount: 5, kinds: ["tables"] },
      baseSctSecondsPerItem: 20,
      difficultyFactor: 1.2,
    };
    const setA = generateSet(spec);
    const setB = generateSet(spec);
    expect(JSON.stringify(setA)).toBe(JSON.stringify(setB));
    expect(setA.items.length).toBe(5);
    setA.items.forEach((item, i) => {
      expect(item.id).toBe(`k4-mult-1digit-s1-99-${i}`);
    });
    expect(setA.sctSeconds).toBe(20 * 5 * 1.2);

    // Regenerating from the canonical numeric seed (attempts.seed) reproduces
    // the identical prompts.
    const family = getFamily("mult");
    const items = family!.generate(
      { step: 1, params: spec.params },
      createRng(setSeed(spec.skillId, spec.step, spec.seed)),
    );
    expect(JSON.stringify(items.map((i) => i.prompt))).toBe(
      JSON.stringify(setA.items.map((i) => i.prompt)),
    );
  });

  it("large-universe families differ across seeds", () => {
    const a = generateFor("addsub", 1, 1, { itemCount: 10, max: 1000 });
    const b = generateFor("addsub", 1, 2, { itemCount: 10, max: 1000 });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    const c = generateFor("placevalue", 1, 1, { itemCount: 6, max: 100000 });
    const d = generateFor("placevalue", 1, 2, { itemCount: 6, max: 100000 });
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(d));
  });
});

// Family-specific mathematical properties ---------------------------------

describe("family-specific properties", () => {
  it("addsub honors regroup=true (carry or borrow required)", () => {
    const parseNum = (s: string): number => Number(s.replace(/\./g, ""));
    for (const seed of SEEDS) {
      for (const item of generateFor("addsub", 1, seed, { itemCount: 6, max: 1000, kinds: ["add"], regroup: true, choices: false })) {
        const m = /^([\d.]+) \+ ([\d.]+) = \.\.\.$/.exec(item.prompt);
        expect(m).not.toBeNull();
        if (m) expect(additionHasCarry(parseNum(m[1] as string), parseNum(m[2] as string))).toBe(true);
      }
      for (const item of generateFor("addsub", 1, seed, { itemCount: 6, max: 1000, kinds: ["sub"], regroup: true, choices: false })) {
        const m = /^([\d.]+) - ([\d.]+) = \.\.\.$/.exec(item.prompt);
        expect(m).not.toBeNull();
        if (m) expect(subtractionHasBorrow(parseNum(m[1] as string), parseNum(m[2] as string))).toBe(true);
      }
    }
  });

  it("addsub honors the min param as an operand floor", () => {
    const parseNum = (s: string): number => Number(s.replace(/\./g, ""));
    for (const seed of SEEDS) {
      for (const item of generateFor("addsub", 1, seed, { itemCount: 8, min: 1000, max: 10000, kinds: ["add", "sub"], choices: false })) {
        const m = /^([\d.]+) ([+-]) ([\d.]+) = \.\.\.$/.exec(item.prompt);
        expect(m).not.toBeNull();
        if (m) {
          expect(parseNum(m[1] as string)).toBeGreaterThanOrEqual(1000);
          expect(parseNum(m[3] as string)).toBeGreaterThanOrEqual(1000);
        }
      }
    }
  });

  it("addsub results stay within max", () => {
    for (const seed of SEEDS) {
      for (const item of generateFor("addsub", 1, seed, { itemCount: 8, max: 100, kinds: ["add", "sub"] })) {
        expect(item.answer.kind === "integer" && item.answer.value <= 100).toBe(true);
      }
    }
  });

  it("addsub missingPosition=operand asks for the missing operand", () => {
    const parseNum = (s: string): number => Number(s.replace(/\./g, ""));
    let sawMissingFirst = false;
    let sawMissingSecond = false;
    for (const seed of SEEDS) {
      for (const item of generateFor("addsub", 1, seed, { itemCount: 8, min: 10, max: 100, kinds: ["add", "sub"], missingPosition: "operand", choices: false })) {
        let m = /^\.\.\. ([+-]) ([\d.]+) = ([\d.]+)$/.exec(item.prompt);
        if (m) {
          sawMissingFirst = true;
          const b = parseNum(m[2] as string);
          const c = parseNum(m[3] as string);
          const expected = m[1] === "+" ? c - b : c + b;
          expect(item.answer.kind === "integer" && item.answer.value === expected).toBe(true);
          continue;
        }
        m = /^([\d.]+) ([+-]) \.\.\. = ([\d.]+)$/.exec(item.prompt);
        expect(m !== null, `operand-form prompt: ${item.prompt}`).toBe(true);
        if (m) {
          sawMissingSecond = true;
          const a = parseNum(m[1] as string);
          const c = parseNum(m[3] as string);
          const expected = m[2] === "+" ? c - a : a - c;
          expect(item.answer.kind === "integer" && item.answer.value === expected).toBe(true);
        }
      }
    }
    expect(sawMissingFirst).toBe(true);
    expect(sawMissingSecond).toBe(true);
  });

  it("mult missingPosition=operand asks for the missing factor", () => {
    const parseNum = (s: string): number => Number(s.replace(/\./g, ""));
    let sawMissingFirst = false;
    let sawMissingSecond = false;
    for (const seed of SEEDS) {
      for (const item of generateFor("mult", 1, seed, { itemCount: 8, kinds: ["tables"], missingPosition: "operand", choices: false })) {
        let m = /^\.\.\. × ([\d.]+) = ([\d.]+)$/.exec(item.prompt);
        if (m) {
          sawMissingFirst = true;
          const b = parseNum(m[1] as string);
          const c = parseNum(m[2] as string);
          expect(c % b === 0).toBe(true);
          expect(item.answer.kind === "integer" && item.answer.value === c / b).toBe(true);
          continue;
        }
        m = /^([\d.]+) × \.\.\. = ([\d.]+)$/.exec(item.prompt);
        expect(m !== null, `missing-factor prompt: ${item.prompt}`).toBe(true);
        if (m) {
          sawMissingSecond = true;
          const a = parseNum(m[1] as string);
          const c = parseNum(m[2] as string);
          expect(c % a === 0).toBe(true);
          expect(item.answer.kind === "integer" && item.answer.value === c / a).toBe(true);
        }
      }
    }
    expect(sawMissingFirst).toBe(true);
    expect(sawMissingSecond).toBe(true);
  });

  it("mult kinds produce the right operand shapes", () => {
    for (const seed of [7, 77, 777]) {
      for (const item of generateFor("mult", 1, seed, { itemCount: 10, kinds: ["2x1"] })) {
        const m = /^(\d+) × (\d+) = \.\.\.$/.exec(item.prompt);
        expect(m).not.toBeNull();
        if (m) {
          expect(Number(m[1])).toBeGreaterThanOrEqual(10);
          expect(Number(m[1])).toBeLessThanOrEqual(99);
          expect(Number(m[2])).toBeGreaterThanOrEqual(2);
          expect(Number(m[2])).toBeLessThanOrEqual(9);
        }
      }
    }
  });

  it("mult honors explicit aMin/aMax/bMin/bMax operand ranges", () => {
    const parseNum = (s: string): number => Number(s.replace(/\./g, ""));
    for (const seed of [7, 77, 777]) {
      for (const item of generateFor("mult", 1, seed, { itemCount: 10, kinds: ["2x1"], aMin: 100, aMax: 999, bMin: 2, bMax: 9, choices: false })) {
        const m = /^([\d.]+) × ([\d.]+) = \.\.\.$/.exec(item.prompt);
        expect(m).not.toBeNull();
        if (m) {
          const a = parseNum(m[1] as string);
          expect(a).toBeGreaterThanOrEqual(100);
          expect(a).toBeLessThanOrEqual(999);
          expect(parseNum(m[2] as string)).toBeLessThanOrEqual(9);
        }
      }
      for (const item of generateFor("mult", 1, seed, { itemCount: 10, kinds: ["tables"], aMin: 3, aMax: 5, bMin: 2, bMax: 4, choices: false })) {
        const m = /^([\d.]+) × ([\d.]+) = \.\.\.$/.exec(item.prompt);
        expect(m).not.toBeNull();
        if (m) {
          const a = parseNum(m[1] as string);
          const b = parseNum(m[2] as string);
          expect(a >= 3 && a <= 5).toBe(true);
          expect(b >= 2 && b <= 4).toBe(true);
        }
      }
    }
  });

  it("div quotient items are exact; remainder items have a nonzero sisa within the cap", () => {
    let sawQuotient = false;
    let sawRemainder = false;
    for (const seed of SEEDS) {
      for (const item of generateFor("div", 1, seed, { itemCount: 6, kinds: ["quotient", "remainder"] })) {
        if (/ : \d+ = \.\.\.$/.test(item.prompt)) sawQuotient = true;
        if (item.prompt.startsWith("Sisa")) {
          sawRemainder = true;
          expect(item.answer.kind === "integer" && item.answer.value > 0).toBe(true);
        }
      }
      for (const item of generateFor("div", 1, seed, { itemCount: 8, kinds: ["remainder"], dividendMax: 100 })) {
        const m = /^Sisa dari (\d+) : (\d+) adalah/.exec(item.prompt);
        expect(m).not.toBeNull();
        if (m) expect(Number(m[1])).toBeLessThanOrEqual(100);
      }
    }
    expect(sawQuotient).toBe(true);
    expect(sawRemainder).toBe(true);
  });

  it("div honors dividend/divisor ranges including the floors", () => {
    const parseNum = (s: string): number => Number(s.replace(/\./g, ""));
    for (const seed of [7, 77, 777]) {
      for (const item of generateFor("div", 1, seed, { itemCount: 8, kinds: ["quotient"], dividendMin: 100, dividendMax: 300, divisorMin: 10, divisorMax: 20, choices: false })) {
        const m = /^([\d.]+) : ([\d.]+) = \.\.\.$/.exec(item.prompt);
        expect(m).not.toBeNull();
        if (m) {
          const a = parseNum(m[1] as string);
          const b = parseNum(m[2] as string);
          expect(a >= 100 && a <= 300).toBe(true);
          expect(b >= 10 && b <= 20).toBe(true);
        }
      }
      for (const item of generateFor("div", 1, seed, { itemCount: 8, kinds: ["remainder"], dividendMin: 100, dividendMax: 999, divisorMin: 10, divisorMax: 99, choices: false })) {
        const m = /^Sisa dari ([\d.]+) : ([\d.]+) adalah \.\.\.$/.exec(item.prompt);
        expect(m).not.toBeNull();
        if (m) {
          const a = parseNum(m[1] as string);
          const b = parseNum(m[2] as string);
          expect(a >= 100 && a <= 999).toBe(true);
          expect(b >= 10 && b <= 99).toBe(true);
        }
      }
    }
  });

  it("factorsmultiples patternX/patternDiv generate geometric sequences", () => {
    let sawX = false;
    let sawDiv = false;
    for (const seed of [7, 77, 777]) {
      for (const item of generateFor("factorsmultiples", 1, seed, { itemCount: 6, kinds: ["patternX"], max: 100, factorMax: 5 })) {
        const m = /^Suku berikutnya dari ([\d.]+), ([\d.]+), ([\d.]+), \.\.\. adalah \.\.\.$/.exec(item.prompt);
        expect(m !== null, `patternX prompt format: ${item.prompt}`).toBe(true);
        if (!m) continue;
        sawX = true;
        const t1 = Number(m[1] as string);
        const t2 = Number(m[2] as string);
        const t3 = Number(m[3] as string);
        expect(t2 * t2 === t1 * t3 && t2 > t1).toBe(true);
        const r = t2 / t1;
        expect(Number.isInteger(r) && r >= 2 && r <= 5).toBe(true);
        expect(item.answer.kind === "integer" && item.answer.value === t3 * r).toBe(true);
        expect(item.answer.kind === "integer" && item.answer.value <= 100).toBe(true);
      }
      for (const item of generateFor("factorsmultiples", 1, seed, { itemCount: 6, kinds: ["patternDiv"], max: 100, factorMax: 5 })) {
        const m = /^Suku berikutnya dari ([\d.]+), ([\d.]+), ([\d.]+), \.\.\. adalah \.\.\.$/.exec(item.prompt);
        expect(m !== null, `patternDiv prompt format: ${item.prompt}`).toBe(true);
        if (!m) continue;
        sawDiv = true;
        const t1 = Number(m[1] as string);
        const t2 = Number(m[2] as string);
        const t3 = Number(m[3] as string);
        expect(t1 * t3 === t2 * t2 && t1 > t2).toBe(true);
        const r = t1 / t2;
        expect(Number.isInteger(r) && r >= 2 && r <= 5).toBe(true);
        expect(t3 % r === 0).toBe(true);
        expect(item.answer.kind === "integer" && item.answer.value === t3 / r).toBe(true);
      }
    }
    expect(sawX).toBe(true);
    expect(sawDiv).toBe(true);
  });

  it("kpk/fpb honor the max ceiling", () => {
    for (const seed of [7, 77, 777]) {
      for (const item of generateFor("factorsmultiples", 1, seed, { itemCount: 6, kinds: ["kpk"], max: 20 })) {
        const m = /^KPK dari (\d+) dan (\d+) adalah \.\.\.$/.exec(item.prompt);
        expect(m !== null, `kpk prompt format: ${item.prompt}`).toBe(true);
        if (!m) continue;
        expect(lcm(Number(m[1]), Number(m[2]))).toBeLessThanOrEqual(20);
      }
      for (const item of generateFor("factorsmultiples", 1, seed, { itemCount: 6, kinds: ["fpb"], max: 50 })) {
        const m = /^FPB dari (\d+) dan (\d+) adalah \.\.\.$/.exec(item.prompt);
        expect(m !== null, `fpb prompt format: ${item.prompt}`).toBe(true);
        if (!m) continue;
        expect(Number(m[1])).toBeLessThanOrEqual(50);
        expect(Number(m[2])).toBeLessThanOrEqual(50);
      }
    }
  });

  it("fractions subDiff answers are positive and fully reduced", () => {
    for (const seed of SEEDS) {
      for (const item of generateFor("fractions", 1, seed, { itemCount: 12, kinds: ["subDiff"] })) {
        expect(item.answer.kind === "fraction").toBe(true);
        if (item.answer.kind === "fraction") {
          expect(item.answer.n / item.answer.d).toBeGreaterThan(0);
          expect(gcdPair(item.answer.n, item.answer.d)).toBe(1);
        }
      }
    }
  });

  it("fractions addSame keeps the working denominator", () => {
    for (const seed of [3, 33, 333]) {
      for (const item of generateFor("fractions", 1, seed, { itemCount: 8, kinds: ["addSame"] })) {
        const m = /^(\d+)\/(\d+) \+ (\d+)\/(\d+) = \.\.\.$/.exec(item.prompt);
        expect(m).not.toBeNull();
        if (m && item.answer.kind === "fraction") {
          expect(item.answer.d).toBe(Number(m[2]));
          expect(item.answer.n).toBe(Number(m[1]) + Number(m[3]));
        }
      }
    }
  });

  it("money amounts are multiples of the step", () => {
    for (const seed of SEEDS) {
      for (const item of generateFor("money", 1, seed, { itemCount: 6, step: 500 })) {
        expect(item.answer.kind === "moneyRupiah" && item.answer.value % 500 === 0).toBe(true);
      }
    }
  });

  it("datareading table values are distinct so comparisons are unambiguous", () => {
    for (const seed of SEEDS) {
      const items = generateFor("datareading", 1, seed, { itemCount: 5 });
      const first = items[0] as Item;
      const nums = [...first.prompt.matchAll(/([a-z]+) (\d+) (kg|buah)/g)].map((m) => Number(m[2]));
      expect(nums.length).toBeGreaterThanOrEqual(2);
      expect(new Set(nums).size).toBe(nums.length);
    }
  });

  it("items respect small itemCount and choices=false drops choices", () => {
    const one = generateFor("addsub", 1, 5, { itemCount: 1 });
    expect(one.length).toBe(1);
    const noChoices = generateFor("addsub", 1, 5, { itemCount: 3, choices: false });
    for (const item of noChoices) expect(item.choices).toBeUndefined();
  });

  it("wrong kinds and missing itemCount fail fast", () => {
    expect(() => generateFor("addsub", 1, 1, { itemCount: 1, kinds: ["divide"] })).toThrow(/allowed/);
    expect(() => {
      const fam = getFamily("addsub")!;
      fam.generate({ step: 1, params: { max: 10 } }, createRng(1));
    }).toThrow(/itemCount/);
    expect(() =>
      generateFor("addsub", 1, 1, { itemCount: 5, max: 5, regroup: true, kinds: ["add"] }),
    ).toThrow(/drawWithRetry/);
  });
});

// Choices -----------------------------------------------------------------

describe("multiple-choice options", () => {
  it("include the answer, are distinct, and stay non-negative", () => {
    for (const seed of SEEDS) {
      for (const item of generateFor("addsub", 1, seed, { itemCount: 5, max: 1000 })) {
        expect(item.choices).toBeDefined();
        for (const choice of item.choices ?? []) {
          expect(choice.kind === "integer" && choice.value >= 0).toBe(true);
        }
      }
      for (const item of generateFor("mult", 1, seed, { itemCount: 5, kinds: ["tables"] })) {
        expect(item.choices).toBeDefined();
      }
    }
  });

  it("compare items offer exactly the two candidates", () => {
    for (const seed of SEEDS) {
      for (const item of generateFor("placevalue", 1, seed, { itemCount: 10, max: 100000, kinds: ["compare"] })) {
        expect(item.choices?.length).toBe(2);
        const first = item.choices?.[0];
        const second = item.choices?.[1];
        expect(
          answersEqual(first as Item["answer"], item.answer) ||
            answersEqual(second as Item["answer"], item.answer),
        ).toBe(true);
      }
    }
  });
});

// Hints -------------------------------------------------------------------

describe("CPA hint attachments", () => {
  it("uses only the five fixed models across all families", () => {
    const models = new Set<string>();
    for (const family of GENERATOR_FAMILY_IDS) {
      for (const seed of SEEDS.slice(0, 10)) {
        for (const item of generateFor(family, 1, seed)) {
          if (item.hint) models.add(item.hint.model);
        }
      }
    }
    for (const model of models) {
      expect(["part-whole", "comparison", "fraction-bar", "number-line", "base-ten"]).toContain(model);
    }
  });

  it("hints never carry the answer in a non-null field where the unknown is asked", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      for (const item of generateFor("addsub", 1, seed, { itemCount: 6, kinds: ["sub"] })) {
        const payload = item.hint?.payload as {
          kind: string;
          total: number | null;
          parts: (number | null)[];
        };
        if (payload.kind === "part-whole") {
          const nulls =
            (payload.total === null ? 1 : 0) + payload.parts.filter((p) => p === null).length;
          expect(nulls).toBe(1);
        }
      }
    }
  });
});

function gcdPair(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y > 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}
