"use client";

/**
 * CPA hint renderers (plan section 3.2): five fixed, reusable pictorial
 * models as SVG — part-whole bar, comparison bar, fraction bar, number line,
 * base-ten/array. Branded "model batang" (secondary: "model bar").
 * Interactions are tap / drag-lite only (no freehand): shading cells by tap
 * and a snapping number-line handle. Payload schemas are owned by
 * src/lib/client/hints.ts; invalid payloads render a graceful fallback.
 */

import { useMemo, useRef, useState, type ReactNode } from "react";

import {
  normalizeHint,
  type BaseTenHint,
  type NormalizedHint,
} from "@/lib/client/hints";
import type { HintModel } from "@/lib/engine/types";
import { formatNumberId } from "@/lib/client/format";

/** Bahasa labels for the five fixed CPA models (presentation copy). */
const HINT_MODEL_LABELS_ID: Record<HintModel, string> = {
  "part-whole": "Model batang bagian–keseluruhan",
  comparison: "Model batang perbandingan",
  "fraction-bar": "Model batang pecahan",
  "number-line": "Garis bilangan",
  "base-ten": "Bilangan basis sepuluh / susunan",
};

export function HintView({
  model,
  payload,
  interactive = true,
}: {
  model: HintModel;
  payload: unknown;
  interactive?: boolean;
}) {
  const normalized = useMemo(() => normalizeHint(model, payload), [model, payload]);
  if (!normalized) {
    return (
      <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-700">
        Gambar bantuan untuk soal ini belum tersedia. Coba pecah soalnya jadi
        bagian-bagian kecil dulu ya.
      </p>
    );
  }
  return <HintBody normalized={normalized} interactive={interactive} />;
}

function HintBody({
  normalized,
  interactive,
}: {
  normalized: NormalizedHint;
  interactive: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
        {HINT_MODEL_LABELS_ID[normalized.model]}
      </p>
      {normalized.model === "part-whole" && <PartWholeBar hint={normalized.hint} interactive={interactive} />}
      {normalized.model === "comparison" && <ComparisonBar hint={normalized.hint} />}
      {normalized.model === "fraction-bar" && <FractionBar hint={normalized.hint} interactive={interactive} />}
      {normalized.model === "number-line" && <NumberLine hint={normalized.hint} interactive={interactive} />}
      {normalized.model === "base-ten" && <BaseTen hint={normalized.hint} />}
      {normalized.hint.caption && (
        <p className="text-sm text-slate-600">{normalized.hint.caption}</p>
      )}
    </div>
  );
}

const UNKNOWN_TEXT = "?";

// ---------------------------------------------------------------------------
// part-whole
// ---------------------------------------------------------------------------

