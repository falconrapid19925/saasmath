"use client";

/**
 * Result phase: score, the gate banner (predicted vs server-decided), the SCT
 * comparison, the wrong-answer recap, and the CPA hint recap ("close the
 * link" between picture and equation).
 */

import { GateBanner, SctResult } from "@/components/drill/SctResult";
import { HintView } from "@/components/hints/HintView";
import type { SyncState } from "@/components/drill/useDrillSession";
import { countCorrect } from "@/lib/client/answers";
import { formatAnswer, formatNumberId } from "@/lib/client/format";
import type {
  ClientGateEvaluation,
  TaskDescriptor,
} from "@/lib/client/view-models";
import type { ItemResult } from "@/lib/engine/types";

type Props = {
  childName: string;
  task: TaskDescriptor;
  results: ItemResult[] | null;
  gate: ClientGateEvaluation | null;
  timeMs: number;
  starsEarned: number;
  effectiveSync: SyncState;
  hintUsedItems: Set<string>;
  resolvedItems: Set<string>;
  notice: string | null;
  loadingNext: boolean;
  loadNextTask: () => void;
  onGoHome: () => void;
};

export function DrillResultView({
  childName,
  task,
  results,
  gate,
  timeMs,
  starsEarned,
  effectiveSync,
  hintUsedItems,
  resolvedItems,
  notice,
  loadingNext,
  loadNextTask,
  onGoHome,
}: Props) {
  const accuracy = results && results.length > 0 ? countCorrect(results) / results.length : 0;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-10 pt-4">
      <header className="text-center">
        <p className="text-sm font-semibold text-slate-500">
          {task.skillTitle} · langkah {task.step}/{task.stepCount}
        </p>
        <h1 className="text-xl font-bold text-slate-900">Set selesai, {childName}!</h1>
      </header>

      <ResultGateBanner
        gate={gate}
        accuracy={accuracy}
        timed={task.timed}
        timeMs={timeMs}
        sctSeconds={task.sctSeconds}
      />

      <div className="rounded-2xl bg-white p-4 text-center shadow-sm ring-1 ring-slate-200">
        <p className="text-3xl font-extrabold text-slate-900">
          {countCorrect(results ?? [])}/{results?.length ?? 0}
        </p>
        <p className="text-sm text-slate-600">jawaban benar ({Math.round(accuracy * 100)}%)</p>
        <p className="mt-2 text-sm font-semibold text-amber-500">+{starsEarned} ⭐ (perkiraan)</p>
      </div>

      {results && results.some((r) => !r.correct) && (
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm font-semibold text-slate-700">Belum tepat — ini jawaban yang benar:</p>
          <ul className="mt-2 flex flex-col gap-2">
            {results.filter((r) => !r.correct).map((r) => {
              const it = task.items.find((i) => i.id === r.itemId);
              return (
                <li key={r.itemId} className="flex flex-col text-sm">
                  <span className="text-slate-700">{it?.prompt}</span>
                  <span className="text-slate-500">
                    jawabanmu: {r.given ? formatAnswer(r.given) : "(dikosongkan)"} · seharusnya:{" "}
                    <b className="text-emerald-600">{formatAnswer(r.expected)}</b>
                    {resolvedItems.has(r.itemId) && <span className="ml-1 text-emerald-500">✓ sudah diperbaiki</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {hintUsedItems.size > 0 && (
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm font-semibold text-slate-700">Gambar & rumus — lihat hubungannya:</p>
          {[...hintUsedItems].map((id) => {
            const it = task.items.find((i) => i.id === id);
            if (!it) return null;
            return (
              <div key={id} className="mt-3 flex flex-col gap-2">
                {it.hint && <HintView model={it.hint.model} payload={it.hint.payload} interactive={false} />}
                <p className="text-center text-lg font-bold text-slate-900">
                  {it.prompt.replace(/\.*$/, "")} = {formatAnswer(it.answer)}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-center text-xs text-slate-400">
        {effectiveSync === "synced"
          ? "Hasil sudah tersinkron ✓"
          : effectiveSync === "pending"
            ? "Menyimpan hasil…"
            : effectiveSync === "rejected"
              ? "Hasil ini belum bisa dicatat server — tetap tersimpan aman di perangkat."
              : "Tersimpan lokal, akan disinkronkan saat online."}
      </p>

      {notice && <p className="rounded-xl bg-amber-50 px-3 py-2 text-center text-sm text-amber-700">{notice}</p>}

      <NextStepButton
        loadingNext={loadingNext}
        action={gate?.decision.action ?? null}
        loadNextTask={loadNextTask}
      />
      <button
        type="button"
        onClick={onGoHome}
        className="min-h-12 w-full rounded-2xl bg-white text-sm font-semibold text-slate-600 ring-1 ring-slate-200"
      >
        Kembali ke beranda
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Focused result subcomponents
// ---------------------------------------------------------------------------

/** Gate decision banner plus the SCT comparison (timed sets only). */
function ResultGateBanner({
  gate,
  accuracy,
  timed,
  timeMs,
  sctSeconds,
}: {
  gate: ClientGateEvaluation | null;
  accuracy: number;
  timed: boolean;
  timeMs: number;
  sctSeconds: number;
}) {
  if (!gate) return null;
  return (
    <>
      <GateBanner
        action={gate.decision.action}
        withinSct={gate.decision.detail.withinSct}
        accuracy={accuracy}
      />
      {/* The gate is still the on-device prediction until the server's
          verdict arrives — keep the disclaimer up for as long as it is. */}
      {gate.source === "predicted" && (
        <p className="text-center text-xs text-slate-400">
          Status di atas perkiraan perangkatmu — keputusan final mengikuti
          setelah hasil tersinkron.
        </p>
      )}
      {timed && (
        <SctResult
          timeMs={timeMs}
          sctSeconds={sctSeconds}
          accuracy={accuracy}
          tightenedNote={
            gate.decision.action === "tighten"
              ? // SCT_TIGHTEN_FACTOR (0.9) from src/lib/server/sct.ts.
                `Target waktu berikutnya dirapatkan: ${formatNumberId(sctSeconds * 0.9, 0)} detik.`
              : null
          }
        />
      )}
    </>
  );
}

/** "Latih set berikutnya" button; label follows the gate decision. */
function NextStepButton({
  loadingNext,
  action,
  loadNextTask,
}: {
  loadingNext: boolean;
  action: string | null;
  loadNextTask: () => void;
}) {
  let label = "Lanjut ke set berikutnya";
  if (loadingNext) label = "Menyiapkan…";
  else if (action === "enter_cpa_mode") label = "Lanjut dengan bantuan gambar (tanpa waktu)";
  else if (action === "stay" || action === "tighten") label = "Coba varian baru";
  return (
    <button
      type="button"
      disabled={loadingNext}
      onClick={() => void loadNextTask()}
      className="min-h-14 w-full rounded-2xl bg-blue-600 text-base font-bold text-white shadow active:bg-blue-700 disabled:opacity-50"
    >
      {label}
    </button>
  );
}
