"use client";

/**
 * Play phase of the drill player: the current item, its answer input, the
 * optional CPA hint, and the sticky action bar (skip / advance / hint).
 */

import { AnswerInput, ChoiceInput } from "@/components/answer/AnswerInput";
import { HintView } from "@/components/hints/HintView";
import type { AnswerDraft } from "@/lib/client/answers";
import type { TaskDescriptor } from "@/lib/client/view-models";
import type { Item } from "@/lib/engine/types";

type Props = {
  task: TaskDescriptor;
  idx: number;
  item: Item;
  stallReached: boolean;
  hintAvailable: boolean;
  notice: string | null;
  /** The mounted set is the offline replay of the last offered set. */
  offlineReplay: boolean;
  draftFor: (it: Item) => AnswerDraft;
  setDraft: (it: Item, d: AnswerDraft) => void;
  commitAndAdvance: () => void;
  skip: () => void;
  openHint: (it: Item) => void;
  advancePlay: (given: Item["answer"] | null) => void;
  onGoHome: () => void;
};

export function DrillPlayView({
  task,
  idx,
  item,
  stallReached,
  hintAvailable,
  notice,
  offlineReplay,
  draftFor,
  setDraft,
  commitAndAdvance,
  skip,
  openHint,
  advancePlay,
  onGoHome,
}: Props) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-28 pt-4">
      <header className="flex items-center justify-between">
        <button type="button" onClick={onGoHome} className="text-sm font-semibold text-slate-500">
          ← Beranda
        </button>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          Soal {idx + 1} / {task.items.length}
        </span>
      </header>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-blue-500 transition-[width]" style={{ width: `${((idx + 1) / task.items.length) * 100}%` }} />
      </div>

      {offlineReplay && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-center text-xs font-semibold text-amber-800">
          Kamu sedang offline — ini set terakhir yang ditawarkan. Hasilmu
          tetap tersimpan dan terkirim otomatis nanti. 📶
        </p>
      )}

      {task.cpaMode && (
        <p className="rounded-xl bg-violet-50 px-3 py-2 text-center text-xs font-semibold text-violet-700">
          Mode bantuan gambar — tanpa waktu, semua petunjuk terbuka 🧩
        </p>
      )}

      <div className="rounded-2xl bg-white p-5 text-center shadow-sm ring-1 ring-slate-200">
        <p className="text-2xl font-bold leading-relaxed text-slate-900">{item.prompt}</p>
      </div>

      {item.choices ? (
        <ChoiceInput choices={item.choices} onSubmit={(a) => advancePlay(a)} />
      ) : (
        <AnswerInput
          answerType={item.answerType}
          units={item.answer.kind === "unitValue" ? [item.answer.unit] : []}
          draft={draftFor(item)}
          onChange={(d) => setDraft(item, d)}
          onSubmit={commitAndAdvance}
        />
      )}

      {notice && <p className="rounded-xl bg-amber-50 px-3 py-2 text-center text-sm text-amber-700">{notice}</p>}

      {hintAvailable && item.hint && (
        <div>
          <HintView model={item.hint.model} payload={item.hint.payload} />
          <p className="mt-1 text-center text-xs text-slate-400">Petunjuk tidak dihitung waktunya.</p>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 flex gap-2 border-t border-slate-100 bg-white/95 p-3 backdrop-blur">
        <button
          type="button"
          onClick={skip}
          className="min-h-12 rounded-xl bg-slate-100 px-4 text-sm font-semibold text-slate-600"
        >
          Lewati
        </button>
        {!item.choices && (
          <button
            type="button"
            onClick={commitAndAdvance}
            className="min-h-12 flex-1 rounded-xl bg-blue-600 text-base font-bold text-white shadow active:bg-blue-700"
          >
            {idx + 1 === task.items.length ? "Selesai & Kirim" : "Lanjut"}
          </button>
        )}
        {!hintAvailable && item.hint && (
          <button
            type="button"
            onClick={() => openHint(item)}
            className={`min-h-12 rounded-xl px-4 text-sm font-semibold ${
              stallReached ? "animate-pulse bg-pink-500 text-white" : "bg-slate-100 text-slate-500"
            }`}
          >
            {stallReached ? "Butuh bantuan?" : "🧩 Bantuan"}
          </button>
        )}
      </div>
    </div>
  );
}
