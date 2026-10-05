/**
 * Answer helpers for the drill engine: constructors, Bahasa-Indonesia
 * formatting, canonical values and equality. Pure and framework-free so the
 * whole module also runs client-side (plan section 6: deterministic
 * client-side generators).
 *
 * Display conventions (Indonesian school style):
 * - thousands separator: "." (1.000), decimal separator: "," (0,5)
 * - money: "Rp12.000" (whole rupiah)
 * - fractions: "3/4", mixed numbers: "1 1/4", sign on the leading part
 * - division sign ":" as used in Indonesian elementary textbooks
 */

import type {
  Answer,
  DecimalAnswer,
  FractionAnswer,
  IntegerAnswer,
  Item,
  ItemResult,
  MixedNumberAnswer,
  MoneyRupiahAnswer,
  UnitValueAnswer,
} from "./types";

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

export function int(value: number): IntegerAnswer {
  return { kind: "integer", value };
}

export function dec(value: number, places: number): DecimalAnswer {
  return { kind: "decimal", value, places };
}

/** Decimal answer from an integer count of 10^places units: (37, 2) -> 0,37. */
export function decFromUnits(units: number, places: number): DecimalAnswer {
  return { kind: "decimal", value: units / 10 ** places, places };
}

export function frac(n: number, d: number): FractionAnswer {
  return { kind: "fraction", n, d };
}

export function mixed(w: number, n: number, d: number): MixedNumberAnswer {
  return { kind: "mixed", w, n, d };
}

export function rupiah(value: number): MoneyRupiahAnswer {
  return { kind: "moneyRupiah", value };
}

export function unit(value: number, unitName: string): UnitValueAnswer {
  return { kind: "unitValue", value, unit: unitName };
}

// ---------------------------------------------------------------------------
// Fraction math
// ---------------------------------------------------------------------------

export function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y > 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

export function lcm(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return Math.abs(a / gcd(a, b)) * Math.abs(b);
}

/** Reduce a fraction; denominator stays positive, sign moves to the numerator. */
export function reduceFraction(n: number, d: number): { n: number; d: number } {
  if (d === 0) throw new Error("reduceFraction: denominator must not be 0");
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d) || 1;
  return { n: n / g, d: d / g };
}

// ---------------------------------------------------------------------------
// Formatting (Bahasa Indonesia display conventions)
// ---------------------------------------------------------------------------

/** 45678 -> "45.678", -1234 -> "-1.234". */
export function formatInt(value: number): string {
  if (!Number.isInteger(value)) {
    throw new Error(`formatInt: ${value} is not an integer`);
  }
  const sign = value < 0 ? "-" : "";
  const digits = String(Math.abs(value));
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ".";
    out += digits[i];
  }
  return sign + out;
}

/**
 * Format a decimal from an integer count of 10^places units, Indonesian
 * comma: (5, 1) -> "0,5"; (137, 2) -> "1,37". Always shows exactly `places`
 * digits after the comma.
 */
export function formatDecimalFromUnits(units: number, places: number): string {
  if (!Number.isInteger(units) || places < 0) {
    throw new Error(`formatDecimalFromUnits: bad input ${units}/${places}`);
  }
  const sign = units < 0 ? "-" : "";
  const abs = Math.abs(units);
  const scale = 10 ** places;
  const whole = Math.floor(abs / scale);
  const fracDigits = String(abs % scale).padStart(places, "0");
  return `${sign}${formatInt(whole)},${fracDigits}`;
}

/** "3/4", "-3/4". */
export function formatFraction(n: number, d: number): string {
  return `${n}/${d}`;
}

/** "1 1/4", "-2 1/4" (sign on the whole part). */
export function formatMixed(w: number, n: number, d: number): string {
  const sign = w < 0 ? "-" : "";
  const body = n === 0 ? `${Math.abs(w)}` : `${Math.abs(w)} ${n}/${d}`;
  return `${sign}${body}`;
}

/** 12000 -> "Rp12.000". */
export function formatMoney(value: number): string {
  return `Rp${formatInt(value)}`;
}

/** 40, "cm" -> "40 cm". */
export function formatUnit(value: number, unitName: string): string {
  return `${formatInt(value)} ${unitName}`;
}

