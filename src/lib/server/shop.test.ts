/**
 * Seam tests for the shop purchase write (./shop): the wallet decrement is
 * relative to the row the transaction itself sees and guarded by the balance,
 * so concurrent purchases can never charge the ledger twice while decrementing
 * once (the stale-read bug the audit flagged).
 */

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { children, inventory, starsLedger } from "../../db/schema";
import { makeDb, seedChild, seedShopItem } from "./test-db";
import { purchaseShopItemForChild } from "./shop";

const AVATAR = "avatar-cat";

describe("purchaseShopItemForChild", () => {
  let handle: ReturnType<typeof makeDb>;

  beforeEach(() => {
    handle = makeDb();
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  it("charges the wallet relatively and writes inventory + one ledger entry", async () => {
    const { db } = handle;
    await seedChild(db, "child-shop-1", null);
    await db.update(children).set({ starsBalance: 100 }).where(eq(children.id, "child-shop-1"));
    await seedShopItem(db, { id: AVATAR, priceStars: 40, emojiOrColor: { emoji: "🐱" } });

    const result = purchaseShopItemForChild(db, "child-shop-1", AVATAR);

    expect(result).toEqual({ ok: true });
    const child = (await db.select().from(children).where(eq(children.id, "child-shop-1")))[0]!;
    expect(child.starsBalance).toBe(60);
    expect((await db.select().from(inventory)).length).toBe(1);
    const ledger = await db.select().from(starsLedger);
    expect(ledger.length).toBe(1);
    expect(ledger[0]!.delta).toBe(-40);
    expect(ledger[0]!.reason).toBe("shop_purchase");
  });

  it("rejects a purchase the balance cannot cover and writes nothing", async () => {
    const { db } = handle;
    await seedChild(db, "child-shop-2", null);
    await db.update(children).set({ starsBalance: 10 }).where(eq(children.id, "child-shop-2"));
    await seedShopItem(db, { id: AVATAR, priceStars: 40 });

    const result = purchaseShopItemForChild(db, "child-shop-2", AVATAR);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Bintang belum cukup. Selesaikan set harian dulu ya!");
    const child = (await db.select().from(children).where(eq(children.id, "child-shop-2")))[0]!;
    expect(child.starsBalance).toBe(10);
    expect((await db.select().from(inventory)).length).toBe(0);
    expect((await db.select().from(starsLedger)).length).toBe(0);
  });

  it("allows spending down to exactly zero", async () => {
    const { db } = handle;
    await seedChild(db, "child-shop-3", null);
    await db.update(children).set({ starsBalance: 40 }).where(eq(children.id, "child-shop-3"));
    await seedShopItem(db, { id: AVATAR, priceStars: 40 });

    const result = purchaseShopItemForChild(db, "child-shop-3", AVATAR);

    expect(result).toEqual({ ok: true });
    const child = (await db.select().from(children).where(eq(children.id, "child-shop-3")))[0]!;
    expect(child.starsBalance).toBe(0);
  });

  it("rejects a second purchase of an owned item without re-charging", async () => {
    const { db } = handle;
    await seedChild(db, "child-shop-4", null);
    await db.update(children).set({ starsBalance: 100 }).where(eq(children.id, "child-shop-4"));
    await seedShopItem(db, { id: AVATAR, priceStars: 40 });

    expect(purchaseShopItemForChild(db, "child-shop-4", AVATAR)).toEqual({ ok: true });
    const second = purchaseShopItemForChild(db, "child-shop-4", AVATAR);

    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBe("Kamu sudah punya item ini.");
    const child = (await db.select().from(children).where(eq(children.id, "child-shop-4")))[0]!;
    expect(child.starsBalance).toBe(60);
    expect((await db.select().from(starsLedger)).length).toBe(1);
  });

  it("rejects an unknown item", async () => {
    const { db } = handle;
    await seedChild(db, "child-shop-5", null);

    const result = purchaseShopItemForChild(db, "child-shop-5", "no-such-item");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Item tidak ditemukan.");
  });
});
