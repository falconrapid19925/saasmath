/**
 * Per-family step-parameter schemas and the difficulty-monotonicity rules.
 *
 * This is the content-side half of the drill-engine contract
 * (src/lib/engine/types.ts StepParams): every skill step carries
 * family-specific params, and difficulty must rise monotonically from step 1
 * to step N — number ranges widen, flags only get harder, and the item count
 * never shrinks (plan section 3.1: difficulty rises "marginally from
 * worksheet to worksheet").
 *
 * - Each family has one zod schema (strict: unknown keys fail) — the single
 *   source of truth for both the authored TypeScript types (z.infer) and the
 *   runtime validation done in defineSkill().
 * - stepMonotonicityIssues() encodes what "harder" means per family and is
 *   exercised by the content tests over every authored step transition.
 */

import { z } from "zod";

import type { GeneratorFamilyId } from "../../lib/engine/families";
import type { StepParams } from "../../lib/engine/types";

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

/** Items per generated set. Plan 3.1: a daily set is 10-20 items; dense
 *  families (data reading, word problems) may go down to 4. */
const itemCount = z.number().int().min(4).max(20);

const sortedUniqueDenominators = z
  .array(z.number().int().min(2).max(100))
  .min(1)
  .refine(
    (values) => values.every((v, i) => i === 0 || v > (values[i - 1] as number)),
    { message: "denominators must be strictly ascending and unique" },
  );

export const MISSING_POSITION_ORDER = ["result", "operand"] as const;
export const ADDSUB_OPERATION_ORDER = ["add", "sub", "mixed"] as const;
export const PLACEVALUE_MODE_ORDER = [
  "identify",
  "compose",
  "decompose",
  "compare",
  "order",
  "round",
] as const;
export const FACTORSMULTIPLES_MODE_ORDER = [
  "factors",
  "multiples",
  "kpk",
  "fpb",
  "pattern",
] as const;
export const FRACTIONS_MODE_ORDER = [
  "identify",
  "compare",
  "order",
  "equivalent",
  "add",
  "sub",
  "mult",
  "div",
] as const;
export const DECIMALS_MODE_ORDER = [
  "read",
  "compare",
  "order",
  "convert",
  "add",
  "sub",
] as const;
export const MONEY_MODE_ORDER = ["count", "add", "sub", "change"] as const;
export const MEASUREMENT_MODE_ORDER = [
  "convert",
  "keliling",
  "luas",
  "duration",
] as const;
export const MEASUREMENT_DIRECTION_ORDER = [
  "toSmaller",
  "toLarger",
  "mixed",
] as const;
export const MEASUREMENT_SHAPE_ORDER = ["rectangle", "triangle", "polygon"] as const;
export const GEOMETRY_MODE_ORDER = ["properties", "compose", "angles"] as const;
export const GEOMETRY_ANGLE_TASK_ORDER = [
  "classify",
  "complement",
  "supplement",
] as const;
export const DATAREADING_MODE_ORDER = ["table", "pictogram", "bar"] as const;
export const DATAREADING_TASK_ORDER = [
  "read",
  "compare",
  "total",
  "difference",
] as const;
export const WORDPROBLEM_OPERATION_ORDER = ["add", "sub", "mult", "div"] as const;
export const PATTERN_OP_ORDER = ["x", "div"] as const;

// ---------------------------------------------------------------------------
// Per-family schemas + inferred param types (single source of truth)
// ---------------------------------------------------------------------------

/** Penjumlahan/pengurangan. `min`/`max` bound each operand. */
export const addSubStepSchema = z.strictObject({
  itemCount,
  min: z.number().int().min(0),
  max: z.number().int().min(1).max(1_000_000),
  operation: z.enum(ADDSUB_OPERATION_ORDER),
  regroup: z.boolean(),
  /** Which part of a ± b = c is unknown. Default "result". */
  missingPosition: z.enum(MISSING_POSITION_ORDER).optional(),
});
export type AddSubStepParams = z.infer<typeof addSubStepSchema>;

