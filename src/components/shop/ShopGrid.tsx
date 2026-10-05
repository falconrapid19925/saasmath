"use client";

/**
 * Shop-lite (plan section 4.3): spend stars on avatar/room items. Purchases
 * and equipping go through server actions; balance refetches after each.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

import { equipShopItem, purchaseShopItem } from "@/app/actions/drill";
import type { ShopItemView } from "@/lib/client/view-models";
import { formatNumberId } from "@/lib/client/format";

export function ShopGrid({ initialItems, initialBalance }: { initialItems: ShopItemView[]; initialBalance: number }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [balance, setBalance] = useState(initialBalance);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const buy = async (item: ShopItemView) => {
    setBusyId(item.id);
    setNotice(null);
    try {
      const res = await purchaseShopItem({ itemId: item.id });
      if ("error" in res) {
        setNotice(res.error);
        return;
      }
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, owned: true } : i)));
      setBalance((b) => b - item.priceStars);
      setNotice(`Yeay! ${item.nameId} sudah jadi milikmu 🎉`);
    } catch (err) {
      // The actions surface the server's Indonesian message; anything else
      // (network hiccup, unexpected throw) gets a friendly fallback instead
      // of dying as an unhandled rejection with silent UI.
      setNotice(
        err instanceof Error && err.message
          ? err.message
          : "Yah, pembelian gagal. Coba lagi ya.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const equip = async (item: ShopItemView) => {
    setBusyId(item.id);
    setNotice(null);
    try {
      const res = await equipShopItem({ itemId: item.id });
      if ("error" in res) {
        setNotice(res.error);
        return;
      }
      setItems((prev) => prev.map((i) => ({ ...i, equipped: i.id === item.id && i.kind === "avatar" })));
      setNotice(`${item.nameId} sekarang dipakai!`);
      router.refresh();
    } catch (err) {
      setNotice(
        err instanceof Error && err.message
          ? err.message
          : "Yah, gagal memakai itemnya. Coba lagi ya.",
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-2xl bg-amber-50 px-4 py-3 text-center text-sm font-bold text-amber-700 ring-1 ring-amber-200">
        Bintangmu: ⭐ {formatNumberId(balance, 0)}
      </p>

      {notice && <p className="rounded-xl bg-sky-50 px-3 py-2 text-center text-sm text-sky-800">{notice}</p>}

      <div className="grid grid-cols-2 gap-3">
        {items.map((item) => (
          <div key={item.id} className="flex flex-col items-center gap-2 rounded-2xl bg-white p-4 text-center shadow-sm ring-1 ring-slate-200">
            <span
              className="flex h-16 w-16 items-center justify-center rounded-2xl text-4xl"
              style={{ backgroundColor: item.color ?? "#eff6ff" }}
              aria-hidden
            >
              {item.emoji ?? (item.kind === "avatar" ? "😀" : "🛋️")}
            </span>
            <p className="text-sm font-bold text-slate-800">{item.nameId}</p>
            <p className="text-xs text-slate-500">{item.kind === "avatar" ? "Avatar" : "Dekorasi kamar"}</p>
            {item.owned ? (
              item.kind === "avatar" ? (
                <button
                  type="button"
                  disabled={busyId === item.id || item.equipped}
                  onClick={() => void equip(item)}
                  className={`min-h-10 w-full rounded-xl text-sm font-bold ${
                    item.equipped ? "bg-emerald-100 text-emerald-700" : "bg-blue-600 text-white"
                  } disabled:opacity-60`}
                >
                  {item.equipped ? "Dipakai ✓" : "Pakai"}
                </button>
              ) : (
                <span className="text-xs font-bold text-emerald-600">Dimiliki ✓</span>
              )
            ) : (
              <button
                type="button"
                disabled={busyId === item.id || balance < item.priceStars}
                onClick={() => void buy(item)}
                className="min-h-10 w-full rounded-xl bg-amber-400 text-sm font-extrabold text-amber-950 disabled:opacity-40"
              >
                ⭐ {item.priceStars}
              </button>
            )}
          </div>
        ))}
      </div>

      {items.length === 0 && (
        <p className="rounded-2xl bg-amber-50 p-4 text-center text-sm text-amber-800 ring-1 ring-amber-200">
          Toko belum dibuka — barang sedang diantar 🚚
        </p>
      )}
      <p className="text-center text-xs text-slate-400">
        Bintang didapat dari menyelesaikan set harian — bukan dari kecepatan!
      </p>
    </div>
  );
}
