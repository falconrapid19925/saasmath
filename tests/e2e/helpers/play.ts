/**
 * Browser-side interaction helpers for the e2e specs: the child PIN pad and
 * a universal "answer this generated item through the real input widgets"
 * routine. The item (including its answer key) comes from the app's own API
 * responses, captured off the wire, so the specs drill genuinely correct
 * answers through the keypad/choice buttons a child would tap.
 */

import { expect } from "@playwright/test";
import type { Page, Response } from "@playwright/test";

import { answersEqual, formatAnswer } from "../../../src/lib/engine/answers";
import type { Answer, Item } from "../../../src/lib/engine/types";

/** Tap a 6-digit PIN on the shared PinPad component (src/components/PinPad.tsx). */
export async function enterPin(page: Page, pin: string): Promise<void> {
  if (!/^\d{6}$/.test(pin)) throw new Error(`enterPin: not a 6-digit PIN: ${pin}`);
  for (const digit of pin) {
    await page.getByRole("button", { name: digit, exact: true }).click();
  }
}

/**
 * Run `action` and return the JSON body of the first matching response it
 * triggers. Used to capture the served task / placement ladder (with their
 * answer keys) exactly as the page received them.
 */
export async function captureResponseJson<T>(
  page: Page,
  urlPart: string,
  method: string,
  action: () => Promise<void>,
): Promise<T> {
  const responsePromise: Promise<Response> = page.waitForResponse(
    (response) => response.url().includes(urlPart) && response.request().method() === method,
  );
  const [, response] = await Promise.all([action(), responsePromise]);
  expect(response.status(), `${method} ${urlPart} failed`).toBe(200);
  return (await response.json()) as T;
}

/** Toggle the ± pad button for negative answers. */
async function toggleSign(page: Page): Promise<void> {
  await page.getByRole("button", { name: "±", exact: true }).click();
}

async function tapFractionPart(page: Page, part: "Pembilang" | "Penyebut", value: number): Promise<void> {
  await page.getByRole("button", { name: new RegExp(`^${part}`) }).click();
  await page.keyboard.type(String(Math.abs(value)));
}

/**
 * Answer one engine item through the UI the way a child would: choice items
 * are tapped, keyed items are typed on the on-screen/physical keypad and
 * committed with Enter (the input widget submits on Enter).
 */
export async function answerItem(page: Page, item: Item): Promise<void> {
  if (item.choices?.length) {
    const match = item.choices.find((choice) => answersEqual(choice as Answer, item.answer));
    if (!match) throw new Error(`answerItem: no choice matches the answer of ${item.id}`);
    await page.getByRole("button", { name: formatAnswer(match as Answer), exact: true }).click();
    return;
  }

  const answer = item.answer;
  switch (answer.kind) {
    case "integer": {
      if (answer.value < 0) await toggleSign(page);
      await page.keyboard.type(String(Math.abs(answer.value)));
      break;
    }
    case "moneyRupiah": {
      if (answer.value < 0) await toggleSign(page);
      await page.keyboard.type(String(Math.abs(answer.value)));
      break;
    }
    case "decimal": {
      const text = answer.value.toFixed(answer.places);
      const [intPart, fracPart] = text.split(".");
      if (answer.value < 0) await toggleSign(page);
      await page.keyboard.type(intPart.replace("-", ""));
      if (fracPart !== undefined) {
        await page.keyboard.press("."); // the pad maps "." to the decimal comma
        await page.keyboard.type(fracPart);
      }
      break;
    }
    case "fraction": {
      if (answer.n < 0) await toggleSign(page);
      await tapFractionPart(page, "Pembilang", answer.n);
      await tapFractionPart(page, "Penyebut", answer.d);
      break;
    }
    case "mixed": {
      if (answer.w < 0) await toggleSign(page);
      await page.keyboard.type(String(Math.abs(answer.w)));
      await tapFractionPart(page, "Pembilang", answer.n);
      await tapFractionPart(page, "Penyebut", answer.d);
      break;
    }
    case "unitValue": {
      await page.keyboard.type(String(Math.abs(answer.value)));
      await page.getByRole("button", { name: answer.unit, exact: true }).click();
      break;
    }
  }
  await page.keyboard.press("Enter");
}

/**
 * Answer a whole set/ladder item by item (all correct on first pass).
 * `perItemDelayMs` paces the answering: the server flags attempts under
 * 300ms/item as superhuman_speed and excludes them from the parent
 * dashboard (src/lib/server/implausibility.ts), so dashboard journeys must
 * answer at a humanly plausible pace.
 */
export async function answerAllItems(
  page: Page,
  items: Item[],
  options: { perItemDelayMs?: number } = {},
): Promise<void> {
  const { perItemDelayMs = 0 } = options;
  for (const item of items) {
    if (perItemDelayMs > 0) {
      await page.waitForTimeout(perItemDelayMs);
    }
    await answerItem(page, item);
  }
}

/**
 * Number of records currently in the browser's offline outbox (IndexedDB
 * store "pending" of the "saasmath-outbox" DB — the shape IdbOutboxStore
 * writes in src/lib/client/outbox.ts). Returns -1 when the page navigated
 * under the evaluation (the app hard-reloads after an offline router
 * refresh); expect.poll treats that as "not yet" and retries.
 */
export async function readOutboxCount(page: Page): Promise<number> {
  try {
    return await page.evaluate(
      () =>
        new Promise<number>((resolve, reject) => {
          const open = indexedDB.open("saasmath-outbox", 2);
          open.onerror = () => reject(open.error ?? new Error("indexedDB.open failed"));
          open.onsuccess = () => {
            const database = open.result;
            try {
              const tx = database.transaction("pending", "readonly");
              const getAll = tx.objectStore("pending").getAll();
              getAll.onsuccess = () => {
                database.close();
                resolve(getAll.result.length);
              };
              getAll.onerror = () => reject(getAll.error ?? new Error("getAll failed"));
            } catch (error) {
              reject(error instanceof Error ? error : new Error(String(error)));
            }
          };
        }),
    );
  } catch {
    return -1;
  }
}
