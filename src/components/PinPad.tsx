"use client";

/** Child PIN pad: 6-digit entry with big targets and feedback dots. */

import { useState } from "react";

export function PinPad({
  onComplete,
  disabled,
  label = "Masukkan 6 angka PIN",
}: {
  onComplete: (pin: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [pin, setPin] = useState("");

  const press = (d: string) => {
    if (disabled || pin.length >= 6) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 6) onComplete(next);
  };

  return (
    <div className="flex flex-col items-center gap-5">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <div className="flex gap-3" aria-label="PIN yang diketuk" aria-live="polite">
        {Array.from({ length: 6 }, (_, i) => (
          <span
            key={i}
            className={`h-4 w-4 rounded-full transition ${
              i < pin.length ? "bg-blue-600" : "bg-slate-300"
            }`}
          />
        ))}
      </div>
      <div className="grid w-full max-w-xs grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button
            key={d}
            type="button"
            disabled={disabled}
            onClick={() => press(d)}
            className="min-h-14 rounded-xl bg-white text-2xl font-bold text-slate-800 shadow-sm ring-1 ring-slate-200 transition active:bg-blue-100 disabled:opacity-40"
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setPin("")}
          className="min-h-14 rounded-xl bg-slate-100 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 disabled:opacity-40"
        >
          Hapus
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => press("0")}
          className="min-h-14 rounded-xl bg-white text-2xl font-bold text-slate-800 shadow-sm ring-1 ring-slate-200 transition active:bg-blue-100 disabled:opacity-40"
        >
          0
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-label="Hapus satu angka"
          onClick={() => setPin((p) => p.slice(0, -1))}
          className="min-h-14 rounded-xl bg-slate-100 text-xl font-semibold text-slate-600 ring-1 ring-slate-200 disabled:opacity-40"
        >
          ⌫
        </button>
      </div>
    </div>
  );
}
