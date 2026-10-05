import { describe, expect, it } from "vitest";

import {
  additionHasCarry,
  answerKey,
  answerValue,
  answersEqual,
  countCorrect,
  dec,
  decFromUnits,
  formatAnswer,
  formatDecimalFromUnits,
  formatInt,
  formatMixed,
  formatMoney,
  frac,
  gcd,
  gradeItem,
  gradeItems,
  int,
  lcm,
  mixed,
  reduceFraction,
  rupiah,
  subtractionHasBorrow,
  unit,
} from "./answers";
import type { Item } from "./types";

describe("formatInt (Indonesian thousands separator)", () => {
  it("groups by three with dots", () => {
    expect(formatInt(0)).toBe("0");
    expect(formatInt(5)).toBe("5");
    expect(formatInt(999)).toBe("999");
    expect(formatInt(1000)).toBe("1.000");
    expect(formatInt(45678)).toBe("45.678");
    expect(formatInt(100000)).toBe("100.000");
    expect(formatInt(-1234)).toBe("-1.234");
  });

  it("rejects non-integers", () => {
    expect(() => formatInt(1.5)).toThrow(/not an integer/);
  });
});

describe("formatDecimalFromUnits (Indonesian decimal comma)", () => {
  it("renders fixed places with a comma", () => {
    expect(formatDecimalFromUnits(5, 1)).toBe("0,5");
    expect(formatDecimalFromUnits(70, 2)).toBe("0,70");
    expect(formatDecimalFromUnits(37, 2)).toBe("0,37");
    expect(formatDecimalFromUnits(137, 2)).toBe("1,37");
    expect(formatDecimalFromUnits(150, 1)).toBe("15,0");
    expect(formatDecimalFromUnits(-37, 2)).toBe("-0,37");
  });
});

describe("other formatters", () => {
  it("fractions, mixed numbers, money, units", () => {
    expect(formatAnswer(frac(3, 4))).toBe("3/4");
    expect(formatAnswer(mixed(1, 1, 4))).toBe("1 1/4");
    expect(formatMixed(-2, 1, 4)).toBe("-2 1/4");
    expect(formatMoney(12000)).toBe("Rp12.000");
    expect(formatAnswer(unit(40, "cm"))).toBe("40 cm");
  });

  it("formats unit answers as whole numbers (contract, not a guess)", () => {
    expect(() => formatAnswer(unit(0.5, "m"))).toThrow(/not an integer/);
  });
});

describe("fraction math", () => {
  it("gcd/lcm/reduce", () => {
    expect(gcd(12, 18)).toBe(6);
    expect(lcm(4, 6)).toBe(12);
    expect(reduceFraction(6, 8)).toEqual({ n: 3, d: 4 });
    expect(reduceFraction(-6, 8)).toEqual({ n: -3, d: 4 });
    expect(reduceFraction(6, -8)).toEqual({ n: -3, d: 4 });
    expect(() => reduceFraction(1, 0)).toThrow(/denominator/);
  });
});

describe("answerValue and answersEqual (grading semantics)", () => {
  it("numeric cross-kind equality", () => {
    expect(answersEqual(frac(1, 2), frac(2, 4))).toBe(true);
    expect(answersEqual(frac(5, 1), int(5))).toBe(true);
    expect(answersEqual(dec(0.5, 1), decFromUnits(50, 2))).toBe(true);
    expect(answersEqual(mixed(1, 1, 4), frac(5, 4))).toBe(true);
    expect(answersEqual(mixed(-2, 1, 4), dec(-2.25, 2))).toBe(true);
    expect(answersEqual(rupiah(5000), int(5000))).toBe(true);
    expect(answersEqual(int(3), int(4))).toBe(false);
    expect(answersEqual(frac(1, 3), dec(0.3333, 4))).toBe(false);
  });

  it("mixed number value applies the sign to the whole", () => {
    expect(answerValue(mixed(-2, 1, 4))).toBeCloseTo(-2.25, 12);
    expect(answerValue(mixed(2, 1, 4))).toBeCloseTo(2.25, 12);
  });

  it("unit answers need the same unit", () => {
    expect(answersEqual(unit(300, "cm"), unit(300, "cm"))).toBe(true);
    expect(answersEqual(unit(300, "cm"), unit(300, "m"))).toBe(false);
    expect(answersEqual(unit(300, "cm"), int(300))).toBe(false);
    expect(answersEqual(unit(300, " cm "), unit(300, "cm"))).toBe(true);
  });
});

