import { describe, expect, it } from "vitest";

import { answersEqual as engineAnswersEqual } from "../engine/answers";
import type { Item } from "../engine/types";

import {
  formatAnswer as serverFormatAnswer,
  formatDurationId,
  gradeItems,
} from "./answers";

const int = (value: number) => ({ kind: "integer" as const, value });
const dec = (value: number, places: number) => ({ kind: "decimal" as const, value, places });
const frac = (n: number, d: number) => ({ kind: "fraction" as const, n, d });
const mixed = (w: number, n: number, d: number) => ({ kind: "mixed" as const, w, n, d });
const rupiah = (value: number) => ({ kind: "moneyRupiah" as const, value });
const unit = (value: number, unitOfMeasure: string) => ({
  kind: "unitValue" as const,
  value,
  unit: unitOfMeasure,
});

/**
 * The server delegates equality to the engine (src/lib/engine/answers.ts);
 * pin the delegation and the documented engine semantics the API inherits.
 */
describe("grading semantics (engine-owned, adapter-pinned)", () => {
  it("compares by numeric value across kinds (engine rule)", () => {
    expect(engineAnswersEqual(int(72), int(72))).toBe(true);
    expect(engineAnswersEqual(int(72), int(73))).toBe(false);
    // 1/2 == 2/4 == 0,5 == 5/10ths, cross-kind by value.
    expect(engineAnswersEqual(frac(1, 2), frac(2, 4))).toBe(true);
    expect(engineAnswersEqual(dec(0.5, 1), frac(1, 2))).toBe(true);
    expect(engineAnswersEqual(int(5), frac(5, 1))).toBe(true);
    expect(engineAnswersEqual(mixed(1, 1, 2), frac(3, 2))).toBe(true);
    expect(engineAnswersEqual(mixed(-2, 1, 4), mixed(-2, 2, 8))).toBe(true);
    // Sign lives on w: -(2 + 1/4) != +(2 + 1/4).
    expect(engineAnswersEqual(mixed(-2, 1, 4), mixed(2, 1, 4))).toBe(false);
    expect(engineAnswersEqual(frac(3, 4), frac(2, 3))).toBe(false);
  });

  it("unitValue requires the same unit and equal value", () => {
    expect(engineAnswersEqual(unit(250, "cm"), unit(250, "cm"))).toBe(true);
    expect(engineAnswersEqual(unit(250, "cm"), unit(250, " cm "))).toBe(true);
    expect(engineAnswersEqual(unit(250, "cm"), unit(250, "m"))).toBe(false);
    expect(engineAnswersEqual(unit(250, "cm"), unit(251, "cm"))).toBe(false);
    expect(engineAnswersEqual(unit(250, "cm"), int(250))).toBe(false);
  });

  it("server formatAnswer matches the engine's Indonesian formatting", () => {
    expect(serverFormatAnswer(int(72))).toBe("72");
    expect(serverFormatAnswer(dec(0.5, 1))).toBe("0,5");
    expect(serverFormatAnswer(dec(2.25, 2))).toBe("2,25");
    expect(serverFormatAnswer(frac(3, 4))).toBe("3/4");
    expect(serverFormatAnswer(mixed(-2, 1, 4))).toBe("-2 1/4");
    expect(serverFormatAnswer(rupiah(150000))).toBe("Rp150.000");
    expect(serverFormatAnswer(unit(3, "jam"))).toBe("3 jam");
  });
});

const item = (id: string, answer: Item["answer"]): Item => ({
  id,
  prompt: `soal ${id}`,
  answer,
  answerType: answer.kind,
});

describe("gradeItems", () => {
  it("marks skipped (null) answers wrong and counts corrects", () => {
    const items = [item("a", int(1)), item("b", int(2)), item("c", int(3))];
    const result = gradeItems(items, [int(1), null, int(4)]);
    expect(result.correctCount).toBe(1);
    expect(result.total).toBe(3);
    expect(result.items.map((r) => r.correct)).toEqual([true, false, false]);
    expect(result.items[1]?.given).toBeNull();
    expect(result.items[2]?.expected).toEqual(int(3));
  });

  it("throws when the answers array is misaligned", () => {
    const items = [item("a", int(1))];
    expect(() => gradeItems(items, [])).toThrow(/length/);
  });

  it("grades with engine value semantics (0,5 == 1/2)", () => {
    const items = [item("a", frac(1, 2)), item("b", unit(3, "jam"))];
    const result = gradeItems(items, [dec(0.5, 1), unit(3, "m")]);
    expect(result.items.map((r) => r.correct)).toEqual([true, false]);
  });
});

describe("formatDurationId (digests)", () => {
  it("formats durations in Bahasa", () => {
    expect(formatDurationId(45_000)).toBe("45 dtk");
    expect(formatDurationId(380_000)).toBe("6 m 20 dtk");
    expect(formatDurationId(420_000)).toBe("7 m 0 dtk");
  });
});
