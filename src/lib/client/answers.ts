/**
 * Client answer drafts (widget state before parsing) — pure, testable.
 *
 * Drafts are a genuinely client concern: the drill player keeps per-item
 * drafts in widget state and these helpers parse them into contract `Answer`
 * values. Everything after parsing — equality and grading — is NOT defined
 * here: it is re-exported from the engine (src/lib/engine/answers.ts), the
 * one implementation behind the engine seam. The client grades first for
 * instant feedback with the exact semantics the server re-grades and records
 * with, so the child can never see ✗ and the synced record say ✓ (plan
 * section 6; architecture review candidate 2).
 */

import type {
  Answer,
  DecimalAnswer,
  FractionAnswer,
  IntegerAnswer,
  MixedNumberAnswer,
  MoneyRupiahAnswer,
  UnitValueAnswer,
} from "@/lib/engine/types";

// ---------------------------------------------------------------------------
// Equality and grading — one implementation, the engine's
// ---------------------------------------------------------------------------

export {
  answersEqual,
  countCorrect,
  gradeItem,
  gradeItems,
} from "@/lib/engine/answers";

// ---------------------------------------------------------------------------
// Drafts (widget state before parsing)
// ---------------------------------------------------------------------------

export type IntegerDraft = { digits: string; negative: boolean };
export type DecimalDraft = { intPart: string; decPart: string; negative: boolean };
export type FractionDraft = { n: string; d: string; negative: boolean };
export type MixedDraft = { w: string; n: string; d: string; negative: boolean };
export type MoneyDraft = { digits: string };
export type UnitDraft = { digits: string; unit: string | null };

export type AnswerDraft =
  | { kind: "integer"; draft: IntegerDraft }
  | { kind: "decimal"; draft: DecimalDraft }
  | { kind: "fraction"; draft: FractionDraft }
  | { kind: "mixed"; draft: MixedDraft }
  | { kind: "moneyRupiah"; draft: MoneyDraft }
  | { kind: "unitValue"; draft: UnitDraft };

export function emptyDraft(
  answerType: Answer["kind"],
  units: string[] = [],
): AnswerDraft {
  switch (answerType) {
    case "integer":
      return { kind: "integer", draft: { digits: "", negative: false } };
    case "decimal":
      return { kind: "decimal", draft: { intPart: "", decPart: "", negative: false } };
    case "fraction":
      return { kind: "fraction", draft: { n: "", d: "", negative: false } };
    case "mixed":
      return { kind: "mixed", draft: { w: "", n: "", d: "", negative: false } };
    case "moneyRupiah":
      return { kind: "moneyRupiah", draft: { digits: "" } };
    case "unitValue":
      return { kind: "unitValue", draft: { digits: "", unit: units[0] ?? null } };
  }
}

function digitsToNumber(digits: string): number | null {
  if (!/^\d+$/.test(digits)) return null;
  return Number(digits);
}

/** Parse a draft into an Answer, or null when incomplete/invalid. */
export function parseDraft(input: AnswerDraft): Answer | null {
  switch (input.kind) {
    case "integer": {
      const value = digitsToNumber(input.draft.digits);
      if (value === null) return null;
      const signed = input.draft.negative ? -value : value;
      const a: IntegerAnswer = { kind: "integer", value: signed };
      return a;
    }
    case "decimal": {
      if (!/^\d*$/.test(input.draft.intPart) || !/^\d*$/.test(input.draft.decPart)) {
        return null;
      }
      if (input.draft.intPart === "" && input.draft.decPart === "") return null;
      const places = input.draft.decPart.length;
      const text = `${input.draft.intPart || "0"}.${input.draft.decPart}`;
      const abs = Number(text);
      if (!Number.isFinite(abs)) return null;
      const a: DecimalAnswer = {
        kind: "decimal",
        value: input.draft.negative ? -abs : abs,
        places,
      };
      return a;
    }
    case "fraction": {
      const n = digitsToNumber(input.draft.n);
      const d = digitsToNumber(input.draft.d);
      if (n === null || d === null || d === 0) return null;
      const a: FractionAnswer = {
        kind: "fraction",
        n: input.draft.negative ? -n : n,
        d,
      };
      return a;
    }
    case "mixed": {
      const w = digitsToNumber(input.draft.w);
      const n = digitsToNumber(input.draft.n);
      const d = digitsToNumber(input.draft.d);
      if (w === null || d === null || d === 0) return null;
      // n may be empty when the child answers a whole number in mixed form.
      const frac = n === null ? 0 : n;
      const a: MixedNumberAnswer = {
        kind: "mixed",
        w: input.draft.negative ? -w : w,
        n: frac,
        d,
      };
      return a;
    }
    case "moneyRupiah": {
      const value = digitsToNumber(input.draft.digits);
      if (value === null) return null;
      const a: MoneyRupiahAnswer = { kind: "moneyRupiah", value };
      return a;
    }
    case "unitValue": {
      const value = digitsToNumber(input.draft.digits);
      if (value === null || input.draft.unit === null) return null;
      const a: UnitValueAnswer = { kind: "unitValue", value, unit: input.draft.unit };
      return a;
    }
  }
}
