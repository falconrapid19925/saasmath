"use client";

/**
 * Post-submit SCT comparison, color-coded blue/yellow/pink like Kumon
 * Connect's Study Records (plan section 3.1): blue = within SCT, yellow =
 * accurate but over SCT, pink = accuracy below 80%. Invisible during play.
 */

import {
  formatDurationId,
  SCT_ZONE_CLASSES,
  sctZone,
} from "@/lib/client/format";

export function SctResult({
  timeMs,
  sctSeconds,
  accuracy,
  tightenedNote,
}: {
  timeMs: number;
  sctSeconds: number;
  accuracy: number;
  tightenedNote?: string | null;
}) {
  const zone = sctZone({ timeMs, sctSeconds, accuracy });
  const classes = SCT_ZONE_CLASSES[zone];
  const ratio = Math.min(1, timeMs / (sctSeconds * 1000));
  const label =
    zone === "blue"
      ? "Sesuai target SCT — hebat!"
      : zone === "yellow"
        ? "Akurat, tapi melewati target waktu."
        : "Akurasi masih di bawah 80% — tidak apa-apa, ada mode gambar.";

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold text-slate-700">Waktu vs SCT</p>
        <p className={`text-sm font-bold ${classes.text}`}>
          {zone === "blue" ? "BIRU" : zone === "yellow" ? "KUNING" : "PINK"}
        </p>
      </div>
      <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${classes.bar}`} style={{ width: `${ratio * 100}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-sm text-slate-600">
        <span>Waktumu: {formatDurationId(timeMs)}</span>
        <span>Target: {formatDurationId(sctSeconds * 1000)}</span>
      </div>
      <p className={`mt-1 text-xs ${classes.text}`}>{label}</p>
      {tightenedNote && <p className="mt-1 text-xs text-slate-500">{tightenedNote}</p>}
    </div>
  );
}

/** Friendly mastery-gate transition copy (no dead ends — plan 3.1 step 5). */
export function GateBanner({
  action,
  withinSct,
  accuracy,
}: {
  action: string;
  withinSct: boolean;
  accuracy: number;
}) {
  const pct = Math.round(accuracy * 100);
  const copy: Record<string, { emoji: string; title: string; body: string }> = {
    advance: {
      emoji: "🎉",
      title: "Hebat, kamu naik level!",
      body: `Ketepatan ${pct}% dan sesuai target. Lanjut ke tantangan berikutnya!`,
    },
    tighten: {
      emoji: "⏱️",
      title: "Hampir sampai!",
      body: "Jawabanmu sudah akurat. Target waktumu kami rapikan sedikit supaya makin lancar.",
    },
    promote_fluency_flag: {
      emoji: "🚀",
      title: "Tetap naik level!",
      body: "Kamu sudah gigih sekali. Nanti ada latihan penjaga kecepatan biar kemampuanmu tetap tajam.",
    },
    enter_cpa_mode: {
      emoji: "🧩",
      title: "Kita pelan-pelan saja",
      body: "Set berikutnya pakai bantuan gambar dan tanpa waktu. Santai, yang penting paham.",
    },
    stay: withinSct
      ? {
          emoji: "💪",
          title: "Bagus!",
          body: `Ketepatan ${pct}%. Ulangi varian berikutnya untuk mencapai 95% dan naik langkah.`,
        }
      : {
          emoji: "💪",
          title: "Sudah akurat!",
          body: "Sekarang kejar waktunya. Coba varian baru dan kejar target SCT.",
        },
    exit_cpa_mode: {
      emoji: "🌟",
      title: "Siap kembali berlomba dengan dirimu sendiri!",
      body: "Dua kali bersih di mode gambar. Set berikutnya berwaktu lagi — kamu siap.",
    },
  };
  const c = copy[action] ?? copy.stay;
  return (
    <div className="rounded-2xl bg-gradient-to-r from-blue-50 to-emerald-50 p-4 text-center ring-1 ring-blue-100">
      <p className="text-4xl" aria-hidden>
        {c.emoji}
      </p>
      <h2 className="mt-1 text-lg font-bold text-slate-900">{c.title}</h2>
      <p className="mt-1 text-sm text-slate-600">{c.body}</p>
    </div>
  );
}
