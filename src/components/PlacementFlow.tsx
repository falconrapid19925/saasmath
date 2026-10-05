"use client";

/**
 * Placement diagnostic (plan section 3.1 step 1): ±16 items sampled across
 * the child's grade ladder, untimed, encouraging copy, no pass/fail framing.
 * Loads from GET /api/placement and submits entries + answers to POST
 * /api/placement — the server regenerates the items from the seeds and
 * re-grades, so nothing the client sends is trusted.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { AnswerInput, ChoiceInput } from "@/components/answer/AnswerInput";
import { fetchPlacement, submitPlacementApi } from "@/lib/client/api";
import { emptyDraft, parseDraft, type AnswerDraft } from "@/lib/client/answers";
import type { Item } from "@/lib/engine/types";

const ENCOURAGEMENTS = [
  "Kerjakan pelan-pelan, tidak ada nilai di sini.",
  "Ini cuma untuk mengenalmu, jawab santai saja.",
  "Salah tidak apa-apa, ini bukan ulangan!",
  "Kamu pasti bisa, semangat!",
];

type Loaded =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      childId: string;
      seed: number;
      items: Item[];
    };

export function PlacementFlow({ childId }: { childId: string }) {
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });

  const [idx, setIdx] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, AnswerDraft>>({});
  // Answered-so-far map: read only while advancing (never rendered), so a ref
  // keeps taps from re-rendering the whole flow.
  const answersRef = useRef<Record<string, Item["answer"] | null>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<{ title: string; correct: number; total: number } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    fetchPlacement(childId)
      .then((res) => {
        if (cancelled) return;
        setLoaded({
          status: "ready",
          childId,
          seed: res.seed,
          items: res.items,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoaded({
          status: "error",
          message: err instanceof Error ? err.message : "Soal penempatan tidak bisa dimuat.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [childId]);

  const flat = useMemo<Item[]>(
    () => (loaded.status === "ready" ? loaded.items : []),
    [loaded],
  );

  const advance = useCallback(
    (given: Item["answer"] | null) => {
      if (loaded.status !== "ready") return;
      const current = flat[idx];
      if (!current) return;
      const next = { ...answersRef.current, [current.id]: given };
      answersRef.current = next;
      if (idx + 1 < flat.length) {
        setIdx(idx + 1);
        return;
      }
      void (async () => {
        setSubmitting(true);
        try {
          const result = await submitPlacementApi({
            childId: loaded.childId,
            seed: loaded.seed,
            answers: flat.map((it) => next[it.id] ?? null),
          });
          setOutcome({
            title: result.placedSkill.titleId,
            correct: result.correctCount,
            total: result.total,
          });
        } catch (err) {
          setNotice(err instanceof Error ? err.message : "Penempatan gagal dikirim.");
        } finally {
          setSubmitting(false);
        }
      })();
    },
    [flat, idx, loaded],
  );

  if (outcome) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-5 px-4 py-10 text-center">
        <p className="text-5xl" aria-hidden>🗺️</p>
        <h1 className="text-2xl font-bold text-slate-900">Titik mulaimu sudah siap!</h1>
        <p className="text-slate-600">
          Kamu mulai dari <b>{outcome.title}</b> — pas sekali untukmu. Ingat,
          mulai dari yang gampang itu cara para juara!
        </p>
        <p className="text-xs text-slate-400">
          {outcome.correct}/{outcome.total} jawaban tepat di tes penempatan.
        </p>
        <button
          type="button"
          onClick={() => router.push("/anak")}
          className="min-h-14 w-full rounded-2xl bg-blue-600 text-base font-bold text-white shadow active:bg-blue-700"
        >
          Mulai petualangan matematika
        </button>
      </div>
    );
  }

  if (loaded.status === "loading") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3">
        <p className="animate-pulse text-4xl" aria-hidden>🤝</p>
        <p className="text-sm font-semibold text-slate-500">Menyiapkan soal kenalan…</p>
      </div>
    );
  }

  if (loaded.status === "error") {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-4xl" aria-hidden>🚧</p>
        <h1 className="text-xl font-bold text-slate-900">Soal penempatan belum siap</h1>
        <p className="text-sm text-slate-600">{loaded.message}</p>
      </div>
    );
  }

  const current = flat[idx];
  if (!current) {
    return <p className="p-8 text-center text-slate-500">Soal penempatan tidak tersedia.</p>;
  }
  const encouragement =
    ENCOURAGEMENTS[
      Math.min(
        ENCOURAGEMENTS.length - 1,
        Math.floor(idx / Math.max(1, flat.length / ENCOURAGEMENTS.length)),
      )
    ];
  const draft =
    drafts[current.id] ??
    emptyDraft(current.answerType, current.answer.kind === "unitValue" ? [current.answer.unit] : []);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-28 pt-4">
      <header className="text-center">
        <h1 className="text-lg font-bold text-slate-900">Kenalan dulu dengan kemampuanmu 🤝</h1>
        <p className="text-sm text-slate-500">{encouragement}</p>
      </header>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${((idx + 1) / flat.length) * 100}%` }} />
      </div>

      <div className="rounded-2xl bg-white p-5 text-center shadow-sm ring-1 ring-slate-200">
        <p className="text-2xl font-bold leading-relaxed text-slate-900">{current.prompt}</p>
      </div>

      {current.choices ? (
        <ChoiceInput choices={current.choices} onSubmit={(a) => advance(a)} disabled={submitting} />
      ) : (
        <AnswerInput
          answerType={current.answerType}
          units={current.answer.kind === "unitValue" ? [current.answer.unit] : []}
          draft={draft}
          onChange={(d) => setDrafts((prev) => ({ ...prev, [current.id]: d }))}
          onSubmit={() => {
            const parsed = parseDraft(draft);
            if (parsed === null) {
              setNotice("Isi jawabannya dulu, atau ketuk Lewati.");
              return;
            }
            advance(parsed);
          }}
          disabled={submitting}
        />
      )}

      {notice && <p className="rounded-xl bg-amber-50 px-3 py-2 text-center text-sm text-amber-700">{notice}</p>}

      <div className="fixed inset-x-0 bottom-0 flex gap-2 border-t border-slate-100 bg-white/95 p-3 backdrop-blur">
        <button
          type="button"
          disabled={submitting}
          onClick={() => advance(null)}
          className="min-h-12 rounded-xl bg-slate-100 px-4 text-sm font-semibold text-slate-600 disabled:opacity-40"
        >
          Lewati
        </button>
        {!current.choices && (
          <button
            type="button"
            disabled={submitting}
            onClick={() => {
              const parsed = parseDraft(draft);
              if (parsed === null) {
                setNotice("Isi jawabannya dulu, atau ketuk Lewati.");
                return;
              }
              advance(parsed);
            }}
            className="min-h-12 flex-1 rounded-xl bg-emerald-600 text-base font-bold text-white shadow active:bg-emerald-700 disabled:opacity-40"
          >
            {idx + 1 === flat.length ? "Selesai" : "Lanjut"}
          </button>
        )}
      </div>
    </div>
  );
}
