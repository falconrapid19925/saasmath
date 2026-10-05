"use client";

/**
 * Parent dashboard widgets: the two-week star calendar (a star per completed
 * day, like Kumon Connect's Study History), the weekly PDF download, per-set
 * worksheet PDFs with answer keys (/api/sets/[id]/pdf), and the WhatsApp
 * digest preview with copy support.
 */

import { useState } from "react";

import { CHECKOUT_PRICES, type CheckoutMonths } from "@/lib/checkout-prices";
import { formatMoney } from "@/lib/engine/answers";
import { formatDateIdId } from "@/lib/client/format";
import type { ChildWeeklySummary } from "@/lib/client/view-models";
import { makeWeeklyReportPdf } from "@/app/actions/dashboard";

export function StarCalendar({
  calendar,
}: {
  calendar: { date: string; done: boolean }[];
}) {
  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5">
        {calendar.map((day) => (
          <div
            key={day.date}
            title={formatDateIdId(day.date)}
            className={`flex aspect-square flex-col items-center justify-center rounded-lg text-[10px] ${
              day.done ? "bg-amber-100 ring-1 ring-amber-300" : "bg-slate-50 text-slate-400"
            }`}
          >
            {day.done ? (
              <span className="text-base leading-none">⭐</span>
            ) : (
              <span>{Number(day.date.slice(8, 10))}</span>
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {calendar.filter((d) => d.done).length} dari {calendar.length} hari berlatihan · 2 minggu terakhir
      </p>
    </div>
  );
}

export function ReportActions({ summary }: { summary: ChildWeeklySummary }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const downloadPdf = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await makeWeeklyReportPdf({ childId: summary.childId });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      const bytes = Uint8Array.from(atob(res.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  const copyDigest = async () => {
    try {
      await navigator.clipboard.writeText(summary.digestPreview);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Tidak bisa menyalin — salin manual teks di bawah.");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void downloadPdf()}
          disabled={busy}
          className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white shadow active:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Menyiapkan…" : "⬇️ Unduh PDF laporan mingguan"}
        </button>
        <button
          type="button"
          onClick={() => void copyDigest()}
          className="min-h-11 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white shadow active:bg-emerald-700"
        >
          {copied ? "Tersalin ✓" : "📋 Salin ringkasan WA"}
        </button>
      </div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 font-sans text-sm text-slate-600 ring-1 ring-slate-200">
        {summary.digestPreview}
      </pre>
      {error && <p className="text-xs text-pink-600">{error}</p>}
    </div>
  );
}

/** Current-plan label for the checkout panel, in Bahasa Indonesia. */
function planLabelId(plan: string): string {
  switch (plan) {
    case "bulanan":
      return "Bulanan";
    case "bundle":
      return "Bundle";
    case "trial":
      return "Uji coba";
    default:
      return "Gratis";
  }
}

/**
 * Per-child subscription status plus the four section-7 plan buttons. The
 * button POSTs /api/checkout (persisting the order server-side) and, when
 * Snap is configured, redirects to the payment page; in stub mode it shows
 * the server's Bahasa status line instead.
 */
export function CheckoutPanel({
  childId,
  plan,
  status,
}: {
  childId: string;
  plan: string;
  status: string;
}) {
  const [busyMonths, setBusyMonths] = useState<CheckoutMonths | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const checkout = async (months: CheckoutMonths) => {
    setBusyMonths(months);
    setMessage(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ childId, months }),
      });
      const body = (await res.json().catch(() => null)) as
        | { snapUrl?: string | null; statusId?: string; error?: string }
        | null;
      if (!res.ok) {
        setMessage(body?.error ?? `Permintaan gagal (${res.status}).`);
        return;
      }
      if (body?.snapUrl) {
        window.location.assign(body.snapUrl);
        return;
      }
      setMessage(body?.statusId ?? "Menunggu pembayaran.");
    } catch {
      setMessage("Tidak ada internet — coba lagi ya.");
    } finally {
      setBusyMonths(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-slate-600">
        Langganan: <b>{planLabelId(plan)}</b>
        {(plan === "bulanan" || plan === "bundle") && (
          <span className={status === "active" ? "text-emerald-600" : "text-amber-600"}>
            {" "}· {status === "active" ? "aktif" : "menunggu pembayaran"}
          </span>
        )}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Object.values(CHECKOUT_PRICES).map((price) => (
          <button
            key={price.months}
            type="button"
            disabled={busyMonths !== null}
            onClick={() => void checkout(price.months)}
            className="rounded-xl bg-blue-600 px-3 py-2 text-center shadow active:bg-blue-700 disabled:opacity-50"
          >
            <span className="block text-[11px] font-semibold text-blue-100">
              {busyMonths === price.months ? "Memproses…" : price.labelId}
            </span>
            <span className="block text-sm font-bold text-white">
              {formatMoney(price.priceIdr)}
            </span>
          </button>
        ))}
      </div>
      {message && <p className="text-xs text-slate-500">{message}</p>}
    </div>
  );
}

/** Per-set printable worksheets with answer keys (server route streams them). */
export function SetPdfList({ summary }: { summary: ChildWeeklySummary }) {
  if (summary.recentSets.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Setelah anak menyelesaikan set, lembar latihan + kunci jawaban bisa
        diunduh di sini untuk latihan kertas ala Kumon.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {summary.recentSets.map((s) => (
        <li key={s.attemptId} className="flex items-center justify-between gap-2 text-sm">
          <span className="text-slate-600">
            {s.label} {s.withinSct ? <span className="text-blue-600">· SCT ok</span> : <span className="text-amber-600">· di luar SCT</span>}
          </span>
          <a
            href={`/api/sets/${s.attemptId}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="min-h-9 rounded-lg bg-slate-100 px-3 text-xs font-bold leading-9 text-blue-700 ring-1 ring-slate-200"
          >
            PDF + kunci ⬇️
          </a>
        </li>
      ))}
    </ul>
  );
}
