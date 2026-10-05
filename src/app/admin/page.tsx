import Link from "next/link";
import { redirect } from "next/navigation";

import { getAdminSkills } from "@/app/actions/dashboard";
import { getSession } from "@/app/actions/auth";
import { formatNumberId } from "@/lib/client/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin — Daftar skill" };

export default async function AdminPage() {
  const session = await getSession();
  if (!session || session.role !== "parent") redirect("/orangtua/masuk");
  const data = await getAdminSkills();

  if ("error" in data) {
    return <main className="p-8 text-center text-sm text-slate-600">{data.error}</main>;
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Admin-lite: Daftar Skill</h1>
          <p className="text-sm text-slate-500">
            Read-only. {data.skills.length} skill terdaftar — parameter generator
            per langkah ditampilkan apa adanya.
          </p>
        </div>
        <Link href="/orangtua" className="text-sm font-semibold text-blue-600 underline">
          ← Dashboard
        </Link>
      </header>

      {data.skills.length === 0 && (
        <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-200">
          Belum ada skill. Jalankan <code>npm run db:seed</code> setelah modul
          konten selesai.
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {data.skills.map((s) => (
          <li key={s.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-base font-bold text-slate-900">{s.titleId}</p>
              <p className="text-xs text-slate-500">
                kelas {s.grade} · {s.strand} · {s.family}
              </p>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              <code className="rounded bg-slate-100 px-1">{s.id}</code> · SCT dasar{" "}
              {formatNumberId(s.baseSctSecondsPerItem, 1)} dtk/soal · {s.stepCount} langkah
              {s.isFreeIsland && " · pulau gratis"}
              {s.cpaModels.length > 0 && ` · CPA: ${s.cpaModels.join(", ")}`}
            </p>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-semibold text-blue-600">
                Parameter generator per langkah
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-slate-900 p-3 text-xs leading-relaxed text-slate-100">
                {JSON.stringify(s.steps, null, 2)}
              </pre>
            </details>
          </li>
        ))}
      </ul>
    </main>
  );
}
