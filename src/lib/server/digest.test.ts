import { describe, expect, it } from "vitest";

import {
  dayLabelId,
  formatWeekRangeId,
  renderWeeklyDigest,
  type WeeklyDigestInput,
} from "./digest";

const baseInput = (overrides: Partial<WeeklyDigestInput> = {}): WeeklyDigestInput => ({
  childName: "Budi",
  weekRangeLabel: "28 Sep – 4 Okt 2026",
  setsDone: 5,
  weeklySetTarget: 6,
  avgAccuracy: 0.87,
  avgTimeMs: 380_000,
  avgSctSeconds: 420,
  withinSctCount: 3,
  streakCurrent: 4,
  streakBest: 9,
  starsWeek: 50,
  weekDays: [
    { label: "Sen", done: true },
    { label: "Sel", done: true },
    { label: "Rab", done: false },
    { label: "Kam", done: true },
    { label: "Jum", done: true },
    { label: "Sab", done: false },
    { label: "Min", done: false },
  ],
  ...overrides,
});

describe("renderWeeklyDigest (plan section 4.6)", () => {
  it("renders the active-week digest in Bahasa Indonesia", () => {
    const text = renderWeeklyDigest(baseInput());

    expect(text).toContain("SaasMath — Ringkasan Mingguan");
    expect(text).toContain("Budi • 28 Sep – 4 Okt 2026");
    expect(text).toContain("Set selesai: 5 dari target 6");
    expect(text).toContain("Akurasi rata-rata: 87%");
    expect(text).toContain("Waktu rata-rata: 6 m 20 dtk (SCT 7 m 0 dtk)");
    expect(text).toContain("Dalam target waktu (SCT): 3 dari 5 set");
    expect(text).toContain("Streak: 4 hari (rekor: 9)");
    expect(text).toContain("Bintang minggu ini: 50");
    expect(text).toContain("Kalender bintang:");
    expect(text).toContain("Sen ✓");
    expect(text).toContain("Rab –");
  });

  it("renders the encouragement variant for an empty week", () => {
    const text = renderWeeklyDigest(
      baseInput({
        setsDone: 0,
        avgAccuracy: null,
        avgTimeMs: null,
        avgSctSeconds: null,
        withinSctCount: 0,
        starsWeek: 0,
        streakCurrent: 0,
      }),
    );
    expect(text).toContain("belum ada set");
    expect(text).toContain("Streak: belum dimulai");
    expect(text).not.toContain("Akurasi");
  });

  it("omits the SCT comparison when no SCT was served", () => {
    const text = renderWeeklyDigest(baseInput({ avgSctSeconds: null }));
    expect(text).toContain("Waktu rata-rata: 6 m 20 dtk");
    expect(text).not.toContain("SCT 7 m");
  });
});

describe("date labels", () => {
  it("formats Bahasa day and week-range labels", () => {
    // 2026-10-04 is a Sunday.
    const sunday = new Date(2026, 9, 4);
    expect(dayLabelId(sunday)).toBe("Min");
    expect(formatWeekRangeId(new Date(2026, 8, 28), sunday)).toBe("28 Sep – 4 Okt 2026");
  });
});
