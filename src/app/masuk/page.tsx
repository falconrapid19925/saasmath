import Link from "next/link";
import { redirect } from "next/navigation";

import { ChildLoginForm, ChildProfileLogin } from "@/components/auth/AuthForms";
import { getMyChildren } from "@/app/actions/dashboard";
import { getSession } from "@/app/actions/auth";
import type { ChildSummaryLite } from "@/lib/client/view-models";

export const dynamic = "force-dynamic";
export const metadata = { title: "Masuk anak — SaasMath" };

export default async function ChildLoginPage() {
  const session = await getSession();
  if (session?.role === "child") redirect("/anak");

  // Family device: parent logged in → tap a profile, then PIN.
  let profiles: ChildSummaryLite[] = [];
  if (session?.role === "parent") {
    profiles = await getMyChildren();
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div className="text-center">
        <h1 className="text-2xl font-extrabold text-slate-900">Ayo masuk, anak hebat! 🌟</h1>
        <p className="mt-1 text-sm text-slate-500">
          {profiles.length > 0
            ? "Ketuk fotomu, lalu masukkan PIN."
            : "Tulis namamu, lalu masukkan PIN 6 angka."}
        </p>
      </div>

      {profiles.length > 0 ? (
        <div className="flex flex-col gap-4">
          {profiles.map((p) => (
            <div key={p.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <ChildProfileLogin childId={p.id} childName={p.name} />
            </div>
          ))}
          <Link href="/orangtua" className="text-center text-sm font-semibold text-slate-500 underline">
            Kembali ke portal orang tua
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <ChildLoginForm />
        </div>
      )}
    </main>
  );
}