/** Perkalian: a x b with a in [minA, maxA], b in [minB, maxB]. */
export const multStepSchema = z.strictObject({
  itemCount,
  minA: z.number().int().min(0),
  maxA: z.number().int().min(1).max(1_000_000),
  minB: z.number().int().min(0),
  maxB: z.number().int().min(1).max(1_000_000),
  missingPosition: z.enum(MISSING_POSITION_ORDER).optional(),
});
export type MultStepParams = z.infer<typeof multStepSchema>;

/** Pembagian: dividend in [minDividend, maxDividend], divisor in [minDivisor, maxDivisor]. */
export const divStepSchema = z.strictObject({
  itemCount,
  minDividend: z.number().int().min(0),
  maxDividend: z.number().int().min(1).max(1_000_000),
  minDivisor: z.number().int().min(1).max(999),
  maxDivisor: z.number().int().min(1).max(999),
  allowRemainder: z.boolean(),
});
export type DivStepParams = z.infer<typeof divStepSchema>;

/**
 * Nilai tempat / membandingkan / mengurutkan / membulatkan bilangan sampai `max`.
 * `roundTo` (round mode): nearest 10/100/1000 — smaller is harder for big numbers.
 * `descending` (order mode): sort largest-first.
 */
export const placeValueStepSchema = z.strictObject({
  itemCount,
  max: z.number().int().min(9).max(1_000_000),
  mode: z.enum(PLACEVALUE_MODE_ORDER),
  roundTo: z.union([z.literal(10), z.literal(100), z.literal(1000)]).optional(),
  descending: z.boolean().optional(),
});
export type PlaceValueStepParams = z.infer<typeof placeValueStepSchema>;

/** Kelipatan dan faktor, KPK/FPB, pola bilangan. */
export const factorsMultiplesStepSchema = z.strictObject({
  itemCount,
  max: z.number().int().min(2).max(100_000),
  mode: z.enum(FACTORSMULTIPLES_MODE_ORDER),
  /** pattern mode only: sequence rule. */
  op: z.enum(PATTERN_OP_ORDER).optional(),
  /** pattern mode only: multiplier/divisor upper bound. */
  factorMax: z.number().int().min(2).max(12).optional(),
});
export type FactorsMultiplesStepParams = z.infer<typeof factorsMultiplesStepSchema>;

/**
 * Pecahan. `denominators` lists the allowed penyebut; `sameDen` true means
 * all items use one common denominator; `maxWhole` bounds the whole number
 * in mult/div-by-whole items; `requireSimplify` forces the simplified form.
 */
export const fractionsStepSchema = z.strictObject({
  itemCount,
  mode: z.enum(FRACTIONS_MODE_ORDER),
  sameDen: z.boolean(),
  denominators: sortedUniqueDenominators,
  requireSimplify: z.boolean().optional(),
  maxWhole: z.number().int().min(2).max(20).optional(),
});
export type FractionsStepParams = z.infer<typeof fractionsStepSchema>;

/**
 * Desimal. `max` bounds the scaled integer (value * 10^places), so places 1
 * with max 99 yields 0,0-9,9. `denominators` (convert mode) lists penyebut
 * that produce exact decimals at the given places (divisors of 10^places).
 */
export const decimalsStepSchema = z.strictObject({
  itemCount,
  mode: z.enum(DECIMALS_MODE_ORDER),
  places: z.union([z.literal(1), z.literal(2)]),
  max: z.number().int().min(1).max(1_000_000).optional(),
  denominators: sortedUniqueDenominators.optional(),
  descending: z.boolean().optional(),
});
export type DecimalsStepParams = z.infer<typeof decimalsStepSchema>;

/** Uang dalam rupiah bulat; `max` adalah nominal terbesar yang muncul. */
export const moneyStepSchema = z.strictObject({
  itemCount,
  mode: z.enum(MONEY_MODE_ORDER),
  max: z.number().int().min(1000).max(10_000_000),
});
export type MoneyStepParams = z.infer<typeof moneyStepSchema>;

