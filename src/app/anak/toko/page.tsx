import Link from "next/link";
import { redirect } from "next/navigation";

import { ShopGrid } from "@/components/shop/ShopGrid";
import { getShopData } from "@/app/actions/drill";
import { getSession } from "@/app/actions/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Toko bintang — SaasMath" };

export default async function ShopPage() {
  const session = await getSession();
  if (!session || session.role !== "child") redirect("/masuk");
  const data = await getShopData();

  if ("error" in data) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md items-center justify-center px-6 text-center">
        <p className="text-sm text-slate-600">{data.error}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-8 pt-4">
      <header className="flex items-center justify-between">
        <Link href="/anak" className="text-sm font-semibold text-slate-500">
          ← Beranda
        </Link>
        <h1 className="text-lg font-extrabold text-slate-900">Toko Bintang 🎁</h1>
        <span className="w-16" />
      </header>
      <ShopGrid initialItems={data.items} initialBalance={data.balance} />
    </main>
  );
}
