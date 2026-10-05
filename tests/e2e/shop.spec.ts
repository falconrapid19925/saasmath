/**
 * E2E journey 4 (shop): a child spends stars — buy then equip an avatar, the
 * balance is enforced (items beyond the wallet are not purchasable), and the
 * stars_ledger reconciles with children.stars_balance after every step.
 */

import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { createChild, installSession, registerParent } from "./helpers/api";
import {
  equippedItemId,
  inventoryItemIds,
  seedStars,
  starsBalance,
  starsLedgerEntries,
  starsLedgerSum,
} from "./helpers/db";

/** One shop card (emoji + name + kind + price/equip button). */
function shopCard(page: Page, itemName: string): Locator {
  return page.locator("div.rounded-2xl").filter({ hasText: itemName });
}

test("shop: buy and equip with balance enforcement, ledger reconciles", async ({ page }) => {
  const label = "shop";
  const context = page.context();
  await registerParent(context, label);
  const child = await createChild(context, label, 4);
  await installSession(context, { sub: child.id, role: "child" });

  // Starting wallet (seeded the same way the demo seed does: ledger + balance).
  seedStars(child.id, 100);

  await page.goto("/anak/toko");
  await expect(page.getByText("Bintangmu: ⭐ 100")).toBeVisible();

  // 1. Buy an affordable item (Avatar Kelinci, 30 ⭐).
  const kelinci = shopCard(page, "Avatar Kelinci");
  await expect(kelinci.getByRole("button", { name: "⭐ 30" })).toBeEnabled();
  await kelinci.getByRole("button", { name: "⭐ 30" }).click();
  await expect(page.getByText("Yeay! Avatar Kelinci sudah jadi milikmu 🎉")).toBeVisible();
  await expect(page.getByText("Bintangmu: ⭐ 70")).toBeVisible();

  // Server state: wallet decremented once, inventory row written.
  expect(starsBalance(child.id)).toBe(70);
  expect(inventoryItemIds(child.id)).toContain("avatar-kelinci");

  // 2. Balance enforcement: anything beyond 70 ⭐ cannot be bought.
  const naga = shopCard(page, "Avatar Naga"); // 150 ⭐
  await expect(naga.getByRole("button", { name: "⭐ 150" })).toBeDisabled();

  // 3. Equip the new avatar.
  await kelinci.getByRole("button", { name: "Pakai", exact: true }).click();
  await expect(page.getByText("Avatar Kelinci sekarang dipakai!")).toBeVisible();
  await expect(kelinci.getByRole("button", { name: "Dipakai ✓" })).toBeVisible();
  expect(equippedItemId(child.id)).toBe("avatar-kelinci");

  // 4. Ledger reconciliation: sum(delta) === balance, with the expected entries
  //    (sorted by delta: entry ordering mixes the helper's seed write with the
  //    server's purchase write, so the assertion is order-independent).
  expect(starsLedgerSum(child.id)).toBe(starsBalance(child.id));
  const ledger = starsLedgerEntries(child.id).sort((a, b) => a.delta - b.delta);
  expect(ledger).toEqual([
    { delta: -30, reason: "shop_purchase" },
    { delta: 100, reason: "seed_bonus" },
  ]);

  // 5. Reloading the shop re-derives everything from the server state.
  await page.reload();
  await expect(page.getByText("Bintangmu: ⭐ 70")).toBeVisible();
  const reloaded = shopCard(page, "Avatar Kelinci");
  await expect(reloaded.getByRole("button", { name: "Dipakai ✓" })).toBeVisible();
  await expect(shopCard(page, "Avatar Naga").getByRole("button", { name: "⭐ 150" })).toBeDisabled();
});
