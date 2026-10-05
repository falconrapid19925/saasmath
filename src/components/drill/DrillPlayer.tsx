"use client";

/**
 * The drill player orchestrator (plan sections 3.1, 3.2, 4.4). Session state
 * and behavior live in useDrillSession; each phase renders through its own
 * focused view. A missing placement is a phase with a user-initiated button —
 * the /anak/latihan page guard already redirects server-side in the normal
 * flow, so no automatic client-side redirect happens here.
 */

import { useRouter } from "next/navigation";

import { DrillCorrectionView } from "@/components/drill/DrillCorrectionView";
import { DrillPlayView } from "@/components/drill/DrillPlayView";
import { DrillResultView } from "@/components/drill/DrillResultView";
import { useDrillSession } from "@/components/drill/useDrillSession";

export function DrillPlayer({ childName }: { childName: string }) {
  const router = useRouter();
  // The child's name is the offline-replay key: the outbox DB is
  // origin-scoped, so the last offered set is cached per child handle.
  const session = useDrillSession(childName);

  if (session.phase === "loading") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3">
        <p className="animate-pulse text-4xl" aria-hidden>🧮</p>
        <p className="text-sm font-semibold text-slate-500">Menyiapkan set latihan…</p>
      </div>
    );
  }

  if (session.phase === "needs_placement") {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-4xl" aria-hidden>🗺️</p>
        <h1 className="text-xl font-bold text-slate-900">Tes penempatan dulu, ya</h1>
        <p className="text-sm text-slate-600">
          Sebelum latihan rutin, ambil tes singkat untuk menentukan titik
          mulaimu. Tenang, ini bukan ulangan.
        </p>
        <button
          type="button"
          onClick={() => router.push("/anak/penempatan")}
          className="min-h-12 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white"
        >
          Ikuti tes penempatan
        </button>
      </div>
    );
  }

  if (session.phase === "unavailable" || !session.task) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-4xl" aria-hidden>🧮</p>
        <h1 className="text-xl font-bold text-slate-900">Set belum tersedia</h1>
        <p className="text-sm text-slate-600">
          {session.loadError ?? "Coba lagi beberapa saat lagi ya."}
        </p>
        <button
          type="button"
          onClick={() => router.push("/anak")}
          className="min-h-12 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white"
        >
          Kembali ke beranda
        </button>
      </div>
    );
  }

  if (session.phase === "play" && session.item) {
    return (
      <DrillPlayView
        task={session.task}
        idx={session.idx}
        item={session.item}
        stallReached={session.stallReached}
        hintAvailable={session.hintAvailable}
        notice={session.notice}
        offlineReplay={session.offlineReplay}
        draftFor={session.draftFor}
        setDraft={session.setDraft}
        commitAndAdvance={session.commitAndAdvance}
        skip={session.skip}
        openHint={session.openHint}
        advancePlay={session.advancePlay}
        onGoHome={() => router.push("/anak")}
      />
    );
  }

  if (session.phase === "correct" && session.currentWrong) {
    return (
      <DrillCorrectionView
        item={session.currentWrong.item}
        qIdx={session.qIdx}
        queueLength={session.queueLength}
        tries={session.correctTries[session.currentWrong.item.id] ?? 0}
        cpaMode={session.task.cpaMode}
        hintItemId={session.hintItemId}
        workedItem={session.workedItem}
        corrDraft={session.corrDraft}
        setCorrDraft={session.setCorrDraft}
        submitCorrection={session.submitCorrection}
        advanceQueue={session.advanceQueue}
        bumpCorrectionTries={session.bumpCorrectionTries}
        notice={session.notice}
      />
    );
  }

  return (
    <DrillResultView
      childName={childName}
      task={session.task}
      results={session.results}
      gate={session.gate}
      timeMs={session.timeMs}
      starsEarned={session.starsEarned}
      effectiveSync={session.effectiveSync}
      hintUsedItems={session.hintUsedItems}
      resolvedItems={session.resolvedItems}
      notice={session.notice}
      loadingNext={session.loadingNext}
      loadNextTask={session.loadNextTask}
      onGoHome={() => router.push("/anak")}
    />
  );
}
