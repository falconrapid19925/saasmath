/**
 * E2E journey 1 (the audited core loop): parent registers, adds a child with
 * a PIN, the child signs in with name + PIN, takes the placement diagnostic,
 * plays a drill set — and the attempt, streak and stars are then visible on
 * the parent dashboard. Everything runs against the production build and the
 * real API, with the served task / placement ladder captured off the wire so
 * the child answers genuinely correct solutions.
 *
 * Transport note: the auth FORMS run for real (each submit's API response is
 * asserted `{ ok: true }`), but the server's Secure session cookie is not
 * kept by a plain-HTTP browser context, so after every successful auth
 * response the session is installed directly (the same signed token the
 * server would set — see helpers/api.ts installSession).
 */

import { expect, test } from "@playwright/test";
import type { Page, Response } from "@playwright/test";

import { installSession, uniqueId } from "./helpers/api";
import type { ParentAccount } from "./helpers/api";
import type { PlacementDiagnostic, ServedTask } from "./helpers/api";
import { getChildByName, getParentByEmail, starsLedgerSum } from "./helpers/db";
import { answerAllItems, captureResponseJson, enterPin } from "./helpers/play";

test.setTimeout(240_000);

test("parent register → child + PIN → child login → placement → drill → parent dashboard", async ({
  page,
}) => {
  const label = uniqueId("journey");
  const childPin = "246813";
  const childName = `Anak ${label.slice(-8)}`;

  // 1. Parent sign-up through the "Daftar" form.
  await page.goto("/orangtua/daftar");
  await page.getByLabel("Nama orang tua").fill(`Orang Tua ${label}`);
  const parent: ParentAccount = {
    email: `${label}@test.example`,
    password: "rahasia-123",
    id: "",
  };
  await page.getByLabel("Email").fill(parent.email);
  await page.getByLabel("Kata sandi (minimal 8 karakter)").fill(parent.password);
  await submitAuthForm(page, "/api/auth/register", "Daftar");
  parent.id = getParentByEmail(parent.email).id;
  await installSession(page.context(), { sub: parent.id, role: "parent" });
  await page.goto("/orangtua");
  await expect(page.getByRole("heading", { name: "Dashboard Orang Tua" })).toBeVisible();

  // 2. Add a child profile: PIN pad first, then name + grade.
  await page.getByRole("link", { name: "+ Tambah anak" }).click();
  await page.waitForURL("**/orangtua/anak-baru");
  await enterPin(page, childPin);
  await page.getByLabel("Nama anak").fill(childName);
  await page.getByRole("button", { name: "Kelas 4", exact: true }).click();
  await page.getByRole("button", { name: "Simpan profil anak" }).click();
  // The createChild action's own Set-Cookie (child session) replaces the
  // browser-stored cookie but is never SENT over http — reinstall the parent
  // session before navigating on.
  await expect.poll(
    () => {
      try {
        return getChildByName(childName).id;
      } catch {
        return "";
      }
    },
    { message: "child profile created" },
  ).not.toBe("");
  await installSession(page.context(), { sub: parent.id, role: "parent" });
  await page.goto("/orangtua");
  await expect(profileListItem(page, childName)).toBeVisible();

  // 3. Child sign-in with name + PIN on the family device.
  await page.request.post("/api/auth/logout");
  await page.goto("/masuk");
  await page.getByLabel("Siapa namamu?").fill(childName);
  await enterPin(page, childPin);
  await submitAuthForm(page, "/api/auth/child-login", "Masuk dan mulai latihan");
  await installSession(page.context(), {
    sub: getChildByName(childName).id,
    role: "child",
  });
  await page.goto("/anak");

  // 4. Placement diagnostic (20 items), answered correctly through the UI.
  await expect(page.getByRole("link", { name: /Kenalan dulu yuk/ })).toBeVisible();
  const placement = await captureResponseJson<PlacementDiagnostic>(
    page,
    "/api/placement",
    "GET",
    () => page.getByRole("link", { name: /Kenalan dulu yuk/ }).click(),
  );
  expect(placement.items).toHaveLength(placement.totalItems);
  await page.waitForURL("**/anak/penempatan");
  await answerAllItems(page, placement.items);
  await expect(page.getByText("Titik mulaimu sudah siap!")).toBeVisible();
  await page.getByRole("button", { name: "Mulai petualangan matematika" }).click();
  await page.waitForURL("**/anak");

  // 5. Drill: load today's set from the home CTA and play it correctly.
  await expect(page.getByRole("link", { name: /Mulai sekarang/ })).toBeVisible();
  const task = await captureResponseJson<ServedTask>(page, "/api/session/next", "POST", () =>
    page.getByRole("link", { name: /Mulai sekarang/ }).click(),
  );
  expect(task.items.length).toBeGreaterThan(0);
  await page.waitForURL("**/anak/latihan");
  // Paced answering: a sub-300ms/item set is flagged superhuman_speed and
  // excluded from the parent dashboard — the dashboard assertions below need
  // a plausible attempt.
  await answerAllItems(page, task.items, { perItemDelayMs: 500 });

  // The outbox flush POSTs /api/sync; the result note flips to synced.
  await expect(page.getByText("Set selesai")).toBeVisible();
  await expect(page.getByText("Hasil sudah tersinkron ✓")).toBeVisible({ timeout: 15_000 });

  // 6. Child home reflects the attempt: stars earned, streak day 1, ledger.
  await page.getByRole("button", { name: "Kembali ke beranda" }).click();
  await page.waitForURL("**/anak");
  await expect(page.getByText(`Hai, ${childName}!`)).toBeVisible();
  await expect(page.getByText(/🔥 1 hari/)).toBeVisible();
  const childRow = getChildByName(childName);
  expect(childRow.stars_balance).toBeGreaterThan(0);
  expect(starsLedgerSum(childRow.id)).toBe(childRow.stars_balance);

  // 7. Parent dashboard shows the attempt, the streak and the stars.
  await page.request.post("/api/auth/logout");
  await page.goto("/orangtua/masuk");
  await page.getByLabel("Email").fill(parent.email);
  await page.getByLabel("Kata sandi").fill(parent.password);
  await submitAuthForm(page, "/api/auth/login", "Masuk");
  await installSession(page.context(), { sub: parent.id, role: "parent" });
  await page.goto("/orangtua");
  await expect(page.getByRole("heading", { name: "Dashboard Orang Tua" })).toBeVisible();
  await expect(profileListItem(page, childName)).toBeVisible();

  const childSection = page
    .locator("section")
    .filter({ hasText: childName })
    .filter({ hasText: "Kalender bintang" });
  const setStat = childSection.locator("div.rounded-xl").filter({ hasText: "Set minggu ini" });
  await expect(setStat).toHaveText(/^[1-9]/); // at least one set this week
  const streakStat = childSection.locator("div.rounded-xl").filter({ hasText: "Streak" });
  await expect(streakStat).toHaveText(/🔥 1 /);
  // Star calendar: the completed day carries a ⭐.
  await expect(childSection.getByText("⭐").first()).toBeVisible();
});

// --- journey-only helpers ----------------------------------------------------

/** The child's chip in the dashboard's "Profil anak" list (unique per section). */
function profileListItem(page: Page, childName: string) {
  return page
    .locator("section")
    .filter({ hasText: "Profil anak" })
    .getByRole("listitem")
    .filter({ hasText: childName });
}

/** Click an auth form button; the form only reports success on `{ ok: true }`. */
async function submitAuthForm(page: Page, urlPart: string, buttonName: string): Promise<void> {
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate: Response) =>
        candidate.url().includes(urlPart) && candidate.request().method() === "POST",
    ),
    page.getByRole("button", { name: buttonName, exact: true }).click(),
  ]);
  const body = (await response.json()) as { ok?: boolean; error?: string };
  expect(body.ok, body.error ?? "auth form failed").toBe(true);
}