/**
 * Pengukuran. convert: `units` = [satuan kecil, satuan besar] (e.g. ["cm","m"]),
 * `direction` = arah konversi yang dikerjakan anak. keliling/luas: `shape`.
 * duration: `withCarry` = menit melewati 60 (menyimpan).
 */
export const measurementStepSchema = z.strictObject({
  itemCount,
  mode: z.enum(MEASUREMENT_MODE_ORDER),
  max: z.number().int().min(1).max(1_000_000),
  units: z.tuple([z.string().min(1), z.string().min(1)]).optional(),
  direction: z.enum(MEASUREMENT_DIRECTION_ORDER).optional(),
  shape: z.enum(MEASUREMENT_SHAPE_ORDER).optional(),
  withCarry: z.boolean().optional(),
});
export type MeasurementStepParams = z.infer<typeof measurementStepSchema>;

/** Bangun datar, penyusunan bangun, sudut. */
export const geometryStepSchema = z.strictObject({
  itemCount,
  mode: z.enum(GEOMETRY_MODE_ORDER),
  max: z.number().int().min(1).max(1_000_000),
  shapes: z.array(z.string().min(1)).min(2).optional(),
  pieces: z.number().int().min(2).max(9).optional(),
  angleTask: z.enum(GEOMETRY_ANGLE_TASK_ORDER).optional(),
  sumTo: z.union([z.literal(90), z.literal(180), z.literal(360)]).optional(),
});
export type GeometryStepParams = z.infer<typeof geometryStepSchema>;

/** Tabel, diagram gambar, diagram batang. */
export const dataReadingStepSchema = z.strictObject({
  itemCount,
  mode: z.enum(DATAREADING_MODE_ORDER),
  task: z.enum(DATAREADING_TASK_ORDER),
  maxRows: z.number().int().min(2).max(12),
  maxScale: z.number().int().min(1).max(100),
  maxTotal: z.number().int().min(5).max(1_000_000),
});
export type DataReadingStepParams = z.infer<typeof dataReadingStepSchema>;

/** Soal cerita multi-langkah; `operations` = operasi yang dibutuhkan. */
export const wordProblemsStepSchema = z.strictObject({
  itemCount,
  max: z.number().int().min(10).max(1_000_000),
  steps: z.union([z.literal(1), z.literal(2)]),
  operations: z
    .array(z.enum(WORDPROBLEM_OPERATION_ORDER))
    .min(1)
    .max(4)
    .refine((ops) => new Set(ops).size === ops.length, {
      message: "operations must be unique",
    }),
});
export type WordProblemsStepParams = z.infer<typeof wordProblemsStepSchema>;

/** Family id -> params type, used to type-check authored steps per family. */
export type FamilyParamsMap = {
  addsub: AddSubStepParams;
  mult: MultStepParams;
  div: DivStepParams;
  placevalue: PlaceValueStepParams;
  factorsmultiples: FactorsMultiplesStepParams;
  fractions: FractionsStepParams;
  decimals: DecimalsStepParams;
  money: MoneyStepParams;
  measurement: MeasurementStepParams;
  geometry: GeometryStepParams;
  datareading: DataReadingStepParams;
  wordproblems: WordProblemsStepParams;
};
export type FamilyParams<F extends GeneratorFamilyId> = FamilyParamsMap[F];

/**
 * Runtime schemas keyed by family id (defineSkill validates through this).
 * Typed via a concrete mapped-type intermediate: TS 6.0.3 misparses a
 * generic alias's indexed access (FamilyParams[F]) directly inside another
 * generic's angle brackets, so the schema map is materialized first.
 */
type StepSchemaMap = { [F in GeneratorFamilyId]: z.ZodType<FamilyParamsMap[F]> };

export const STEP_PARAM_SCHEMAS: { [F in GeneratorFamilyId]: StepSchemaMap[F] } = {
  addsub: addSubStepSchema,
  mult: multStepSchema,
  div: divStepSchema,
  placevalue: placeValueStepSchema,
  factorsmultiples: factorsMultiplesStepSchema,
  fractions: fractionsStepSchema,
  decimals: decimalsStepSchema,
  money: moneyStepSchema,
  measurement: measurementStepSchema,
  geometry: geometryStepSchema,
  datareading: dataReadingStepSchema,
  wordproblems: wordProblemsStepSchema,
};

