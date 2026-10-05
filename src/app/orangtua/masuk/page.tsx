import Link from "next/link";

import { ParentLoginForm } from "@/components/auth/AuthForms";

export const metadata = { title: "Masuk orang tua — SaasMath" };

export default function ParentLoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 px-6 py-10">
      <div>
        <Link href="/" className="text-sm font-semibold text-slate-500">
          ← Kembali
        </Link>
        <h1 className="mt-3 text-2xl font-extrabold text-slate-900">Masuk portal orang tua</h1>
      </div>
      <ParentLoginForm />
      <p className="text-center text-sm text-slate-600">
        Belum punya akun?{" "}
        <Link href="/orangtua/daftar" className="font-bold text-blue-600 underline">
          Daftar dulu
        </Link>
      </p>
    </main>
  );
}
