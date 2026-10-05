"use client";

/**
 * Answer input widgets (plan section 5, answer input spec):
 * - numeric keypad for integers/money
 * - decimal entry with Indonesian comma
 * - stacked numerator/denominator widget for fractions
 * - whole + fraction fields for mixed numbers
 * - numeric entry with unit chips for unitValue
 * - tap buttons when the item carries choices
 * Mobile-first: every tap target >= 48px, no hover dependence.
 */

import { useCallback, useEffect, useEffectEvent, useState } from "react";

import { formatAnswer, formatNumberId } from "@/lib/client/format";
import type {
  AnswerDraft,
  DecimalDraft,
  FractionDraft,
  IntegerDraft,
  MixedDraft,
} from "@/lib/client/answers";
import type { Answer, AnswerType } from "@/lib/engine/types";

const MAX_DIGITS = 7;

type Props = {
  answerType: AnswerType;
  units: string[];
  draft: AnswerDraft;
  onChange: (next: AnswerDraft) => void;
  onSubmit: () => void;
  disabled?: boolean;
};

export function AnswerInput({ answerType, units, draft, onChange, onSubmit, disabled }: Props) {
  const [focused, setFocused] = useState("main");

  const press = useCallback(
    (key: string) => {
      if (disabled) return;
      if (key === "back") {
        onChange(backspace(draft, focused));
        return;
      }
      if (key === "sign") {
        onChange(toggleSign(draft));
        return;
      }
      if (key === ",") {
        if (draft.kind === "decimal") {
          setFocused("dec");
        }
        return;
      }
      if (!/^\d$/.test(key)) return;
      onChange(appendDigit(draft, focused, key));
    },
    [disabled, draft, focused, onChange],
  );

  // Physical keyboard support (desktop); mobile uses the on-screen pad.
  // The listener reads the latest draft/focused state through the Effect
  // Event, so the subscription itself never re-attaches between keystrokes.
  const onPhysicalKey = useEffectEvent((e: KeyboardEvent) => {
    if (disabled) return;
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === "Backspace") press("back");
    else if (e.key === "-" || e.key === "+") press("sign");
    else if (e.key === "," || e.key === ".") press(",");
    else if (e.key === "Enter") onSubmit();
  });
  useEffect(() => {
    window.addEventListener("keydown", onPhysicalKey);
    return () => window.removeEventListener("keydown", onPhysicalKey);
    // Effect Events are stable by definition: the subscription attaches once
    // and always reads the latest state through onPhysicalKey.
  }, []);

  const keys = keypadKeys(answerType);

  return (
    <div className="flex flex-col gap-4">
      {draft.kind === "integer" && (
        <DisplayField
          label="Jawaban"
          text={renderSigned(draft.draft)}
          active
          placeholder="0"
        />
      )}
      {draft.kind === "moneyRupiah" && (
        <DisplayField
          label="Jumlah uang"
          text={`Rp${formatNumberId(Number(draft.draft.digits || 0), 0)}`}
          active={draft.draft.digits !== ""}
          placeholder="Rp0"
        />
      )}
      {draft.kind === "decimal" && (
        <DisplayField
          label="Jawaban"
          text={renderDecimal(draft.draft, focused)}
          active
          placeholder="0"
          onClick={() => setFocused("int")}
        />
      )}
      {draft.kind === "fraction" && (
        <FractionDisplay
          draft={draft.draft}
          focused={focused}
          onFocus={setFocused}
          negative={draft.draft.negative}
        />
      )}
      {draft.kind === "mixed" && (
        <MixedDisplay draft={draft.draft} focused={focused} onFocus={setFocused} />
      )}
      {draft.kind === "unitValue" && (
        <div className="flex flex-col gap-3">
          <DisplayField
            label="Angka"
            text={draft.draft.digits === "" ? "" : formatNumberId(Number(draft.draft.digits), 0)}
            active={focused === "main"}
            placeholder="0"
            onClick={() => setFocused("main")}
          />
          <div className="flex flex-wrap gap-2">
            {units.map((u) => (
              <button
                key={u}
                type="button"
                disabled={disabled}
                onClick={() => onChange({ ...draft, draft: { ...draft.draft, unit: u } } as AnswerDraft)}
                className={`min-h-11 rounded-full px-4 text-base font-semibold transition ${
                  draft.draft.unit === u
                    ? "bg-blue-600 text-white"
                    : "bg-white text-slate-700 ring-1 ring-slate-300"
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2" aria-label="Papan angka">
        {keys.map((k) => (
          <button
            key={k.key}
            type="button"
            disabled={disabled}
            onClick={() => press(k.key)}
            className={`min-h-14 rounded-xl bg-white text-xl font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 transition active:bg-blue-100 disabled:opacity-40 ${
              k.wide ? "col-span-3" : ""
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Keypad layouts
// ---------------------------------------------------------------------------

function keypadKeys(answerType: AnswerType): { key: string; label: string; wide?: boolean }[] {
  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => ({ key: d, label: d }));
  if (answerType === "decimal") {
    return [
      ...digits,
      { key: "sign", label: "±" },
      { key: "0", label: "0" },
      { key: ",", label: "," },
      // The decimal layout has no text field, so touch users can only erase
      // through the pad — give ⌫ its own full-width row down here.
      { key: "back", label: "⌫", wide: true },
    ];
  }
  return [
    ...digits,
    { key: "sign", label: "±" },
    { key: "0", label: "0" },
    { key: "back", label: "⌫" },
  ];
}

// ---------------------------------------------------------------------------
// Draft editing (pure)
// ---------------------------------------------------------------------------

function clampDigits(s: string, max = MAX_DIGITS): string {
  return s.slice(0, max);
}

function appendDigit(draft: AnswerDraft, focused: string, digit: string): AnswerDraft {
  switch (draft.kind) {
    case "integer":
      return { ...draft, draft: { ...draft.draft, digits: clampDigits(draft.draft.digits + digit) } };
    case "moneyRupiah":
      return {
        ...draft,
        draft: { ...draft.draft, digits: clampDigits(draft.draft.digits + digit, 9) },
      };
    case "unitValue":
      return {
        ...draft,
        draft: { ...draft.draft, digits: clampDigits(draft.draft.digits + digit) },
      };
    case "decimal": {
      if (focused === "dec") {
        if (draft.draft.decPart.length >= 4) return draft;
        return { ...draft, draft: { ...draft.draft, decPart: draft.draft.decPart + digit } };
      }
      return { ...draft, draft: { ...draft.draft, intPart: clampDigits(draft.draft.intPart + digit) } };
    }
    case "fraction":
      if (focused === "d") {
        return { ...draft, draft: { ...draft.draft, d: clampDigits(draft.draft.d + digit, 3) } };
      }
      return { ...draft, draft: { ...draft.draft, n: clampDigits(draft.draft.n + digit) } };
    case "mixed":
      if (focused === "n") {
        return { ...draft, draft: { ...draft.draft, n: clampDigits(draft.draft.n + digit, 3) } };
      }
      if (focused === "d") {
        return { ...draft, draft: { ...draft.draft, d: clampDigits(draft.draft.d + digit, 3) } };
      }
      return { ...draft, draft: { ...draft.draft, w: clampDigits(draft.draft.w + digit, 4) } };
  }
}

function backspace(draft: AnswerDraft, focused: string): AnswerDraft {
  switch (draft.kind) {
    case "integer":
      return { ...draft, draft: { ...draft.draft, digits: draft.draft.digits.slice(0, -1) } };
    case "moneyRupiah":
      return { ...draft, draft: { ...draft.draft, digits: draft.draft.digits.slice(0, -1) } };
    case "unitValue":
      return { ...draft, draft: { ...draft.draft, digits: draft.draft.digits.slice(0, -1) } };
    case "decimal":
      if (focused === "dec" && draft.draft.decPart !== "") {
        return { ...draft, draft: { ...draft.draft, decPart: draft.draft.decPart.slice(0, -1) } };
      }
      return { ...draft, draft: { ...draft.draft, intPart: draft.draft.intPart.slice(0, -1) } };
    case "fraction":
      if (focused === "d") {
        return { ...draft, draft: { ...draft.draft, d: draft.draft.d.slice(0, -1) } };
      }
      return { ...draft, draft: { ...draft.draft, n: draft.draft.n.slice(0, -1) } };
    case "mixed":
      if (focused === "n") return { ...draft, draft: { ...draft.draft, n: draft.draft.n.slice(0, -1) } };
      if (focused === "d") return { ...draft, draft: { ...draft.draft, d: draft.draft.d.slice(0, -1) } };
      return { ...draft, draft: { ...draft.draft, w: draft.draft.w.slice(0, -1) } };
  }
}

function toggleSign(draft: AnswerDraft): AnswerDraft {
  switch (draft.kind) {
    case "integer":
      return { kind: "integer", draft: { ...draft.draft, negative: !draft.draft.negative } };
    case "decimal":
      return { kind: "decimal", draft: { ...draft.draft, negative: !draft.draft.negative } };
    case "fraction":
      return { kind: "fraction", draft: { ...draft.draft, negative: !draft.draft.negative } };
    case "mixed":
      return { kind: "mixed", draft: { ...draft.draft, negative: !draft.draft.negative } };
    default:
      return draft;
  }
}

// ---------------------------------------------------------------------------
// Display pieces
// ---------------------------------------------------------------------------

function renderSigned(d: IntegerDraft): string {
  if (d.digits === "") return d.negative ? "-" : "";
  return `${d.negative ? "-" : ""}${formatNumberId(Number(d.digits), 0)}`;
}

function renderDecimal(d: DecimalDraft, focused: string): string {
  const sign = d.negative ? "-" : "";
  const int = d.intPart === "" ? "0" : formatNumberId(Number(d.intPart), 0);
  const cursorDec = focused === "dec" ? "|" : "";
  return `${sign}${int}${d.decPart !== "" || focused === "dec" ? "," : ""}${d.decPart}${cursorDec}`;
}

function DisplayField({
  label,
  text,
  active,
  placeholder,
  onClick,
}: {
  label: string;
  text: string;
  active: boolean;
  placeholder?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl bg-white px-4 py-3 text-left shadow-sm ring-2 transition ${
        active ? "ring-blue-500" : "ring-slate-200"
      }`}
    >
      <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span className="block text-3xl font-bold tabular-nums text-slate-900" dir="ltr">
        {text || <span className="text-slate-300">{placeholder ?? "0"}</span>}
      </span>
    </button>
  );
}

function FractionDisplay({
  draft,
  focused,
  onFocus,
  negative,
}: {
  draft: FractionDraft;
  focused: string;
  onFocus: (f: string) => void;
  negative: boolean;
}) {
  return (
    <div className="flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-4 py-4 shadow-sm ring-2 ring-blue-500">
      {negative && <span className="text-3xl font-bold text-slate-900">−</span>}
      <span className="inline-flex flex-col items-center gap-1">
        <FieldBox
          text={draft.n}
          active={focused === "n"}
          onFocus={() => onFocus("n")}
          label="Pembilang"
          wide
        />
        <span className="h-1 w-24 rounded bg-slate-800" />
        <FieldBox
          text={draft.d}
          active={focused === "d"}
          onFocus={() => onFocus("d")}
          label="Penyebut"
          wide
        />
      </span>
      <span className="text-xs font-medium text-slate-500">ketuk untuk pindah pembilang/penyebut</span>
    </div>
  );
}

function MixedDisplay({
  draft,
  focused,
  onFocus,
}: {
  draft: MixedDraft;
  focused: string;
  onFocus: (f: string) => void;
}) {
  return (
    <div className="flex w-full items-end justify-center gap-4 rounded-2xl bg-white px-4 py-4 shadow-sm ring-2 ring-blue-500">
      {draft.negative && <span className="pb-2 text-3xl font-bold text-slate-900">−</span>}
      <span className="flex flex-col items-center gap-1">
        <span className="text-xs font-medium text-slate-500">bilangan utuh</span>
        <FieldBox
          text={draft.w}
          active={focused === "w"}
          onFocus={() => onFocus("w")}
          label="Bilangan utuh"
        />
      </span>
      <span className="flex flex-col items-center gap-1 pb-2">
        <FieldBox
          text={draft.n}
          active={focused === "n"}
          onFocus={() => onFocus("n")}
          label="Pembilang"
        />
        <span className="h-0.5 w-14 rounded bg-slate-800" />
        <FieldBox
          text={draft.d}
          active={focused === "d"}
          onFocus={() => onFocus("d")}
          label="Penyebut"
        />
      </span>
    </div>
  );
}

function FieldBox({
  text,
  active,
  onFocus,
  label,
  wide,
}: {
  text: string;
  active: boolean;
  onFocus: () => void;
  /** Accessible name — the box itself may show only a placeholder dash. */
  label: string;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={active ? `${label} (aktif)` : label}
      onClick={onFocus}
      className={`inline-flex ${wide ? "h-12 w-24" : "h-12 w-16"} items-center justify-center rounded-lg text-3xl font-bold tabular-nums ring-2 transition ${
        active ? "bg-blue-50 text-slate-900 ring-blue-500" : "text-slate-900 ring-slate-200"
      }`}
    >
      {text || <span className="text-slate-300">–</span>}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Choices (tap input)
// ---------------------------------------------------------------------------

export function ChoiceInput({
  choices,
  onSubmit,
  disabled,
}: {
  choices: Answer[];
  onSubmit: (a: Answer) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {/* The engine guarantees distinct choices (families-shared.ts), so the
          rendered answer text is a stable per-item key. */}
      {choices.map((c) => (
        <button
          key={formatAnswer(c)}
          type="button"
          disabled={disabled}
          onClick={() => onSubmit(c)}
          className="min-h-16 rounded-2xl bg-white px-4 text-2xl font-bold text-slate-900 shadow-sm ring-1 ring-slate-200 transition active:bg-blue-100 disabled:opacity-40"
        >
          {formatAnswer(c)}
        </button>
      ))}
    </div>
  );
}