// ---------------------------------------------------------------------------
// Difficulty monotonicity (plan 3.1: steps get marginally harder)
// ---------------------------------------------------------------------------

function nonDecreasing(label: string, prev: number, next: number): string[] {
  return next >= prev ? [] : [`${label} must not decrease (${prev} -> ${next})`];
}

function nonIncreasing(label: string, prev: number, next: number): string[] {
  return next <= prev ? [] : [`${label} must not increase (${prev} -> ${next})`];
}

/** Boolean difficulty flag: false -> true allowed, true -> false forbidden. */
function onlyHarder(label: string, prev: boolean, next: boolean): string[] {
  return next || !prev ? [] : [`${label} must not go true -> false`];
}

/** Boolean ease flag: true -> false allowed (harder), false -> true forbidden. */
function onlyHarderWhenFalse(label: string, prev: boolean, next: boolean): string[] {
  return !next || prev ? [] : [`${label} must not go false -> true`];
}

function rank<T extends string>(order: readonly T[], value: T): number {
  const index = order.indexOf(value);
  if (index < 0) throw new Error(`value ${value} not in order list`);
  return index;
}

function nonDecreasingRank<T extends string>(
  label: string,
  order: readonly T[],
  prev: T,
  next: T,
): string[] {
  return nonDecreasing(label, rank(order, prev), rank(order, next));
}

function superset<T>(label: string, prev: readonly T[], next: readonly T[]): string[] {
  const nextSet = new Set(next);
  return prev.every((value) => nextSet.has(value))
    ? []
    : [`${label} set must only grow (${JSON.stringify(prev)} -> ${JSON.stringify(next)})`];
}

function sameWhenPresent(label: string, prev: unknown, next: unknown): string[] {
  return prev !== undefined &&
    next !== undefined &&
    JSON.stringify(prev) !== JSON.stringify(next)
    ? [`${label} must stay constant within a skill`]
    : [];
}

type Comparator = (prev: unknown, next: unknown) => string[];

const ADDSUB_COMPARE: Comparator = (p, n) => {
  const a = p as AddSubStepParams;
  const b = n as AddSubStepParams;
  return [
    ...nonDecreasing("itemCount", a.itemCount, b.itemCount),
    ...nonIncreasing("min", a.min, b.min),
    ...nonDecreasing("max", a.max, b.max),
    ...onlyHarder("regroup", a.regroup, b.regroup),
    ...nonDecreasingRank("operation", ADDSUB_OPERATION_ORDER, a.operation, b.operation),
    ...nonDecreasingRank(
      "missingPosition",
      MISSING_POSITION_ORDER,
      a.missingPosition ?? "result",
      b.missingPosition ?? "result",
    ),
  ];
};

const MULT_COMPARE: Comparator = (p, n) => {
  const a = p as MultStepParams;
  const b = n as MultStepParams;
  return [
    ...nonDecreasing("itemCount", a.itemCount, b.itemCount),
    ...nonIncreasing("minA", a.minA, b.minA),
    ...nonDecreasing("maxA", a.maxA, b.maxA),
    ...nonIncreasing("minB", a.minB, b.minB),
    ...nonDecreasing("maxB", a.maxB, b.maxB),
    ...nonDecreasingRank(
      "missingPosition",
      MISSING_POSITION_ORDER,
      a.missingPosition ?? "result",
      b.missingPosition ?? "result",
    ),
  ];
};

const DIV_COMPARE: Comparator = (p, n) => {
  const a = p as DivStepParams;
  const b = n as DivStepParams;
  return [
    ...nonDecreasing("itemCount", a.itemCount, b.itemCount),
    ...nonIncreasing("minDividend", a.minDividend, b.minDividend),
    ...nonDecreasing("maxDividend", a.maxDividend, b.maxDividend),
    ...nonIncreasing("minDivisor", a.minDivisor, b.minDivisor),
    ...nonDecreasing("maxDivisor", a.maxDivisor, b.maxDivisor),
    ...onlyHarder("allowRemainder", a.allowRemainder, b.allowRemainder),
  ];
};

