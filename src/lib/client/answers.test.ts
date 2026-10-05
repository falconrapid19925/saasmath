import { describe, expect, it } from "vitest";

import {
  answersEqual,
  countCorrect,
  emptyDraft,
  gradeItems,
  parseDraft,
  type AnswerDraft,
} from "./answers";
import type { Item } from "@/lib/engine/types";

describe("parseDraft", () => {
  it("parses integers including negatives", () => {
    const d = emptyDraft("integer");
    expect(d).toEqual({ kind: "integer", draft: { digits: "", negative: false } });
    const filled: AnswerDraft = {
      kind: "integer",
      draft: { digits: "42", negative: true },
    };
    expect(parseDraft(filled)).toEqual({ kind: "integer", value: -42 });
    expect(parseDraft({ kind: "integer", draft: { digits: "", negative: false } })).toBeNull();
    expect(parseDraft({ kind: "integer", draft: { digits: "1a", negative: false } })).toBeNull();
  });

  it("parses decimals from int/dec parts with correct places", () => {
    expect(
      parseDraft({ kind: "decimal", draft: { intPart: "0", decPart: "5", negative: false } }),
    ).toEqual({ kind: "decimal", value: 0.5, places: 1 });
    expect(
      parseDraft({ kind: "decimal", draft: { intPart: "", decPart: "25", negative: true } }),
    ).toEqual({ kind: "decimal", value: -0.25, places: 2 });
    expect(
      parseDraft({ kind: "decimal", draft: { intPart: "", decPart: "", negative: false } }),
    ).toBeNull();
  });

  it("parses fractions and rejects zero denominators", () => {
    expect(parseDraft({ kind: "fraction", draft: { n: "3", d: "4", negative: false } })).toEqual({
      kind: "fraction",
      n: 3,
      d: 4,
    });
    expect(parseDraft({ kind: "fraction", draft: { n: "1", d: "0", negative: false } })).toBeNull();
    expect(parseDraft({ kind: "fraction", draft: { n: "", d: "4", negative: false } })).toBeNull();
  });

  it("parses mixed numbers; empty fraction part means whole", () => {
    expect(
      parseDraft({ kind: "mixed", draft: { w: "2", n: "1", d: "4", negative: true } }),
    ).toEqual({ kind: "mixed", w: -2, n: 1, d: 4 });
    expect(parseDraft({ kind: "mixed", draft: { w: "3", n: "", d: "4", negative: false } })).toEqual({
      kind: "mixed",
      w: 3,
      n: 0,
      d: 4,
    });
  });

  it("parses money and unit values", () => {
    expect(parseDraft({ kind: "moneyRupiah", draft: { digits: "15000" } })).toEqual({
      kind: "moneyRupiah",
      value: 15000,
    });
    expect(
      parseDraft({ kind: "unitValue", draft: { digits: "250", unit: "cm" } }),
    ).toEqual({ kind: "unitValue", value: 250, unit: "cm" });
    expect(parseDraft({ kind: "unitValue", draft: { digits: "250", unit: null } })).toBeNull();
  });

  it("seeds unit drafts with the first unit chip", () => {
    const d = emptyDraft("unitValue", ["cm", "m"]);
    expect(d).toEqual({ kind: "unitValue", draft: { digits: "", unit: "cm" } });
  });
});

