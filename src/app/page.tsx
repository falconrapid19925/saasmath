import Link from "next/link";

import { getSession } from "@/app/actions/auth";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const session = await getSession();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div className="text-center">
        <p className="text-5xl" aria-hidden>
          ➗ ✖️ ➕
        </p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900">
          Latihan matematika 10 menit sehari
        </h1>
        <p className="mt-2 text-base leading-relaxed text-slate-600">
          Soal baru setiap hari sesuai kemampuanmu, diukur dengan target waktu
          personal (SCT), dan dibimbing dengan <b>model batang</b> saat
          kesulitan — untuk siswa kelas 4–6 SD.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {session?.role === "child" ? (
          <Link
            href="/anak"
            className="min-h-14 rounded-2xl bg-blue-600 px-6 text-center text-lg font-bold leading-[3.5rem] text-white shadow active:bg-blue-700"
          >
            Lanjutkan latihanmu ▶
          </Link>
        ) : (
          <Link
            href="/masuk"
            className="min-h-14 rounded-2xl bg-blue-600 px-6 text-center text-lg font-bold leading-[3.5rem] text-white shadow active:bg-blue-700"
          >
            Masuk anak (pakai PIN) 🔢
          </Link>
        )}
        {session?.role === "parent" ? (
          <Link
            href="/orangtua"
            className="min-h-14 rounded-2xl bg-white px-6 text-center text-lg font-bold leading-[3.5rem] text-blue-700 ring-1 ring-blue-200 active:bg-blue-50"
          >
            Dashboard orang tua
          </Link>
        ) : (
          <Link
            href="/orangtua/masuk"
            className="min-h-14 rounded-2xl bg-white px-6 text-center text-lg font-bold leading-[3.5rem] text-blue-700 ring-1 ring-blue-200 active:bg-blue-50"
          >
            Portal orang tua 👪
          </Link>
        )}
      </div>

      <ul className="mx-auto flex flex-col gap-2 text-sm text-slate-600">
        <li>✅ Soal otomatis baru tiap hari, naik pelan-pelan ala Kumon</li>
        <li>✅ Target waktu personal, tanpa tekanan — timer tak terlihat</li>
        <li>✅ Salah? Ada gambar model batang untuk membantu</li>
        <li>✅ Kumpulkan bintang, kumpulkan streak, pamerkan avatar</li>
        <li>✅ Laporan mingguan untuk orang tua (PDF + WhatsApp)</li>
      </ul>
    </main>
  );
}
