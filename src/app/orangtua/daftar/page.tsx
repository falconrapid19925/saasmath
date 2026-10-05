import Link from "next/link";

import { ParentRegisterForm } from "@/components/auth/AuthForms";

export const metadata = { title: "Daftar orang tua — SaasMath" };

export default function ParentRegisterPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 px-6 py-10">
      <div>
        <Link href="/" className="text-sm font-semibold text-slate-500">
          ← Kembali
        </Link>
        <h1 className="mt-3 text-2xl font-extrabold text-slate-900">Buat akun orang tua</h1>
        <p className="mt-1 text-sm text-slate-600">
          Satu akun untuk memantau laporan mingguan dan mengatur profil anak.
        </p>
      </div>
      <ParentRegisterForm />
      <p className="text-center text-sm text-slate-600">
        Sudah punya akun?{" "}
        <Link href="/orangtua/masuk" className="font-bold text-blue-600 underline">
          Masuk di sini
        </Link>
      </p>
    </main>
  );
}
