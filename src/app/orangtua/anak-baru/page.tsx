import { redirect } from "next/navigation";

import { ChildSetupForm } from "@/components/auth/AuthForms";
import { getSession } from "@/app/actions/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tambah profil anak — SaasMath" };

export default async function ChildSetupPage() {
  const session = await getSession();
  if (!session || session.role !== "parent") redirect("/orangtua/masuk");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 px-6 py-10">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Profil anak baru</h1>
        <p className="mt-1 text-sm text-slate-600">
          Setelah ini anak langsung ikut penempatan singkat (± 15 soal) untuk
          menemukan titik mulai terbaiknya.
        </p>
      </div>
      <ChildSetupForm />
    </main>
  );
}
