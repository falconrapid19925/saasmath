/**
 * CPA hint payload schemas and defensive normalizers (plan section 3.2).
 *
 * Per the engine contract (src/lib/engine/types.ts), the per-model payload
 * schemas are owned by the CPA/UI builder — that is this module, next to the
 * SVG renderers in src/components/hints. Generator families attach raw
 * `Record<string, unknown>` payloads; these normalizers validate them and
 * return typed shapes, or null when the payload does not conform (renderers
 * then degrade to "no hint" instead of crashing a drill session).
 *
 * Schemas (all fields required unless marked optional; numbers finite):
 *
 * - part-whole — model batang bagian-keseluruhan:
 *     { total: number | null,            // null = the unknown is the total
 *       parts: (number | null)[],        // >= 2 entries; >= 1 null = unknown part
 *       unit?: string, caption?: string }
 *
 * - comparison — model batang perbandingan:
 *     { rows: { label: string, value: number | null }[],  // 2-4 rows, >= 1 null
 *       unit?: string, caption?: string }
 *
 * - fraction-bar — model batang pecahan:
 *     { wholes: number (1-4), partsPerWhole: number (1-12),
 *       shadedParts: number | null,      // total shaded parts; null = unknown
 *       label?: string, caption?: string }
 *
 * - number-line — garis bilangan:
 *     { min: number, max: number, stepValue: number (tick spacing),
 *       majorEvery?: number (label every N ticks, default 1),
 *       marks: (number | null)[],        // null = draggable unknown handle
 *       unit?: string, caption?: string }
 *
 * - base-ten — basis-sepuluh / array (discriminated by `variant`):
 *     | { variant: "blocks", thousands: number, hundreds: number,
 *         tens: number, ones: number,
 *         unknown?: "thousands" | "hundreds" | "tens" | "ones",
 *         caption?: string }
 *     | { variant: "array", rows: number | null, cols: number | null,
 *         caption?: string }             // at most one null = the unknown
 */

import type { HintModel } from "@/lib/engine/types";

export type PartWholeHint = {
  total: number | null;
  parts: (number | null)[];
  unit?: string;
  caption?: string;
};

export type ComparisonHint = {
  rows: { label: string; value: number | null }[];
  unit?: string;
  caption?: string;
};

export type FractionBarHint = {
  wholes: number;
  partsPerWhole: number;
  shadedParts: number | null;
  label?: string;
  caption?: string;
};

export type NumberLineHint = {
  min: number;
  max: number;
  stepValue: number;
  majorEvery: number;
  marks: (number | null)[];
  unit?: string;
  caption?: string;
};

export type BaseTenHint =
  | {
      variant: "blocks";
      thousands: number;
      hundreds: number;
      tens: number;
      ones: number;
      unknown?: "thousands" | "hundreds" | "tens" | "ones";
      caption?: string;
    }
  | { variant: "array"; rows: number | null; cols: number | null; caption?: string };

export type NormalizedHint =
  | { model: "part-whole"; hint: PartWholeHint }
  | { model: "comparison"; hint: ComparisonHint }
  | { model: "fraction-bar"; hint: FractionBarHint }
  | { model: "number-line"; hint: NumberLineHint }
  | { model: "base-ten"; hint: BaseTenHint };

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isNumOrNull(v: unknown): v is number | null {
  return v === null || isFiniteNumber(v);
}

function optString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export function normalizeHint(model: HintModel, payload: unknown): NormalizedHint | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;

  switch (model) {
    case "part-whole": {
      if (!isNumOrNull(p.total)) return null;
      if (!Array.isArray(p.parts) || p.parts.length < 2) return null;
      if (!p.parts.every(isNumOrNull)) return null;
      const unknownCount =
        (p.total === null ? 1 : 0) + p.parts.filter((x) => x === null).length;
      if (unknownCount !== 1) return null;
      return {
        model: "part-whole",
        hint: { total: p.total, parts: p.parts, unit: optString(p.unit), caption: optString(p.caption) },
      };
    }
    case "comparison": {
      if (!Array.isArray(p.rows) || p.rows.length < 2 || p.rows.length > 4) return null;
      const rows: ComparisonHint["rows"] = [];
      let unknowns = 0;
      for (const raw of p.rows) {
        if (typeof raw !== "object" || raw === null) return null;
        const r = raw as Record<string, unknown>;
        if (typeof r.label !== "string") return null;
        if (!isNumOrNull(r.value)) return null;
        if (r.value === null) unknowns++;
        rows.push({ label: r.label, value: r.value });
      }
      if (unknowns === 0) return null;
      return {
        model: "comparison",
        hint: { rows, unit: optString(p.unit), caption: optString(p.caption) },
      };
    }
    case "fraction-bar": {
      const { wholes, partsPerWhole, shadedParts } = p;
      if (!isFiniteNumber(wholes) || wholes < 1 || wholes > 4) return null;
      if (!isFiniteNumber(partsPerWhole) || partsPerWhole < 1 || partsPerWhole > 12) return null;
      if (!isNumOrNull(shadedParts)) return null;
      if (shadedParts !== null && (shadedParts < 0 || shadedParts > wholes * partsPerWhole)) {
        return null;
      }
      return {
        model: "fraction-bar",
        hint: {
          wholes,
          partsPerWhole,
          shadedParts,
          label: optString(p.label),
          caption: optString(p.caption),
        },
      };
    }
    case "number-line": {
      const { min, max, stepValue } = p;
      if (!isFiniteNumber(min) || !isFiniteNumber(max) || !isFiniteNumber(stepValue)) return null;
      if (max <= min || stepValue <= 0) return null;
      const tickCount = Math.round((max - min) / stepValue);
      if (tickCount < 2 || tickCount > 40) return null;
      if (!Array.isArray(p.marks) || !p.marks.every(isNumOrNull)) return null;
      for (const m of p.marks) {
        if (m !== null && (m < min || m > max)) return null;
      }
      const majorEvery = isFiniteNumber(p.majorEvery) && p.majorEvery >= 1 ? Math.round(p.majorEvery) : 1;
      return {
        model: "number-line",
        hint: {
          min,
          max,
          stepValue,
          majorEvery,
          marks: p.marks,
          unit: optString(p.unit),
          caption: optString(p.caption),
        },
      };
    }
    case "base-ten": {
      if (p.variant === "blocks") {
        const { thousands, hundreds, tens, ones } = p;
        const counts = [thousands, hundreds, tens, ones];
        if (!counts.every(isFiniteNumber) || counts.some((c) => c < 0 || c > 9)) return null;
        const unknown =
          p.unknown === "thousands" || p.unknown === "hundreds" ||
          p.unknown === "tens" || p.unknown === "ones"
            ? p.unknown
            : undefined;
        return {
          model: "base-ten",
          hint: {
            variant: "blocks",
            thousands: thousands as number,
            hundreds: hundreds as number,
            tens: tens as number,
            ones: ones as number,
            unknown,
            caption: optString(p.caption),
          },
        };
      }
      if (p.variant === "array") {
        if (!isNumOrNull(p.rows) || !isNumOrNull(p.cols)) return null;
        let nulls = 0;
        if (p.rows === null) nulls++;
        if (p.cols === null) nulls++;
        if (nulls !== 1) return null;
        return {
          model: "base-ten",
          hint: { variant: "array", rows: p.rows, cols: p.cols, caption: optString(p.caption) },
        };
      }
      return null;
    }
  }
}