describe("answersEqual (engine semantics — the grade the server records)", () => {
  it("matches exact integers and money by numeric value", () => {
    expect(answersEqual({ kind: "integer", value: 7 }, { kind: "integer", value: 7 })).toBe(true);
    expect(answersEqual({ kind: "integer", value: 7 }, { kind: "integer", value: 8 })).toBe(false);
    expect(
      answersEqual({ kind: "moneyRupiah", value: 500 }, { kind: "moneyRupiah", value: 500 }),
    ).toBe(true);
    // Whole rupiah and a plain number compare by value (engine rule:
    // integer/decimal/money/fraction/mixed all compare numerically).
    expect(
      answersEqual({ kind: "moneyRupiah", value: 500 }, { kind: "integer", value: 500 }),
    ).toBe(true);
  });

  it("matches equivalent fractions regardless of simplification", () => {
    expect(
      answersEqual({ kind: "fraction", n: 2, d: 4 }, { kind: "fraction", n: 1, d: 2 }),
    ).toBe(true);
    expect(
      answersEqual({ kind: "fraction", n: -1, d: 2 }, { kind: "fraction", n: 1, d: -2 }),
    ).toBe(true);
    expect(
      answersEqual({ kind: "fraction", n: 2, d: 4 }, { kind: "fraction", n: 1, d: 3 }),
    ).toBe(false);
  });

  it("matches mixed numbers against improper fractions", () => {
    expect(
      answersEqual(
        { kind: "mixed", w: 3, n: 1, d: 2 },
        { kind: "fraction", n: 7, d: 2 },
      ),
    ).toBe(true);
    expect(
      answersEqual(
        { kind: "mixed", w: -3, n: 1, d: 2 },
        { kind: "fraction", n: -7, d: 2 },
      ),
    ).toBe(true);
  });

  it("matches decimals across trailing zeros and against integers/fractions", () => {
    expect(
      answersEqual({ kind: "decimal", value: 0.5, places: 1 }, { kind: "decimal", value: 0.5, places: 2 }),
    ).toBe(true);
    expect(
      answersEqual({ kind: "decimal", value: 0.5, places: 1 }, { kind: "fraction", n: 1, d: 2 }),
    ).toBe(true);
    expect(
      answersEqual({ kind: "integer", value: 2 }, { kind: "fraction", n: 4, d: 2 }),
    ).toBe(true);
    expect(
      answersEqual({ kind: "decimal", value: 0.33, places: 2 }, { kind: "fraction", n: 1, d: 3 }),
    ).toBe(false);
  });

  it("requires the unit chip to match on unitValue", () => {
    expect(
      answersEqual(
        { kind: "unitValue", value: 250, unit: "cm" },
        { kind: "unitValue", value: 250, unit: "cm" },
      ),
    ).toBe(true);
    expect(
      answersEqual(
        { kind: "unitValue", value: 250, unit: "cm" },
        { kind: "unitValue", value: 250, unit: "m" },
      ),
    ).toBe(false);
  });

  it("compares unit values with grading tolerance, not ===", () => {
    // 0.1 + 0.2 !== 0.3 in IEEE 754; grading equality must still accept it.
    expect(
      answersEqual(
        { kind: "unitValue", value: 0.1 + 0.2, unit: "cm" },
        { kind: "unitValue", value: 0.3, unit: "cm" },
      ),
    ).toBe(true);
  });

  it("trims the unit chip before comparing", () => {
    expect(
      answersEqual(
        { kind: "unitValue", value: 300, unit: " cm " },
        { kind: "unitValue", value: 300, unit: "cm" },
      ),
    ).toBe(true);
  });
});

describe("gradeItems", () => {
  const items: Item[] = [
    {
      id: "i1",
      prompt: "6 x 7 = ...",
      answer: { kind: "integer", value: 42 },
      answerType: "integer",
    },
    {
      id: "i2",
      prompt: "1/2 + 1/4 = ...",
      answer: { kind: "fraction", n: 3, d: 4 },
      answerType: "fraction",
    },
    {
      id: "i3",
      prompt: "0,5 + 0,25 = ...",
      answer: { kind: "decimal", value: 0.75, places: 2 },
      answerType: "decimal",
    },
  ];

  it("grades correct, equivalent and skipped answers", () => {
    const results = gradeItems(items, [
      { kind: "integer", value: 42 },
      { kind: "mixed", w: 0, n: 3, d: 4 },
      null,
    ]);
    expect(results.map((r) => r.correct)).toEqual([true, true, false]);
    expect(countCorrect(results)).toBe(2);
    expect(results[2]).toMatchObject({ itemId: "i3", given: null });
  });

  it("is short-answer tolerant: missing trailing answers count as skipped", () => {
    const results = gradeItems(items, [{ kind: "integer", value: 42 }]);
    expect(results.map((r) => r.correct)).toEqual([true, false, false]);
  });
});
