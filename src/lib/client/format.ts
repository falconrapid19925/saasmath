/**
 * Client display formatting helpers (pure, testable).
 *
 * Answer formatting (formatAnswer) is NOT defined here: it is re-exported
 * from the engine (src/lib/engine/answers.ts), the one implementation behind
 * the engine seam, so prompts, result lists and answer keys render exactly
 * like the server-authored record (architecture review candidate 2).
 *
 * Conventions (plan: user-facing language is Bahasa Indonesia):
 * - Thousands separator: "." (1.000.000)
 * - Decimal separator: "," (0,5)
 * - Money: "Rp12.500" (whole rupiah only, per the engine contract)
 */

export { formatAnswer } from "@/lib/engine/answers";

/** Format a number with Indonesian separators. Example: 12345.6 -> "12.345,6". */
export function formatNumberId(value: number, maxFractionDigits = 10): string {
  if (!Number.isFinite(value)) return String(value);
  const formatted = new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: maxFractionDigits,
  }).format(value);
  return formatted.replace(/\u00a0/g, " ");
}

/** Milliseconds as "1 mnt 23 dtk" / "23 dtk". */
export function formatDurationId(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds} dtk`;
  if (seconds === 0) return `${minutes} mnt`;
  return `${minutes} mnt ${seconds} dtk`;
}

/**
 * SCT color zones per plan section 3.1 (Kumon Connect's Study Records):
 * - "blue": within SCT (timeMs <= sctSeconds * 1000)
 * - "yellow": accurate but over SCT
 * - "pink": low accuracy (< 80%) — the accuracy dimension drives pink.
 */
export type SctZone = "blue" | "yellow" | "pink";

export function sctZone(input: {
  timeMs: number;
  sctSeconds: number;
  accuracy: number;
}): SctZone {
  if (input.accuracy < 0.8) return "pink";
  return input.timeMs <= input.sctSeconds * 1000 ? "blue" : "yellow";
}

/** Tailwind classes for each SCT zone (blue / yellow / pink per plan 3.1). */
export const SCT_ZONE_CLASSES: Record<SctZone, { bar: string; text: string }> = {
  blue: { bar: "bg-blue-500", text: "text-blue-700" },
  yellow: { bar: "bg-amber-400", text: "text-amber-600" },
  pink: { bar: "bg-pink-500", text: "text-pink-600" },
};

/**
 * Calendar-day keys live in the shared module src/lib/dates.ts (used by both
 * tiers); this module only renders them.
 */

/** Indonesian short weekday/month labels for the star calendar. */
const WEEKDAY_ID = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"] as const;
const MONTH_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
] as const;

export function weekdayId(date: Date): string {
  return WEEKDAY_ID[date.getDay()];
}

/** "12 Oktober 2026" style date from a "YYYY-MM-DD" WIB key. */
export function formatDateIdId(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number) as [number, number, number];
  return `${d} ${MONTH_ID[m - 1]} ${y}`;
}
