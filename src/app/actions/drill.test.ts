/**
 * Seam test for the getChildHomeData read model (the action's public shape):
 * the child object carries avatarEmoji — children.avatar resolved against
 * shop_items.emojiOrColor, defaulting to "😀" (the offline/UI stream renders
 * exactly this field name).
 */

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { children } from "../../db/schema";
import { makeDb, seedChild, seedShopItem } from "../../lib/server/test-db";

const mockDb = { current: null as ReturnType<typeof makeDb>["db"] | null };

vi.mock("./auth", () => ({
  getSession: async () => ({ sub: "child-av", role: "child" }),
}));
vi.mock("@/db/index", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/index")>()),
  getDb: () => mockDb.current,
}));

import { getChildHomeData } from "./drill";

describe("getChildHomeData avatarEmoji", () => {
  let handle: ReturnType<typeof makeDb>;

  beforeEach(async () => {
    handle = makeDb();
    mockDb.current = handle.db;
    await seedChild(handle.db, "child-av", { plan: "free", status: "active" });
  });

  afterEach(() => {
    handle.sqlite.close();
    mockDb.current = null;
  });

  it("resolves an avatar item's emoji", async () => {
    const { db } = handle;
    await seedShopItem(db, { id: "avatar-cat", priceStars: 40, emojiOrColor: { emoji: "🐱" } });
    await db.update(children).set({ avatar: "avatar-cat" }).where(eq(children.id, "child-av"));

    const data = await getChildHomeData();

    expect(data?.child.avatarEmoji).toBe("🐱");
    expect(data?.child.name).toBe("Budi");
  });

  it("falls back to 😀 for an avatar item without an emoji", async () => {
    const { db } = handle;
    await seedShopItem(db, { id: "avatar-color", priceStars: 40, emojiOrColor: { color: "#2563eb" } });
    await db.update(children).set({ avatar: "avatar-color" }).where(eq(children.id, "child-av"));

    const data = await getChildHomeData();

    expect(data?.child.avatarEmoji).toBe("😀");
  });

  it("falls back to 😀 when no avatar is equipped", async () => {
    const data = await getChildHomeData();

    expect(data?.child.avatarEmoji).toBe("😀");
  });
});