describe("answerKey dedupes equivalent choices", () => {
  it("collapses equivalent forms and separates units", () => {
    expect(answerKey(frac(1, 2))).toBe(answerKey(dec(0.5, 1)));
    expect(answerKey(unit(1, "cm"))).not.toBe(answerKey(unit(1, "m")));
  });
});

describe("grading (gradeItem / gradeItems / countCorrect)", () => {
  // Worked examples, checked by hand: 6 x 7 = 42; 1/2 + 1/4 = 3/4
  // (common denominator 4); 0,5 = 1/2; 2 1/4 = 9/4.
  const items: Item[] = [
    {
      id: "i1",
      prompt: "6 x 7 = ...",
      answer: int(42),
      answerType: "integer",
    },
    {
      id: "i2",
      prompt: "1/2 + 1/4 = ...",
      answer: frac(3, 4),
      answerType: "fraction",
    },
    {
      id: "i3",
      prompt: "0,5 x 4 = ...",
      answer: dec(2, 1),
      answerType: "decimal",
    },
  ];

  it("grades one item as correct on an equivalent answer", () => {
    const result = gradeItem(items[1]!, frac(6, 8));
    expect(result).toEqual({
      itemId: "i2",
      given: frac(6, 8),
      expected: frac(3, 4),
      correct: true,
    });
  });

  it("grades a null answer as skipped = incorrect", () => {
    expect(gradeItem(items[0]!, null)).toEqual({
      itemId: "i1",
      given: null,
      expected: int(42),
      correct: false,
    });
  });

  it("grades a full set, aligning answers with items by position", () => {
    const results = gradeItems(items, [int(42), mixed(0, 3, 4), frac(4, 2)]);
    expect(results.map((r) => r.itemId)).toEqual(["i1", "i2", "i3"]);
    expect(results.map((r) => r.correct)).toEqual([true, true, true]);
    expect(countCorrect(results)).toBe(3);
  });

  it("counts wrong and skipped answers as incorrect", () => {
    const results = gradeItems(items, [int(41), null, frac(1, 2)]);
    expect(results.map((r) => r.correct)).toEqual([false, false, false]);
    expect(countCorrect(results)).toBe(0);
  });

  it("treats missing trailing answers as skipped (offline short sets)", () => {
    const results = gradeItems(items, [int(42)]);
    expect(results.map((r) => r.correct)).toEqual([true, false, false]);
    expect(countCorrect(results)).toBe(1);
  });

  it("unit answers grade through the same equality (unit must match)", () => {
    const unitItems: Item[] = [
      { id: "u1", prompt: "3 m = ... cm", answer: unit(300, "cm"), answerType: "unitValue" },
    ];
    expect(gradeItem(unitItems[0]!, unit(300, "cm")).correct).toBe(true);
    expect(gradeItem(unitItems[0]!, unit(300, "m")).correct).toBe(false);
  });
});

describe("regroup checks", () => {
  it("addition carry detection", () => {
    expect(additionHasCarry(48, 19)).toBe(true); // 8+9=17
    expect(additionHasCarry(999, 1)).toBe(true);
    expect(additionHasCarry(22, 33)).toBe(false);
    expect(additionHasCarry(105, 204)).toBe(false); // 5+4=9, 0+0=0, 1+2=3
    expect(additionHasCarry(1, 0)).toBe(false);
  });

  it("subtraction borrow detection", () => {
    expect(subtractionHasBorrow(82, 19)).toBe(true); // ones: 2 < 9
    expect(subtractionHasBorrow(505, 6)).toBe(true);
    expect(subtractionHasBorrow(55, 23)).toBe(false);
    expect(subtractionHasBorrow(100, 1)).toBe(true); // ones 0 < 1
    expect(subtractionHasBorrow(9, 8)).toBe(false);
  });
});
