import { redirect } from "next/navigation";

import { ChildHeader, MasteryMap, TodaySetCard } from "@/components/ChildHome";
import { SyncIndicator } from "@/components/SyncIndicator";
import { getChildHomeData } from "@/app/actions/drill";
import { logoutForm, getSession } from "@/app/actions/auth";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Beranda — SaasMath" };

export default async function ChildHomePage() {
  const session = await getSession();
  if (!session || session.role !== "child") redirect("/masuk");
  const data = await getChildHomeData();
  if (!data) redirect("/masuk");

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-6 pt-4">
      <div className="flex items-center justify-between">
        <span className="text-xl font-extrabold text-blue-700">SaasMath</span>
        <div className="flex items-center gap-2">
          <Link
            href="/anak/toko"
            className="min-h-10 rounded-xl bg-amber-100 px-3 text-sm font-bold leading-10 text-amber-700"
          >
            Toko 🎁
          </Link>
          <form action={logoutForm}>
            <button
              type="submit"
              className="min-h-10 rounded-xl bg-slate-100 px-3 text-sm font-semibold leading-10 text-slate-500"
            >
              Keluar
            </button>
          </form>
        </div>
      </div>

      <ChildHeader data={data} />
      <TodaySetCard doneToday={data.streak.doneToday} needsPlacement={data.needsPlacement} />
      <MasteryMap islands={data.islands} />
      <SyncIndicator />
    </main>
  );
}
