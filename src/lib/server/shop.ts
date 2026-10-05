/**
 * Shop purchase write (audit fix: purchaseShopItem charged the wallet with an
 * absolute balance computed from a stale pre-transaction read, so concurrent
 * purchases could charge the ledger twice while decrementing once). The whole
 * purchase — ownership check, balance-guarded relative decrement, inventory
 * row, ledger entry — runs in one transaction against the rows the
 * transaction itself sees. UI strings are Bahasa Indonesia (rendered by the
 * client straight from `error`).
 */

import { and, eq, gte, sql } from "drizzle-orm";

import type { SaasMathDb } from "@/db";
import { children, inventory, shopItems, starsLedger } from "@/db/schema";

/** Discriminated purchase outcome; `error` is client-renderable. */
export type ShopWriteResult = { ok: true } | { ok: false; error: string };

export function purchaseShopItemForChild(
  db: SaasMathDb,
  childId: string,
  itemId: string,
): ShopWriteResult {
  const itemRows = db
    .select()
    .from(shopItems)
    .where(eq(shopItems.id, itemId))
    .limit(1)
    .all();
  const item = itemRows[0];
  if (!item) return { ok: false, error: "Item tidak ditemukan." };

  return db.transaction((tx): ShopWriteResult => {
    const alreadyOwned = tx
      .select()
      .from(inventory)
      .where(and(eq(inventory.childId, childId), eq(inventory.itemId, item.id)))
      .get();
    if (alreadyOwned) return { ok: false, error: "Kamu sudah punya item ini." };

    // Relative decrement guarded by the current balance: fails (changes 0)
    // when the wallet cannot cover the price, whatever concurrent writes did.
    const charged = tx
      .update(children)
      .set({ starsBalance: sql`${children.starsBalance} - ${item.priceStars}` })
      .where(and(eq(children.id, childId), gte(children.starsBalance, item.priceStars)))
      .run();
    if (charged.changes === 0) {
      return { ok: false, error: "Bintang belum cukup. Selesaikan set harian dulu ya!" };
    }

    tx.insert(inventory).values({ childId, itemId: item.id }).run();
    tx.insert(starsLedger)
      .values({ childId, delta: -item.priceStars, reason: "shop_purchase" })
      .run();
    return { ok: true };
  });
}
