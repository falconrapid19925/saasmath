/**
 * PDF worksheet export with answer key (plan section 5: "PDF export of any
 * set with answer key, for parents who want Kumon-style paper practice").
 * Pure builder over pdf-lib; the route loads/regenerates the set and calls
 * this. Bahasa labels; answers rendered Indonesian-style (0,5 / Rp1.250).
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { formatInt } from "../engine/answers";

export type WorksheetItem = {
  index: number;
  prompt: string;
};

export type WorksheetData = {
  /** Sheet heading, e.g. the skill title in Bahasa. */
  title: string;
  /** Meta lines (child, step, seed, date) under the title. */
  metaLines: string[];
  items: WorksheetItem[];
  /** Answer-key lines, already formatted for display. */
  answerKey: { index: number; text: string }[];
  footer: string;
};

// A4 portrait, in pdf-lib points (72/inch).
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 56;
const BODY_SIZE = 11;
const LINE_HEIGHT = 18;
/** WinAnsi (Helvetica) covers Latin-1; anything else becomes '?'. */
const WINANSI_SAFE = /[\u0000-\u00ff]/;

function sanitizeWinAnsi(text: string): string {
  return [...text].map((ch) => (WINANSI_SAFE.test(ch) ? ch : "?")).join("");
}

function wrap(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Build the two-section worksheet PDF: numbered items with answer blanks,
 * then the answer key on a fresh page ("Kunci Jawaban").
 */
export async function buildWorksheetPdf(data: WorksheetData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const [font, bold] = await Promise.all([
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
  ]);

  const ink = rgb(0.1, 0.1, 0.12);
  const subtle = rgb(0.45, 0.45, 0.5);
  const accent = rgb(0.13, 0.4, 0.85);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const drawText = (
    text: string,
    opts: { size?: number; bold?: boolean; color?: typeof ink } = {},
  ) => {
    const size = opts.size ?? BODY_SIZE;
    page.drawText(sanitizeWinAnsi(text), {
      x: MARGIN,
      y,
      size,
      font: opts.bold ? bold : font,
      color: opts.color ?? ink,
    });
  };

  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  };

  const ensureRoom = (needed: number) => {
    if (y - needed < MARGIN) newPage();
  };

  // --- Header -------------------------------------------------------------
  drawText("SaasMath — Lembar Latihan", { size: 9, color: subtle });
  y -= 22;
  drawText(data.title, { size: 16, bold: true, color: accent });
  y -= 20;
  for (const metaLine of data.metaLines) {
    drawText(metaLine, { size: 9, color: subtle });
    y -= 14;
  }
  y -= 8;

  // --- Items --------------------------------------------------------------
  const maxChars = Math.floor((PAGE_W - 2 * MARGIN) / (BODY_SIZE * 0.5));
  data.items.forEach((item) => {
    const lines = wrap(item.prompt, maxChars);
    ensureRoom(LINE_HEIGHT * (lines.length + 1));
    for (const line of lines) {
      drawText(`${formatInt(item.index)}. ${line}`);
      y -= LINE_HEIGHT;
    }
    drawText("Jawaban: ..............................", { color: subtle });
    y -= LINE_HEIGHT + 4;
  });

  // --- Answer key ----------------------------------------------------------
  newPage();
  drawText("Kunci Jawaban", { size: 14, bold: true, color: accent });
  y -= 22;
  const keyPerLine = 3;
  for (let i = 0; i < data.answerKey.length; i += keyPerLine) {
    ensureRoom(LINE_HEIGHT);
    const chunk = data.answerKey
      .slice(i, i + keyPerLine)
      .map((k) => `${formatInt(k.index)}) ${k.text}`)
      .join("        ");
    drawText(chunk);
    y -= LINE_HEIGHT;
  }

  // --- Footer on every page ------------------------------------------------
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText(sanitizeWinAnsi(`${data.footer}  •  hlm. ${i + 1}/${pages.length}`), {
      x: MARGIN,
      y: MARGIN - 24,
      size: 8,
      font,
      color: subtle,
    });
  });

  return doc.save();
}
