import { inArray } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ReportActions, CheckoutPanel, SetPdfList, StarCalendar } from "@/components/parent/ParentWidgets";
import { getDb } from "@/db";
import { shopItems, subscriptions } from "@/db/schema";
import { getMyChildren, getParentDashboard } from "@/app/actions/dashboard";
import { getSession, logoutForm } from "@/app/actions/auth";
import type { ParentDashboardData } from "@/lib/client/view-models";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard orang tua — SaasMath" };

export default async function ParentDashboardPage() {
  const session = await getSession();
  if (!session || session.role !== "parent") redirect("/orangtua/masuk");

  const [dashboard, kids] = await Promise.all([getParentDashboard(), getMyChildren()]);
  const data: ParentDashboardData =
    "error" in dashboard ? { parentName: "Orang Tua", weekLabel: "", children: [] } : dashboard;

  // Request-time read (this page is force-dynamic): the subscription each
  // child currently sits on, so the checkout panel can show live status, and
  // each child's equipped avatar item for the profile list (the same
  // emoji lookup getChildHomeData does).
  const avatarIds = kids
    .map((k) => k.avatar)
    .filter((id): id is string => Boolean(id));
  const [subs, avatarItemRows] = await Promise.all([
    kids.length > 0
      ? getDb()
          .select()
          .from(subscriptions)
          .where(inArray(subscriptions.childId, kids.map((k) => k.id)))
      : Promise.resolve([]),
    avatarIds.length > 0
      ? getDb().select().from(shopItems).where(inArray(shopItems.id, avatarIds))
      : Promise.resolve([]),
  ]);
  const subByChild = new Map(subs.map((s) => [s.childId, s]));
  const emojiByItem = new Map(
    avatarItemRows.map((i) => [i.id, i.emojiOrColor?.emoji ?? "😀"]),
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Dashboard Orang Tua</h1>
          <p className="text-sm text-slate-500">Hai, {data.parentName} 👋</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin"
            className="min-h-11 rounded-xl bg-slate-100 px-4 text-sm font-semibold leading-11 text-slate-600 ring-1 ring-slate-200"
          >
            Admin
          </Link>
          <form action={logoutForm}>
            <button
              type="submit"
              className="min-h-11 rounded-xl bg-slate-100 px-4 text-sm font-semibold text-slate-600 ring-1 ring-slate-200"
            >
              Keluar
            </button>
          </form>
        </div>
      </header>

      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Profil anak</h2>
          <Link
            href="/orangtua/anak-baru"
            className="min-h-10 rounded-xl bg-blue-600 px-4 text-sm font-bold leading-10 text-white"
          >
            + Tambah anak
          </Link>
        </div>
        {kids.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            Belum ada profil anak. Tambahkan agar anak bisa mulai latihan.
          </p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-3">
            {kids.map((k) => (
              <li key={k.id} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                <span className="text-2xl" aria-hidden>
                  {(k.avatar && emojiByItem.get(k.avatar)) ?? "😀"}
                </span>
                <div>
                  <p className="text-sm font-bold text-slate-800">{k.name}</p>
                  <p className="text-xs text-slate-500">Kelas {k.grade}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-slate-400">
          Anak masuk lewat tombol “Masuk anak” di halaman depan dengan nama + PIN.
        </p>
      </section>

      {kids.length > 0 && (
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-base font-bold text-slate-900">Langganan &amp; pembayaran</h2>
          <p className="mt-1 text-xs text-slate-500">
            Pembayaran lewat Midtrans (QRIS, e-wallet, virtual account). Status langganan
            berubah otomatis setelah pembayaran terkonfirmasi.
          </p>
          <ul className="mt-3 flex flex-col gap-4">
            {kids.map((k) => {
              const sub = subByChild.get(k.id);
              return (
                <li key={k.id} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <p className="mb-2 text-sm font-bold text-slate-800">
                    {k.name} <span className="font-normal text-slate-500">· Kelas {k.grade}</span>
                  </p>
                  <CheckoutPanel
                    childId={k.id}
                    plan={sub?.plan ?? "free"}
                    status={sub?.status ?? "active"}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {data.children.length === 0 ? (
        <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-200">
          Ringkasan mingguan muncul setelah anak mulai berlatihan.
        </p>
      ) : (
        data.children.map((c) => (
          <section key={c.childId} className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-bold text-slate-900">{c.childName}</h2>
              <span className="text-xs font-semibold text-slate-500">Kelas {c.grade}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Set minggu ini" value={String(c.setsDone)} />
              <Stat label="Ketepatan" value={c.avgAccuracy === null ? "–" : `${Math.round(c.avgAccuracy * 100)}%`} />
              <Stat label="Dalam SCT" value={`${c.withinSctCount}/${c.setsDone}`} />
              <Stat label="Streak" value={`🔥 ${c.streak.current} (❄️${c.streak.freezesLeft})`} />
            </div>

            <p className="text-sm text-slate-600">
              Penguasaan:{" "}
              <b className="text-slate-400">Baru {c.masteryCounts.Baru}</b> ·{" "}
              <b className="text-blue-600">Lancar {c.masteryCounts.Lancar}</b> ·{" "}
              <b className="text-emerald-600">Kuasai {c.masteryCounts.Kuasai}</b>
              {c.currentSkillTitle && (
                <>
                  {" "}· sedang latihan: <b>{c.currentSkillTitle}</b>
                </>
              )}
            </p>
            {c.flaggedCount > 0 && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {c.flaggedCount} hasil ditandai tidak wajar sistem dan perlu ditinjau (mis. pola jawaban terlalu seragam).
              </p>
            )}

            <div>
              <h3 className="mb-2 text-sm font-bold text-slate-700">Kalender bintang</h3>
              <StarCalendar calendar={c.calendar} />
            </div>

            <div>
              <h3 className="mb-2 text-sm font-bold text-slate-700">Lembar latihan + kunci jawaban</h3>
              <SetPdfList summary={c} />
            </div>

            <div>
              <h3 className="mb-2 text-sm font-bold text-slate-700">Ringkasan WhatsApp mingguan</h3>
              <ReportActions summary={c} />
            </div>
          </section>
        ))
      )}

      <p className="text-center text-xs text-slate-400">
        {data.weekLabel} — data diperbarui setiap hasil set tersinkron.
      </p>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 text-center ring-1 ring-slate-200">
      <p className="text-lg font-extrabold text-slate-900">{value}</p>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}