const PLACEVALUE_COMPARE: Comparator = (p, n) => {
  const a = p as PlaceValueStepParams;
  const b = n as PlaceValueStepParams;
  return [
    ...nonDecreasing("itemCount", a.itemCount, b.itemCount),
    ...nonDecreasing("max", a.max, b.max),
    ...nonDecreasingRank("mode", PLACEVALUE_MODE_ORDER, a.mode, b.mode),
    ...(a.roundTo !== undefined && b.roundTo !== undefined
      ? nonIncreasing("roundTo", a.roundTo, b.roundTo)
      : []),
    ...onlyHarder("descending", a.descending ?? false, b.descending ?? false),
  ];
};

const FACTORSMULTIPLES_COMPARE: Comparator = (p, n) => {
  const a = p as FactorsMultiplesStepParams;
  const b = n as FactorsMultiplesStepParams;
  return [
    ...nonDecreasing("itemCount", a.itemCount, b.itemCount),
    ...nonDecreasing("max", a.max, b.max),
    ...nonDecreasingRank("mode", FACTORSMULTIPLES_MODE_ORDER, a.mode, b.mode),
    ...(a.op !== undefined && b.op !== undefined
      ? nonDecreasingRank("op", PATTERN_OP_ORDER, a.op, b.op)
      : []),
    ...(a.factorMax !== undefined && b.factorMax !== undefined
      ? nonDecreasing("factorMax", a.factorMax, b.factorMax)
      : []),
  ];
};

const FRACTIONS_COMPARE: Comparator = (p, n) => {
  const a = p as FractionsStepParams;
  const b = n as FractionsStepParams;
  return [
    ...nonDecreasing("itemCount", a.itemCount, b.itemCount),
    ...nonDecreasingRank("mode", FRACTIONS_MODE_ORDER, a.mode, b.mode),
    ...onlyHarderWhenFalse("sameDen", a.sameDen, b.sameDen),
    ...superset("denominators", a.denominators, b.denominators),
    ...onlyHarder("requireSimplify", a.requireSimplify ?? false, b.requireSimplify ?? false),
    ...(a.maxWhole !== undefined && b.maxWhole !== undefined
      ? nonDecreasing("maxWhole", a.maxWhole, b.maxWhole)
      : []),
  ];
};

const DECIMALS_COMPARE: Comparator = (p, n) => {
  const a = p as DecimalsStepParams;
  const b = n as DecimalsStepParams;
  return [
    ...nonDecreasing("itemCount", a.itemCount, b.itemCount),
    ...nonDecreasingRank("mode", DECIMALS_MODE_ORDER, a.mode, b.mode),
    ...nonDecreasing("places", a.places, b.places),
    ...(a.max !== undefined && b.max !== undefined
      ? nonDecreasing("max", a.max, b.max)
      : []),
    ...(a.denominators !== undefined && b.denominators !== undefined
      ? superset("denominators", a.denominators, b.denominators)
      : []),
    ...onlyHarder("descending", a.descending ?? false, b.descending ?? false),
  ];
};

const MONEY_COMPARE: Comparator = (p, n) => {
  const a = p as MoneyStepParams;
  const b = n as MoneyStepParams;
  return [
    ...nonDecreasing("itemCount", a.itemCount, b.itemCount),
    ...nonDecreasingRank("mode", MONEY_MODE_ORDER, a.mode, b.mode),
    ...nonDecreasing("max", a.max, b.max),
  ];
};