function PartWholeBar({
  hint,
  interactive,
}: {
  hint: { total: number | null; parts: (number | null)[]; unit?: string };
  interactive: boolean;
}) {
  const [tapped, setTapped] = useState<number | null>(null);
  const knownSum = hint.parts.reduce<number>((acc, v) => acc + (v ?? 0), 0);
  const displayTotal = hint.total ?? knownSum;

  return (
    <svg viewBox="0 0 320 110" className="h-auto w-full" role="img" aria-label="Model batang bagian-keseluruhan">
      {/* whole bar */}
      <rect x={10} y={8} width={300} height={26} rx={6} fill="#dbeafe" stroke="#2563eb" />
      <text x={160} y={26} textAnchor="middle" fontSize={14} fontWeight={700} fill="#1e40af">
        {hint.total === null ? UNKNOWN_TEXT : `${formatNumberId(hint.total)}${hint.unit ? " " + hint.unit : ""}`}
      </text>
      {/* part bars */}
      {hint.parts.map((v, i) => {
        const w = Math.max(24, (300 / hint.parts.length) - 6);
        const x = 10 + i * (300 / hint.parts.length) + 3;
        const fill = v === null ? "#fecdd3" : "#eff6ff";
        const isTapped = tapped === i;
        return (
          <g key={i} onClick={interactive ? () => setTapped(isTapped ? null : i) : undefined}
             className={interactive ? "cursor-pointer" : undefined}>
            <rect x={x} y={48} width={w} height={34} rx={6} fill={fill} stroke="#2563eb"
              strokeWidth={isTapped ? 3 : 1.5} />
            <text x={x + w / 2} y={70} textAnchor="middle" fontSize={14} fontWeight={700}
              fill={v === null ? "#be123c" : "#1e3a8a"}>
              {v === null ? UNKNOWN_TEXT : formatNumberId(v)}
            </text>
          </g>
        );
      })}
      <text x={10} y={100} fontSize={11} fill="#64748b">
        {hint.parts.some((p) => p === null)
          ? `Bagian yang hilang = ${displayTotal} − ${knownSum}. Jumlahkan bagian yang diketahui, lalu kurangkan.`
          : "Bagian + bagian = keseluruhan."}
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// comparison
// ---------------------------------------------------------------------------

function ComparisonBar({
  hint,
}: {
  hint: { rows: { label: string; value: number | null }[]; unit?: string };
}) {
  const max = Math.max(...hint.rows.map((r) => r.value ?? 0), 1);
  return (
    <svg viewBox={`0 0 320 ${40 + hint.rows.length * 44}`} className="h-auto w-full" role="img"
      aria-label="Model batang perbandingan">
      {hint.rows.map((row, i) => {
        const y = 8 + i * 44;
        const w = row.value === null ? 0 : Math.max(20, (row.value / max) * 210);
        return (
          <g key={i}>
            <text x={8} y={y + 20} fontSize={12} fontWeight={600} fill="#334155">{row.label}</text>
            <rect x={80} y={y} width={210} height={28} rx={6} fill="#f1f5f9" stroke="#cbd5e1" />
            {row.value === null ? (
              <text x={185} y={y + 20} textAnchor="middle" fontSize={16} fontWeight={800} fill="#be123c">
                {UNKNOWN_TEXT}
              </text>
            ) : (
              <>
                <rect x={80} y={y} width={w} height={28} rx={6} fill="#93c5fd" stroke="#2563eb" />
                <text x={80 + w + 6} y={y + 20} fontSize={12} fontWeight={700} fill="#1e40af">
                  {formatNumberId(row.value)}
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// fraction-bar (tap to shade — the manipulative step)
// ---------------------------------------------------------------------------

function FractionBar({
  hint,
  interactive,
}: {
  hint: { wholes: number; partsPerWhole: number; shadedParts: number | null; label?: string };
  interactive: boolean;
}) {
  const [shaded, setShaded] = useState<Set<string>>(new Set());
  const cellW = 290 / hint.partsPerWhole;
  const rowH = 30;

  const countShown = hint.shadedParts ?? shaded.size;
  const toggle = (key: string) => {
    setShaded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Precompute which cells are filled when the payload dictates the shading
  // (no render-phase mutation).
  const autoKeys = useMemo(() => {
    const keys = new Set<string>();
    if (hint.shadedParts === null) return keys;
    let remaining = hint.shadedParts;
    for (let w = 0; w < hint.wholes && remaining > 0; w++) {
      for (let p = 0; p < hint.partsPerWhole && remaining > 0; p++) {
        keys.add(`${w}-${p}`);
        remaining -= 1;
      }
    }
    return keys;
  }, [hint]);

  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 320 ${hint.wholes * (rowH + 10) + 28}`} className="h-auto w-full" role="img"
        aria-label="Model batang pecahan">
        {Array.from({ length: hint.wholes }, (_, w) =>
          Array.from({ length: hint.partsPerWhole }, (_, p) => {
            const key = `${w}-${p}`;
            const isShaded = hint.shadedParts !== null ? autoKeys.has(key) : shaded.has(key);
            return (
              <g key={key}
                onClick={interactive && hint.shadedParts === null ? () => toggle(key) : undefined}
                className={interactive && hint.shadedParts === null ? "cursor-pointer" : undefined}>
                <rect
                  x={15 + p * cellW}
                  y={8 + w * (rowH + 10)}
                  width={cellW - 2}
                  height={rowH}
                  fill={isShaded ? "#2563eb" : "#ffffff"}
                  stroke="#1e40af"
                  strokeWidth={1.5}
                />
              </g>
            );
          }),
        )}
        <text x={15} y={hint.wholes * (rowH + 10) + 22} fontSize={13} fontWeight={700} fill="#1e40af">
          {countShown}/{hint.wholes * hint.partsPerWhole} bagian diwarnai
          {hint.label ? ` — ${hint.label}` : ""}
        </text>
      </svg>
      {interactive && hint.shadedParts === null && (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShaded(new Set())}
            className="min-h-10 rounded-full bg-slate-100 px-4 text-sm font-semibold text-slate-700">
            Ulangi
          </button>
          <span className="text-xs text-slate-500">Ketuk kotak untuk mewarnai bagian pecahan.</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// number-line (drag-lite: snapping handle)
// ---------------------------------------------------------------------------

function NumberLine({
  hint,
  interactive,
}: {
  hint: {
    min: number;
    max: number;
    stepValue: number;
    majorEvery: number;
    marks: (number | null)[];
    unit?: string;
  };
  interactive: boolean;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const unknownIndex = hint.marks.findIndex((m) => m === null);
  const [dragValue, setDragValue] = useState<number | null>(null);
  const ticks = Math.round((hint.max - hint.min) / hint.stepValue);
  const padL = 15;
  const width = 290;
  const toX = (v: number) => padL + ((v - hint.min) / (hint.max - hint.min)) * width;

  const valueFromPointer = (clientX: number): number => {
    const svg = svgRef.current;
    if (!svg) return hint.min;
    const rect = svg.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width - padL / 320));
    const raw = hint.min + ratio * (hint.max - hint.min);
    const snapped = Math.round(raw / hint.stepValue) * hint.stepValue;
    return Number(snapped.toFixed(4));
  };

  const shownUnknown = dragValue ?? null;

  return (
    <div className="flex flex-col gap-1">
      <svg
        ref={svgRef}
        viewBox="0 0 320 86"
        className="h-auto w-full touch-none"
        role="img"
        aria-label="Garis bilangan"
        onPointerDown={
          interactive && unknownIndex >= 0
            ? (e) => {
                (e.target as Element).setPointerCapture?.(e.pointerId);
                setDragValue(valueFromPointer(e.clientX));
              }
            : undefined
        }
        onPointerMove={
          interactive && unknownIndex >= 0 && dragValue !== null
            ? (e) => setDragValue(valueFromPointer(e.clientX))
            : undefined
        }
        onPointerUp={() => setDragValue((v) => v)}
      >
        <line x1={padL} y1={46} x2={padL + width} y2={46} stroke="#334155" strokeWidth={2} />
        {Array.from({ length: ticks + 1 }, (_, t) => {
          const v = hint.min + t * hint.stepValue;
          const x = toX(v);
          const major = t % hint.majorEvery === 0;
          return (
            <g key={t}>
              <line x1={x} y1={major ? 38 : 41} x2={x} y2={major ? 54 : 51} stroke="#64748b" strokeWidth={major ? 2 : 1} />
              {major && (
                <text x={x} y={70} textAnchor="middle" fontSize={10} fill="#475569">
                  {formatNumberId(v)}
                </text>
              )}
            </g>
          );
        })}
        {hint.marks.map((m, i) => {
          if (i === unknownIndex || m === null) {
            const v = shownUnknown;
            return (
              <g key={i}>
                {v !== null && (
                  <>
                    <circle cx={toX(v)} cy={46} r={8} fill="#2563eb" stroke="#1e3a8a" />
                    <text x={toX(v)} y={26} textAnchor="middle" fontSize={13} fontWeight={800} fill="#1e40af">
                      {formatNumberId(v)}
                    </text>
                  </>
                )}
                {v === null && (
                  <text x={toX(hint.min)} y={22} fontSize={12} fontWeight={700} fill="#be123c">
                    Geser titik biru ke posisi yang tepat
                  </text>
                )}
              </g>
            );
          }
          return (
            <g key={i}>
              <circle cx={toX(m)} cy={46} r={6} fill="#f472b6" stroke="#9d174d" />
              <text x={toX(m)} y={30} textAnchor="middle" fontSize={12} fontWeight={700} fill="#9d174d">
                {formatNumberId(m)}
              </text>
            </g>
          );
        })}
      </svg>
      {hint.unit && <span className="text-xs text-slate-500">satuan: {hint.unit}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// base-ten blocks / array
// ---------------------------------------------------------------------------

function BaseTen({ hint }: { hint: BaseTenHint }) {
  if (hint.variant === "array") {
    return (
      <svg viewBox="0 0 320 150" className="h-auto w-full" role="img" aria-label="Susunan titik (array)">
        <ArrayDots rows={hint.rows} cols={hint.cols} />
        <text x={160} y={140} textAnchor="middle" fontSize={12} fill="#64748b">
          {hint.rows ?? "?"} baris x {hint.cols ?? "?"} kolom — susunan perkalian
        </text>
      </svg>
    );
  }
  const groups: { place: string; label: string; count: number; isUnknown: boolean }[] = [
    { place: "thousands", label: "ribuan", count: hint.thousands, isUnknown: hint.unknown === "thousands" },
    { place: "hundreds", label: "ratusan", count: hint.hundreds, isUnknown: hint.unknown === "hundreds" },
    { place: "tens", label: "puluhan", count: hint.tens, isUnknown: hint.unknown === "tens" },
    { place: "ones", label: "satuan", count: hint.ones, isUnknown: hint.unknown === "ones" },
  ];
  return (
    <svg viewBox="0 0 320 120" className="h-auto w-full" role="img" aria-label="Bilangan basis sepuluh">
      {groups.map((g, i) => (
        <g key={g.place}>
          <text x={20 + i * 80} y={16} textAnchor="middle" fontSize={11} fontWeight={600} fill="#475569">
            {g.label}
          </text>
          <text x={20 + i * 80} y={62} textAnchor="middle" fontSize={26} fontWeight={800}
            fill={g.isUnknown ? "#be123c" : "#1e3a8a"}>
            {g.isUnknown ? UNKNOWN_TEXT : formatNumberId(g.count, 0)}
          </text>
          <BlockGlyph count={g.isUnknown ? 0 : g.count} x={20 + i * 80} place={g.place} />
        </g>
      ))}
    </svg>
  );
}

function ArrayDots({ rows, cols }: { rows: number | null; cols: number | null }) {
  const shownRows = rows ?? 3;
  const shownCols = cols ?? 5;
  const dots: ReactNode[] = [];
  for (let r = 0; r < shownRows; r++) {
    for (let c = 0; c < shownCols; c++) {
      dots.push(
        <circle key={`${r}-${c}`} cx={40 + c * (240 / Math.max(shownCols, 1))} cy={24 + r * 26} r={8}
          fill={rows === null && r >= shownRows - 1 ? "#fecdd3" : "#93c5fd"} stroke="#1e40af" />,
      );
    }
  }
  return (
    <g>
      {dots}
      {rows === null && (
        <text x={160} y={20} textAnchor="middle" fontSize={14} fontWeight={800} fill="#be123c">
          {UNKNOWN_TEXT} baris
        </text>
      )}
      {cols === null && (
        <text x={160} y={118} textAnchor="middle" fontSize={14} fontWeight={800} fill="#be123c">
          {UNKNOWN_TEXT} kolom
        </text>
      )}
    </g>
  );
}

function BlockGlyph({ count, x, place }: { count: number; x: number; place: string }) {
  const size = place === "thousands" ? 16 : place === "hundreds" ? 14 : place === "tens" ? 12 : 9;
  const shown = Math.min(count, 4);
  return (
    <g>
      {Array.from({ length: shown }, (_, i) => (
        <rect key={i} x={x - size / 2} y={78 + i * (size + 3)} width={size} height={size}
          rx={2} fill="#bfdbfe" stroke="#1e40af" />
      ))}
      {count > shown && (
        <text x={x + size} y={78 + shown * (size + 3)} fontSize={10} fill="#64748b">
          x{count}
        </text>
      )}
    </g>
  );
}
