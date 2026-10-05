"use client";

/**
 * Self-correction phase (plan sections 3.1 step 6 and 3.2): the child retries
 * each wrong item while the session clock keeps running. Two failed
 * corrections escalate to a worked example (CPA ladder).
 */

import { AnswerInput, ChoiceInput } from "@/components/answer/AnswerInput";
import { HintView } from "@/components/hints/HintView";
import { answersEqual, emptyDraft, type AnswerDraft } from "@/lib/client/answers";
import { formatAnswer } from "@/lib/client/format";
import type { Item } from "@/lib/engine/types";

type Props = {
  item: Item;
  qIdx: number;
  queueLength: number;
  /** Failed correction attempts so far for this item. */
  tries: number;
  cpaMode: boolean;
  /** Item whose pictorial hint is currently open (or null). */
  hintItemId: string | null;
  /** Worked-example item (ladder escalation), or null. */
  workedItem: Item | null;
  corrDraft: AnswerDraft | null;
  setCorrDraft: (d: AnswerDraft | null) => void;
  submitCorrection: () => void;
  advanceQueue: () => void;
  bumpCorrectionTries: (itemId: string) => void;
  notice: string | null;
};

/** Pure: is the pictorial hint visible during this correction attempt? */
function isCorrectionHintVisible(
  item: Item,
  cpaMode: boolean,
  hintItemId: string | null,
  tries: number,
): boolean {
  return Boolean(item.hint) && (cpaMode || hintItemId === item.id || tries >= 1);
}

/** Pure: the draft shown for correction — the kept one or a fresh empty one. */
function correctionDraftFor(item: Item, corrDraft: AnswerDraft | null): AnswerDraft {
  const units = item.answer.kind === "unitValue" ? [item.answer.unit] : [];
  return corrDraft ?? emptyDraft(item.answerType, units);
}

export function DrillCorrectionView({
  item,
  qIdx,
  queueLength,
  tries,
  cpaMode,
  hintItemId,
  workedItem,
  corrDraft,
  setCorrDraft,
  submitCorrection,
  advanceQueue,
  bumpCorrectionTries,
  notice,
}: Props) {
  const showHint = isCorrectionHintVisible(item, cpaMode, hintItemId, tries);
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-28 pt-4">
      <header className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-500">Perbaikan jawaban</span>
        <span className="rounded-full bg-pink-100 px-3 py-1 text-xs font-semibold text-pink-700">
          {qIdx + 1} / {queueLength} salah
        </span>
      </header>
      <div className="rounded-2xl bg-white p-5 text-center shadow-sm ring-1 ring-pink-200">
        <p className="text-xs font-semibold uppercase tracking-wide text-pink-600">Jawabanmu belum tepat</p>
        <p className="mt-2 text-2xl font-bold leading-relaxed text-slate-900">{item.prompt}</p>
      </div>

      {workedItem && workedItem.id === item.id ? (
        <WorkedExample item={workedItem} onDone={advanceQueue} />
      ) : (
        <>
          {item.choices ? (
            <ChoiceInput
              choices={item.choices}
              onSubmit={(a) => {
                if (answersEqual(a, item.answer)) advanceQueue();
                else bumpCorrectionTries(item.id);
              }}
            />
          ) : (
            <AnswerInput
              answerType={item.answerType}
              units={item.answer.kind === "unitValue" ? [item.answer.unit] : []}
              draft={correctionDraftFor(item, corrDraft)}
              onChange={setCorrDraft}
              onSubmit={submitCorrection}
            />
          )}

          {showHint && item.hint && <HintView model={item.hint.model} payload={item.hint.payload} />}

          {notice && <p className="rounded-xl bg-amber-50 px-3 py-2 text-center text-sm text-amber-700">{notice}</p>}

          <CorrectionActions
            hasChoices={Boolean(item.choices)}
            onSkip={advanceQueue}
            onSubmit={submitCorrection}
          />
        </>
      )}
    </div>
  );
}

/** Sticky correction action bar: skip always, submit for keyed answers. */
function CorrectionActions({
  hasChoices,
  onSkip,
  onSubmit,
}: {
  hasChoices: boolean;
  onSkip: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 flex gap-2 border-t border-slate-100 bg-white/95 p-3 backdrop-blur">
      <button
        type="button"
        onClick={onSkip}
        className="min-h-12 rounded-xl bg-slate-100 px-4 text-sm font-semibold text-slate-600"
      >
        Lewati dulu
      </button>
      {!hasChoices && (
        <button
          type="button"
          onClick={onSubmit}
          className="min-h-12 flex-1 rounded-xl bg-blue-600 text-base font-bold text-white shadow active:bg-blue-700"
        >
          Periksa Perbaikan
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Worked example (plan 3.2): solved example with CPA steps annotated
// ---------------------------------------------------------------------------

function WorkedExample({ item, onDone }: { item: Item; onDone: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-violet-200">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
        Contoh penyelesaian
      </p>
      <p className="text-xl font-bold text-slate-900">{item.prompt}</p>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
        <li>Pahami apa yang ditanya soal.</li>
        <li>Gambar modelnya (batang/garis/susunan) dan tulis yang diketahui.</li>
        <li>Tulis kalimat matematika dari gambar.</li>
        <li>Hitung, lalu periksa kembali jawabanmu.</li>
      </ol>
      {item.hint && <HintView model={item.hint.model} payload={item.hint.payload} interactive={false} />}
      <p className="rounded-xl bg-emerald-50 px-3 py-2 text-center text-lg font-bold text-emerald-700">
        {item.prompt.replace(/\.*$/, "")} = {formatAnswer(item.answer)}
      </p>
      <button
        type="button"
        onClick={onDone}
        className="min-h-12 rounded-xl bg-violet-600 text-base font-bold text-white active:bg-violet-700"
      >
        Saya paham, lanjut
      </button>
    </div>
  );
}