const MEASUREMENT_COMPARE: Comparator = (p, n) => {
  const a = p as MeasurementStepParams;
  const b = n as MeasurementStepParams;
  return [
    ...nonDecreasing("itemCount", a.itemCount, b.itemCount),
    ...nonDecreasingRank("mode", MEASUREMENT_MODE_ORDER, a.mode, b.mode),
    ...nonDecreasing("max", a.max, b.max),
    ...sameWhenPresent("units", a.units, b.units),
    ...(a.direction !== undefined && b.direction !== undefined
      ? nonDecreasingRank("direction", MEASUREMENT_DIRECTION_ORDER, a.direction, b.direction)
      : []),
    ...(a.shape !== undefined && b.shape !== undefined
      ? nonDecreasingRank("shape", MEASUREMENT_SHAPE_ORDER, a.shape, b.shape)
      : []),
    ...onlyHarder("withCarry", a.withCarry ?? false, b.withCarry ?? false),
  ];
};

const GEOMETRY_COMPARE: Comparator = (p, n) => {
  const a = p as GeometryStepParams;
  const b = n as GeometryStepParams;
  return [
    ...nonDecreasing("itemCount", a.itemCount, b.itemCount),
    ...nonDecreasingRank("mode", GEOMETRY_MODE_ORDER, a.mode, b.mode),
    ...nonDecreasing("max", a.max, b.max),
    ...(a.shapes !== undefined && b.shapes !== undefined
      ? superset("shapes", a.shapes, b.shapes)
      : []),
    ...(a.pieces !== undefined && b.pieces !== undefined
      ? nonDecreasing("pieces", a.pieces, b.pieces)
      : []),
    ...(a.angleTask !== undefined && b.angleTask !== undefined
      ? nonDecreasingRank("angleTask", GEOMETRY_ANGLE_TASK_ORDER, a.angleTask, b.angleTask)
      : []),
    ...(a.sumTo !== undefined && b.sumTo !== undefined
      ? nonDecreasing("sumTo", a.sumTo, b.sumTo)
      : []),
  ];
};

const DATAREADING_COMPARE: Comparator = (p, n) => {
  const a = p as DataReadingStepParams;
  const b = n as DataReadingStepParams;
  return [
    ...nonDecreasing("itemCount", a.itemCount, b.itemCount),
    ...nonDecreasingRank("mode", DATAREADING_MODE_ORDER, a.mode, b.mode),
    ...nonDecreasingRank("task", DATAREADING_TASK_ORDER, a.task, b.task),
    ...nonDecreasing("maxRows", a.maxRows, b.maxRows),
    ...nonDecreasing("maxScale", a.maxScale, b.maxScale),
    ...nonDecreasing("maxTotal", a.maxTotal, b.maxTotal),
  ];
};

const WORDPROBLEMS_COMPARE: Comparator = (p, n) => {
  const a = p as WordProblemsStepParams;
  const b = n as WordProblemsStepParams;
  return [
    ...nonDecreasing("itemCount", a.itemCount, b.itemCount),
    ...nonDecreasing("max", a.max, b.max),
    ...nonDecreasing("steps", a.steps, b.steps),
    ...superset("operations", a.operations, b.operations),
  ];
};

const FAMILY_COMPARATORS: Record<GeneratorFamilyId, Comparator> = {
  addsub: ADDSUB_COMPARE,
  mult: MULT_COMPARE,
  div: DIV_COMPARE,
  placevalue: PLACEVALUE_COMPARE,
  factorsmultiples: FACTORSMULTIPLES_COMPARE,
  fractions: FRACTIONS_COMPARE,
  decimals: DECIMALS_COMPARE,
  money: MONEY_COMPARE,
  measurement: MEASUREMENT_COMPARE,
  geometry: GEOMETRY_COMPARE,
  datareading: DATAREADING_COMPARE,
  wordproblems: WORDPROBLEMS_COMPARE,
};

/**
 * Validate every consecutive step pair of one skill against the family's
 * monotone-difficulty rules. Returns human-readable violation strings;
 * empty means the skill's ladder is monotone.
 */
export function stepMonotonicityIssues(family: GeneratorFamilyId, steps: StepParams[]): string[] {
  const compare = FAMILY_COMPARATORS[family];
  const issues: string[] = [];
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1] as StepParams;
    const next = steps[i] as StepParams;
    for (const issue of compare(prev.params, next.params)) {
      issues.push(`step ${prev.step} -> ${next.step}: ${issue}`);
    }
  }
  return issues;
}