export function formatAnswer(a: Answer): string {
  switch (a.kind) {
    case "integer":
      return formatInt(a.value);
    case "decimal":
      return formatDecimalFromUnits(Math.round(a.value * 10 ** a.places), a.places);
    case "fraction":
      return formatFraction(a.n, a.d);
    case "mixed":
      return formatMixed(a.w, a.n, a.d);
    case "moneyRupiah":
      return formatMoney(a.value);
    case "unitValue":
      return formatUnit(a.value, a.unit);
  }
}

// ---------------------------------------------------------------------------
// Values and equality (grading semantics)
// ---------------------------------------------------------------------------

/**
 * Numeric value of an answer. Fractions and mixed numbers become their
 * improper-fraction value. Unit answers keep only the numeric part — use
 * answersEqual for unit-aware comparison.
 */
export function answerValue(a: Answer): number {
  switch (a.kind) {
    case "integer":
    case "decimal":
    case "moneyRupiah":
      return a.value;
    case "fraction":
      return a.n / a.d;
    case "mixed": {
      const magnitude = Math.abs(a.w) + a.n / a.d;
      return a.w < 0 ? -magnitude : magnitude;
    }
    case "unitValue":
      return a.value;
  }
}

const VALUE_EPSILON = 1e-9;

/**
 * Grading equality. Rules:
 * - integer / decimal / moneyRupiah / fraction / mixed compare by numeric
 *   value (so 1/2 == 2/4, 0,5 == 1/2, 5 == 5/1); `places` on decimals is a
 *   display/widget hint, not part of the value.
 * - unitValue requires the same unit string (exact, after trim) and equal value.
 */
export function answersEqual(a: Answer, b: Answer): boolean {
  if (a.kind === "unitValue" || b.kind === "unitValue") {
    return (
      a.kind === "unitValue" &&
      b.kind === "unitValue" &&
      a.unit.trim() === b.unit.trim() &&
      Math.abs(a.value - b.value) <= VALUE_EPSILON
    );
  }
  return Math.abs(answerValue(a) - answerValue(b)) <= VALUE_EPSILON;
}

/** Stable canonical key, used to dedupe multiple-choice options. */
export function answerKey(a: Answer): string {
  if (a.kind === "unitValue") {
    return `unit:${formatInt(a.value)}:${a.unit.trim()}`;
  }
  // Numeric kinds share one prefix so equivalent forms (1/2 vs 0,5) collapse.
  return `num:${answerValue(a)}`;
}

// ---------------------------------------------------------------------------
// Grading (the one implementation: client instant feedback AND the
// server-authored record both grade through these functions)
// ---------------------------------------------------------------------------

/** Grade one item. null given = skipped = incorrect. */
export function gradeItem(item: Item, given: Answer | null): ItemResult {
  const correct = given !== null && answersEqual(given, item.answer);
  return { itemId: item.id, given, expected: item.answer, correct };
}

/**
 * Grade a full set, aligning answers with items by position. Missing
 * trailing answers (offline short sets) count as skipped.
 */
export function gradeItems(items: Item[], answers: (Answer | null)[]): ItemResult[] {
  return items.map((item, i) => gradeItem(item, answers[i] ?? null));
}

export function countCorrect(results: ItemResult[]): number {
  return results.reduce((acc, r) => acc + (r.correct ? 1 : 0), 0);
}

// ---------------------------------------------------------------------------
// Digit-carry checks (regrouping enforcement for addsub)
// ---------------------------------------------------------------------------

/** True when computing a + b needs at least one carry. */
export function additionHasCarry(a: number, b: number): boolean {
  let carry = 0;
  let x = a;
  let y = b;
  while (x > 0 || y > 0) {
    const columnSum = (x % 10) + (y % 10) + carry;
    if (columnSum >= 10) return true;
    carry = columnSum >= 10 ? 1 : 0;
    x = Math.floor(x / 10);
    y = Math.floor(y / 10);
  }
  return false;
}

/** True when computing a - b needs at least one borrow. */
export function subtractionHasBorrow(a: number, b: number): boolean {
  let x = a;
  let y = b;
  while (x > 0 || y > 0) {
    if ((x % 10) < (y % 10)) return true;
    x = Math.floor(x / 10);
    y = Math.floor(y / 10);
  }
  return false;
}

/** Count of positive divisors of n (n >= 1). */
export function divisorCount(n: number): number {
  let count = 0;
  for (let i = 1; i <= n; i++) {
    if (n % i === 0) count++;
  }
  return count;
}
