import { describe, expect, it } from "vitest";

import { PDFDocument } from "pdf-lib";
import { int } from "../engine/answers";
import type { Item } from "../engine/types";

import { buildWorksheetPdf } from "./pdf";

const items: Item[] = Array.from({ length: 30 }, (_, i) => ({
  id: `item-${i}`,
  prompt: `Berapa hasil dari ${i + 1} x ${i + 2} ?`,
  answer: int((i + 1) * (i + 2)),
  answerType: "integer",
}));

describe("buildWorksheetPdf (plan section 5: PDF export with answer key)", () => {
  it("produces a valid multi-page PDF document", async () => {
    const pdf = await buildWorksheetPdf({
      title: "Latihan: Perkalian 2 digit x 1 digit",
      metaLines: [
        "Anak: Budi",
        "Keterampilan: k4-mult-2x1 • Langkah 1",
        "Seed: 12345 • 4 Okt 2026",
      ],
      items: items.map((item, i) => ({ index: i + 1, prompt: item.prompt })),
      answerKey: items.map((item, i) => ({
        index: i + 1,
        text: String((i + 1) * (i + 2)),
      })),
      footer: "SaasMath — latihan harian",
    });

    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(pdf.byteLength).toBeGreaterThan(1000);
    // PDF magic header.
    const header = String.fromCharCode(...pdf.slice(0, 5));
    expect(header).toBe("%PDF-");
    // 30 items + blanks must spill onto more than one page (pdf-lib
    // compresses object streams, so count pages by reloading).
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBeGreaterThan(2);
  });

  it("sanitizes characters outside WinAnsi so pdf-lib cannot throw", async () => {
    const pdf = await buildWorksheetPdf({
      title: "Latihan: pecahan ○○ garis bilangan — テスト",
      metaLines: [],
      items: [{ index: 1, prompt: "Isilah: 1/2 + 1/2 = …" }],
      answerKey: [{ index: 1, text: "1" }],
      footer: "SaasMath",
    });
    expect(pdf.byteLength).toBeGreaterThan(500);
  });
});
