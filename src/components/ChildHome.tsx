"use client";

/**
 * Child home widgets: header (avatar/stars/streak+freezes), today's set CTA
 * (loads via POST /api/session/next), and the mastery map ("islands" per
 * strand, highlighted current skill, Baru/Lancar/Kuasai states).
 */

import Link from "next/link";
import { useEffect, useState } from "react";

import { fetchNextTask } from "@/lib/client/api";
import type { ChildHomeData, IslandView, SkillMasteryView } from "@/lib/client/view-models";

const STATE_STYLES: Record<string, string> = {
  Baru: "bg-slate-100 text-slate-500 ring-slate-200",
  Lancar: "bg-blue-50 text-blue-700 ring-blue-200",
  Kuasai: "bg-emerald-50 text-emerald-700 ring-emerald-300",
};
const STATE_DOT: Record<string, string> = {
  Baru: "bg-slate-300",
  Lancar: "bg-blue-500",
  Kuasai: "bg-emerald-500",
};

export function ChildHeader({ data }: { data: ChildHomeData }) {
  const { child, streak } = data;
  return (
    <header className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-2xl" aria-hidden>
          {child.avatarEmoji}
        </span>
        <div>
          <p className="text-base font-bold text-slate-900">Hai, {child.name}!</p>
          <p className="text-xs text-slate-500">Kelas {child.grade}</p>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 text-sm font-bold">
        <span className="text-amber-500">⭐ {child.starsBalance}</span>
        <span className="text-orange-500">
          🔥 {streak.current} hari
          {streak.freezesLeft > 0 && (
            <span className="ml-1 text-sky-500" title="Streak freeze tersedia">
              ❄️{streak.freezesLeft}
            </span>
          )}
        </span>
      </div>
    </header>
  );
}

/**
 * Today's set CTA. The task comes from POST /api/session/next (the server
 * decides skill + step + seed), fetched here so the card always reflects the
 * same decision the drill player will render.
 */
export function TodaySetCard({ doneToday, needsPlacement }: { doneToday: boolean; needsPlacement: boolean }) {
  const [state, setState] = useState<
    { status: "loading" } | { status: "error"; message: string } | { status: "ready"; title: string; itemCount: number; cpaMode: boolean; minutes: number; step: number }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchNextTask()
      .then((next) => {
        if (cancelled) return;
        if (next.status === "ok") {
          setState({
            status: "ready",
            title: next.task.skillTitle,
            itemCount: next.task.itemCount,
            cpaMode: next.task.cpaMode,
            minutes: Math.max(1, Math.ceil(next.task.sctSeconds / 60)),
            step: next.task.step,
          });
        } else if (next.status === "needs_placement") {
          setState({ status: "ready", title: "", itemCount: 0, cpaMode: false, minutes: 0, step: 1 });
        } else {
          setState({ status: "error", message: next.reason });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Set belum bisa dimuat.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div className="animate-pulse rounded-2xl bg-slate-200 p-5" aria-label="Menyiapkan set hari ini">
        <div className="h-3 w-24 rounded bg-slate-300" />
        <div className="mt-2 h-6 w-48 rounded bg-slate-300" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="rounded-2xl bg-amber-50 p-5 ring-1 ring-amber-200">
        <p className="text-sm font-semibold text-amber-800">Set hari ini belum tersedia</p>
        <p className="mt-1 text-sm text-amber-700">{state.message}</p>
      </div>
    );
  }

  if (needsPlacement || state.title === "") {
    return (
      <Link
        href="/anak/penempatan"
        className="block rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 p-5 text-white shadow active:from-emerald-600"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-50">Mulai di sini</p>
        <p className="mt-1 text-xl font-bold">Kenalan dulu yuk! (± 16 soal singkat)</p>
        <p className="mt-1 text-sm text-emerald-50">Tidak ada nilai — cuma untuk mencari titik mulai terbaikmu.</p>
      </Link>
    );
  }

  return (
    <Link
      href="/anak/latihan"
      className={`block rounded-2xl p-5 text-white shadow transition active:brightness-95 ${
        doneToday ? "bg-gradient-to-r from-slate-500 to-slate-600" : "bg-gradient-to-r from-blue-600 to-indigo-600"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-white/80">
        {doneToday ? "Set hari ini sudah selesai — bonus!" : "Set hari ini"}
      </p>
      <p className="mt-1 text-xl font-bold">{state.title}</p>
      <p className="mt-1 text-sm text-white/85">
        {state.itemCount} soal
        {state.cpaMode ? " · mode bantuan gambar (tanpa waktu)" : ` · ± ${state.minutes} menit`}
        {" · "}
        langkah {state.step}
      </p>
      <p className="mt-3 inline-block rounded-full bg-white/20 px-4 py-2 text-sm font-bold">
        {doneToday ? "Latihan lagi 🔁" : "Mulai sekarang ▶"}
      </p>
    </Link>
  );
}

export function MasteryMap({ islands }: { islands: IslandView[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-bold text-slate-900">Peta kemampuanmu</h2>
      {islands.map((island) => (
        <IslandCard key={island.strand} island={island} />
      ))}
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <LegendDot cls={STATE_DOT.Baru} label="Baru" />
        <LegendDot cls={STATE_DOT.Lancar} label="Lancar" />
        <LegendDot cls={STATE_DOT.Kuasai} label="Kuasai" />
      </div>
    </section>
  );
}

function LegendDot({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`h-2.5 w-2.5 rounded-full ${cls}`} />
      {label}
    </span>
  );
}

function IslandCard({ island }: { island: IslandView }) {
  const highlight = island.skills.some((s) => s.isCurrent);
  return (
    <div
      className={`rounded-2xl bg-white p-4 shadow-sm ring-1 transition ${
        highlight ? "ring-2 ring-blue-500" : "ring-slate-200"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-slate-800">
          🏝️ Pulau {island.strand}
          {island.isFreeIsland && (
            <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
              PULAU PERTAMA
            </span>
          )}
        </p>
        {highlight && (
          <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white">
            SEDANG DI SINI
          </span>
        )}
      </div>
      <ul className="mt-2 flex flex-wrap gap-2">
        {island.skills.map((s) => (
          <SkillChip key={s.id} skill={s} />
        ))}
      </ul>
    </div>
  );
}

function SkillChip({ skill }: { skill: SkillMasteryView }) {
  const chip = (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${
        STATE_STYLES[skill.state] ?? STATE_STYLES.Baru
      } ${skill.isCurrent ? "outline outline-2 outline-offset-1 outline-blue-600" : ""}`}
    >
      <span className={`h-2 w-2 rounded-full ${STATE_DOT[skill.state] ?? STATE_DOT.Baru}`} />
      {skill.titleId}
      {skill.cpaMode && <span title="Mode bantuan gambar">🧩</span>}
      {skill.fluencyFlag && <span title="Fokus kelancaran">⚡</span>}
      <span className="text-[10px] opacity-70">
        {skill.step}/{skill.stepCount}
      </span>
    </span>
  );
  return skill.isCurrent ? <Link href="/anak/latihan">{chip}</Link> : chip;
}
