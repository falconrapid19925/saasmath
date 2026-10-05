"use client";

/**
 * Parent register/login, child setup (parent side) and child login (name +
 * PIN or profile + PIN on the family device). All forms call server actions
 * and push routes on success.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { PinPad } from "@/components/PinPad";
import { createChild, loginChildById } from "@/app/actions/auth";
import { loginChildApi, loginParentApi, registerParentApi } from "@/lib/client/api";

function useSubmit() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, to: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(to);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return { busy, error, run, setError };
}

const inputCls =
  "min-h-12 w-full rounded-xl bg-white px-4 text-base text-slate-900 ring-1 ring-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500";

export function ParentRegisterForm() {
  const { busy, error, run } = useSubmit();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => registerParentApi({ name, email, password }), "/orangtua");
      }}
    >
      <label className="text-sm font-semibold text-slate-700">
        Nama orang tua
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
      </label>
      <label className="text-sm font-semibold text-slate-700">
        Email
        <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label className="text-sm font-semibold text-slate-700">
        Kata sandi (minimal 8 karakter)
        <input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
      </label>
      {error && <p className="rounded-xl bg-pink-50 px-3 py-2 text-sm text-pink-700">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="min-h-13 w-full rounded-xl bg-blue-600 py-3 text-base font-bold text-white shadow active:bg-blue-700 disabled:opacity-50"
      >
        {busy ? "Menyimpan…" : "Daftar"}
      </button>
    </form>
  );
}

export function ParentLoginForm() {
  const { busy, error, run } = useSubmit();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => loginParentApi({ email, password }), "/orangtua");
      }}
    >
      <label className="text-sm font-semibold text-slate-700">
        Email
        <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label className="text-sm font-semibold text-slate-700">
        Kata sandi
        <input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      {error && <p className="rounded-xl bg-pink-50 px-3 py-2 text-sm text-pink-700">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="min-h-13 w-full rounded-xl bg-blue-600 py-3 text-base font-bold text-white shadow active:bg-blue-700 disabled:opacity-50"
      >
        {busy ? "Memeriksa…" : "Masuk"}
      </button>
    </form>
  );
}

export function ChildSetupForm() {
  const { busy, error, run } = useSubmit();
  const [name, setName] = useState("");
  const [grade, setGrade] = useState<4 | 5>(4);
  const [pinDone, setPinDone] = useState<string | null>(null);

  if (pinDone === null) {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-center text-sm text-slate-500">
          Buat PIN 6 angka untuk anakmu. Anak memakainya untuk masuk setiap hari.
        </p>
        <PinPad onComplete={setPinDone} label="Ketuk 6 angka PIN anak" />
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => createChild({ name, grade, pin: pinDone }), "/orangtua");
      }}
    >
      <label className="text-sm font-semibold text-slate-700">
        Nama anak
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
      </label>
      <fieldset className="text-sm font-semibold text-slate-700">
        <legend className="mb-1">Kelas</legend>
        <div className="flex gap-2">
          {([4, 5] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGrade(g)}
              className={`min-h-12 flex-1 rounded-xl text-base font-bold ring-1 ${
                grade === g ? "bg-blue-600 text-white ring-blue-600" : "bg-white text-slate-700 ring-slate-300"
              }`}
            >
              Kelas {g}
            </button>
          ))}
        </div>
      </fieldset>
      <p className="text-xs text-slate-500">
        PIN anak: <b>{"•".repeat(6)}</b> —{" "}
        <button type="button" className="text-blue-600 underline" onClick={() => setPinDone(null)}>
          ganti
        </button>
      </p>
      {error && <p className="rounded-xl bg-pink-50 px-3 py-2 text-sm text-pink-700">{error}</p>}
      <button
        type="submit"
        disabled={busy || name.trim().length < 2}
        className="min-h-13 w-full rounded-xl bg-blue-600 py-3 text-base font-bold text-white shadow active:bg-blue-700 disabled:opacity-50"
      >
        {busy ? "Menyimpan…" : "Simpan profil anak"}
      </button>
    </form>
  );
}

export function ChildLoginForm() {
  const { busy, error, run, setError } = useSubmit();
  const [name, setName] = useState("");
  const [pin, setPin] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <label className="text-sm font-semibold text-slate-700">
        Siapa namamu?
        <input
          className={inputCls}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setPin(null);
            setError(null);
          }}
          placeholder="Tulis nama kamu"
        />
      </label>
      {name.trim().length >= 2 && pin === null && (
        <PinPad onComplete={setPin} label={`Hai ${name.trim()}, ketuk PINmu`} />
      )}
      {pin !== null && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => loginChildApi({ name: name.trim(), pin }), "/anak")}
          className="min-h-13 w-full rounded-xl bg-blue-600 py-3 text-base font-bold text-white shadow active:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Memeriksa…" : "Masuk dan mulai latihan"}
        </button>
      )}
      {error && <p className="rounded-xl bg-pink-50 px-3 py-2 text-center text-sm text-pink-700">{error}</p>}
    </div>
  );
}

export function ChildProfileLogin({ childId, childName }: { childId: string; childName: string }) {
  const { busy, error, run } = useSubmit();
  const [pin, setPin] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        type="button"
        onClick={() => setPin(pin === null ? "" : null)}
        className="flex flex-col items-center gap-2"
      >
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-100 text-4xl">😀</span>
        <span className="text-base font-bold text-slate-800">{childName}</span>
      </button>
      {pin !== null && (
        <PinPad
          onComplete={(p) => void run(() => loginChildById({ childId, pin: p }), "/anak")}
          label={`Ketuk PIN ${childName}`}
        />
      )}
      {busy && <p className="text-sm text-slate-500">Memeriksa…</p>}
      {error && <p className="rounded-xl bg-pink-50 px-3 py-2 text-center text-sm text-pink-700">{error}</p>}
    </div>
  );
}
