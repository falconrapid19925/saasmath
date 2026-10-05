/**
 * Weekly Bahasa Indonesia WhatsApp digest — plan section 4.6. Parents value
 * "pages done, time taken, progress at a glance" (Kumon Connect), so the
 * digest leads with sets completed, accuracy, time vs SCT, the streak, and
 * the star calendar. Pure renderer; the caller aggregates the week's data
 * (see summary.ts) and the WhatsApp sender is a stub (whatsapp.ts).
 */

import { formatDurationId } from "./answers";
import { formatInt } from "../engine/answers";

const DAY_LABELS_ID = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"] as const;
const MONTH_LABELS_ID = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
] as const;

/** "4 Okt" style label for a timestamp. */
export function formatDateShortId(date: Date): string {
  return `${date.getDate()} ${MONTH_LABELS_ID[date.getMonth()]}`;
}

/** "28 Sep – 4 Okt 2026" range label for the digest header. */
export function formatWeekRangeId(weekStart: Date, weekEnd: Date): string {
  const year = weekEnd.getFullYear();
  return `${formatDateShortId(weekStart)} – ${formatDateShortId(weekEnd)} ${year}`;
}

/** "Sen"/"Sel"/... for a Date's weekday (Bahasa, 3 letters). */
export function dayLabelId(date: Date): string {
  return DAY_LABELS_ID[date.getDay()];
}

export type DigestDay = {
  /** Bahasa weekday label, e.g. "Sen". */
  label: string;
  /** True when the child completed at least one set that day. */
  done: boolean;
};

export type WeeklyDigestInput = {
  childName: string;
  weekRangeLabel: string;
  setsDone: number;
  /** Weekly target from the daily-loop settings (e.g. 6 sets/minggu). */
  weeklySetTarget: number;
  /** Mean accuracy over the week's sets, 0..1; null when no sets. */
  avgAccuracy: number | null;
  /** Mean completion time; null when no sets. */
  avgTimeMs: number | null;
  /** Mean served SCT for the same sets; null when no sets. */
  avgSctSeconds: number | null;
  /** Sets finished within SCT. */
  withinSctCount: number;
  streakCurrent: number;
  streakBest: number;
  starsWeek: number;
  /** The 7 calendar days of the week, in display order. */
  weekDays: DigestDay[];
};

function accuracyPercentId(accuracy: number): string {
  return `${Math.round(accuracy * 100)}%`;
}

function starCalendarLine(days: DigestDay[]): string {
  return days.map((d) => `${d.label} ${d.done ? "✓" : "–"}`).join("  ");
}

/** Render the digest text. WhatsApp-ready: *bold* markers, emoji headers. */
export function renderWeeklyDigest(input: WeeklyDigestInput): string {
  const lines: string[] = [];

  lines.push("📊 *SaasMath — Ringkasan Mingguan*");
  lines.push(`${input.childName} • ${input.weekRangeLabel}`);
  lines.push("");

  if (input.setsDone === 0) {
    lines.push("Minggu ini belum ada set yang diselesaikan. Yuk, coba 10 menit sehari! 🙂");
    lines.push("");
    lines.push(`🔥 ${input.streakCurrent > 0 ? `Streak: ${formatInt(input.streakCurrent)} hari` : "Streak: belum dimulai"}`);
    lines.push("");
    lines.push("🗓️ Kalender bintang:");
    lines.push(starCalendarLine(input.weekDays));
    return lines.join("\n");
  }

  lines.push(
    `✅ Set selesai: ${formatInt(input.setsDone)} dari target ${formatInt(input.weeklySetTarget)}`,
  );

  if (input.avgAccuracy !== null) {
    lines.push(`🎯 Akurasi rata-rata: ${accuracyPercentId(input.avgAccuracy)}`);
  }

  if (input.avgTimeMs !== null) {
    const timeLine = `⏱️ Waktu rata-rata: ${formatDurationId(input.avgTimeMs)}`;
    if (input.avgSctSeconds !== null) {
      lines.push(`${timeLine} (SCT ${formatDurationId(input.avgSctSeconds * 1000)})`);
    } else {
      lines.push(timeLine);
    }
    lines.push(
      `✨ Dalam target waktu (SCT): ${formatInt(input.withinSctCount)} dari ${formatInt(input.setsDone)} set`,
    );
  }

  lines.push(`🔥 Streak: ${formatInt(input.streakCurrent)} hari (rekor: ${formatInt(input.streakBest)})`);
  lines.push(`⭐ Bintang minggu ini: ${formatInt(input.starsWeek)}`);
  lines.push("");
  lines.push("🗓️ Kalender bintang:");
  lines.push(starCalendarLine(input.weekDays));

  return lines.join("\n");
}
