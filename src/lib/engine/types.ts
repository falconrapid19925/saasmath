/**
 * SaasMath drill-engine contract. Every builder codes against these types;
 * they are owned by the scaffold and may only change via neededSharedChanges.
 *
 * Design notes (from out/saasmath-plan.md sections 3 and 6):
 * - A set is fully determined by the (skillId, step, seed) triple: generators
 *   must derive every random choice from the Rng passed to `generate`, never
 *   from Math.random(), so any worksheet regenerates identically.
 * - Prompts and user-visible strings are Bahasa Indonesia; identifiers and
 *   comments are English.
 */

import type { GeneratorFamilyId } from "./families";
import type { Rng } from "./rng";

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

/** Whole-number answer, e.g. 72. */
export type IntegerAnswer = { kind: "integer"; value: number };

/**
 * Decimal answer. `value` is the numeric value; `places` is the number of
 * decimal places the item expects (drives both input widget and grading
 * precision). Display uses the Indonesian decimal comma: value 0.5 with
 * places 1 renders as "0,5".
 */
export type DecimalAnswer = { kind: "decimal"; value: number; places: number };

/** Proper or improper fraction. Denominator is always positive; sign on n. */
export type FractionAnswer = { kind: "fraction"; n: number; d: number };

/**
 * Mixed number (bilangan campuran). w carries the sign; n >= 0, d > 0.
 * Example: -2 1/4 => { w: -2, n: 1, d: 4 }.
 */
export type MixedNumberAnswer = { kind: "mixed"; w: number; n: number; d: number };

/** Rupiah amount in whole rupiah (rupiah coins below Rp100 are out of scope). */
export type MoneyRupiahAnswer = { kind: "moneyRupiah"; value: number };

/**
 * Quantity with a unit chip, e.g. { value: 250, unit: "cm" } or
 * { value: 3, unit: "jam" }. `unit` is free-form Bahasa so far; tighten to a
 * union only when the content specs need it.
 */
export type UnitValueAnswer = { kind: "unitValue"; value: number; unit: string };

export type Answer =
  | IntegerAnswer
  | DecimalAnswer
  | FractionAnswer
  | MixedNumberAnswer
  | MoneyRupiahAnswer
  | UnitValueAnswer;

export type AnswerType = Answer["kind"];

// ---------------------------------------------------------------------------
// CPA hint models (plan section 3.2 — five fixed, reusable models)
// ---------------------------------------------------------------------------

export type HintModel =
  | "part-whole" // model batang bagian-keseluruhan
  | "comparison" // model batang perbandingan
  | "fraction-bar" // model batang pecahan
  | "number-line" // garis bilangan
  | "base-ten"; // basis-sepuluh / array

/**
 * Payload for rendering one hint model. The shape depends on `model`; the
 * CPA/UI builder owns the per-model schemas (document them next to the
 * renderer). Kept permissive at the contract level so generator families can
 * attach exactly what their model needs.
 */
export type HintPayload = Record<string, unknown>;

export type ItemHint = {
  model: HintModel;
  payload: HintPayload;
};

// ---------------------------------------------------------------------------
// Items and generated sets
// ---------------------------------------------------------------------------

export type Item = {
  /** Unique within a set; convention: `${skillId}-s${step}-${seed}-${index}`. */
  id: string;
  /** Item text in Bahasa Indonesia (e.g. "12 x 8 = ..."). */
  prompt: string;
  answer: Answer;
  /** Discriminator mirror of answer.kind; drives the input widget. */
  answerType: AnswerType;
  /** Optional multiple-choice options (tap input). Absent = keyed entry. */
  choices?: Answer[];
  /** Pictorial CPA hint; absent when the skill has no CPA layer. */
  hint?: ItemHint;
};

/**
 * One difficulty step's parameter preset, stored in skills.steps json.
 * `params` is family-specific (number ranges, regroup flags, denominators,
 * itemCount, ...). Generator families read what they need and should fail
 * fast on missing keys rather than guessing defaults.
 */
export type StepParams = {
  /** 1-based difficulty step index. */
  step: number;
  params: Record<string, unknown>;
};

export type GeneratedSet = {
  skillId: string;
  step: number;
  seed: number;
  items: Item[];
  /** Standard Completion Time for this set, in seconds (plan section 3.1). */
  sctSeconds: number;
};

// ---------------------------------------------------------------------------
// Grading and mastery gates (plan section 3.1 step 5)
// ---------------------------------------------------------------------------

export type ItemResult = {
  itemId: string;
  /** null = skipped / never answered. */
  given: Answer | null;
  expected: Answer;
  correct: boolean;
};

export type GradeOutcome = {
  correctCount: number;
  total: number;
  /** Wall-clock time the child took, in milliseconds. */
  timeMs: number;
  /** The set's SCT, in seconds, for comparison. */
  sctSeconds: number;
  /** true when timeMs <= sctSeconds * 1000. */
  withinSct: boolean;
  items: ItemResult[];
};

export type GateAction =
  | "advance" // >= 95% accuracy within SCT: move to the next step/skill
  | "tighten" // accurate but over SCT: tighten the SCT target ~10%
  | "promote_fluency_flag" // three tightened cycles passed: advance with fluency focus
  | "enter_cpa_mode" // < 80% accuracy: drop into untimed CPA-hint mode
  | "stay" // no state change (e.g. still in CPA mode, not yet two clean passes)
  | "exit_cpa_mode"; // two clean CPA passes: back to timed sets

export type GateDecision = {
  action: GateAction;
  detail: {
    /** correctCount / total, in [0, 1]. */
    accuracy: number;
    withinSct: boolean;
    /** Consecutive accurate-but-over-SCT passes seen by the tighten ladder. */
    consecutiveOverTargetPasses?: number;
    /** Consecutive clean passes seen by the CPA exit ladder. */
    consecutiveCleanCpaPasses?: number;
    /** Developer-facing English note: which gate rule fired and why. */
    note: string;
  };
};

// ---------------------------------------------------------------------------
// Generator families
// ---------------------------------------------------------------------------

/**
 * A generator family produces the full item set for one (skill, step, seed):
 * item count comes from stepParams.params.itemCount, every random choice
 * comes from `rng`. Must be pure/deterministic — same inputs, same items.
 */
export interface GeneratorFamily {
  readonly id: GeneratorFamilyId;
  generate(stepParams: StepParams, rng: Rng): Item[];
}
