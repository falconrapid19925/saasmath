/**
 * Per-family item verifiers used by the engine property tests. Each verifier
 * re-derives the expected answer from the item's OWN prompt (and hint payload
 * where prompts are story text) and compares it with item.answer via
 * answersEqual — so a wrong answer key, a mismatched prompt, or a hint that
 * contradicts the answer all fail the test.
 */

import {
  answerValue,
  answersEqual,
  divisorCount,
  gcd,
  lcm,
} from "../../src/lib/engine/answers";
import type { Answer, HintModel, Item } from "../../src/lib/engine/types";
import { normalizeHint } from "../../src/lib/client/hints";

const HINT_MODELS: readonly HintModel[] = [
  "part-whole",
  "comparison",
  "fraction-bar",
  "number-line",
  "base-ten",
];

const NUM = String.raw`(\d{1,3}(?:\.\d{3})*)`;
const DEC = String.raw`(\d+,\d+)`;
const FR = String.raw`(\d+)/(\d+)`;

function pInt(s: string): number {
  return Number(s.replace(/\./g, ""));
}

/** "1,37" -> 137 hundredths. */
function pDecHundredths(s: string): number {
  const [whole, fracPart = ""] = s.split(",");
  return pInt(whole as string) * 100 + Number((fracPart + "00").slice(0, 2));
}

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(`verifyItem: ${message}`);
}

// ---------------------------------------------------------------------------
// generic hint checks
// ---------------------------------------------------------------------------

function checkHint(item: Item): void {
  if (!item.hint) return;
  expect(HINT_MODELS.includes(item.hint.model), `hint model "${item.hint.model}" not one of the five`);
  const payload = item.hint.payload as Record<string, unknown>;
  walkFinite(payload);

  // Runtime acceptance gate: every engine hint must pass the client
  // normalizer (src/lib/client/hints.ts) — payloads it rejects render the
  // "belum tersedia" fallback and the CPA layer is dead.
  expect(
    normalizeHint(item.hint.model, payload) !== null,
    `hint payload rejected by the client normalizer (${JSON.stringify(payload)})`,
  );

  const answerValueOf = (a: Answer): number => answerValue(a);

  if (payload.kind === "part-whole") {
    const total = payload.total as number | null;
    const parts = payload.parts as (number | null)[];
    const nulls = (total === null ? 1 : 0) + parts.filter((x) => x === null).length;
    expect(nulls === 1, "part-whole hint must have exactly one unknown");
    const knownSum = parts.reduce<number>((acc, x) => acc + (x ?? 0), 0);
    if (total === null) {
      expect(Math.abs(answerValueOf(item.answer) - knownSum) < 1e-9, "part-whole total != sum(parts)");
    } else {
      expect(Math.abs(answerValueOf(item.answer) - (total - knownSum)) < 1e-9, "part-whole part != total - sum");
    }
  }

  if (payload.kind === "base-ten") {
    expect(payload.variant === "blocks", `base-ten variant "${String(payload.variant)}" is not renderable by the client`);
    const counts = [payload.thousands, payload.hundreds, payload.tens, payload.ones] as number[];
    expect(
      counts.every((c) => Number.isInteger(c) && c >= 0 && c <= 9),
      "base-ten blocks counts out of range",
    );
    const value = counts[0]! * 1000 + counts[1]! * 100 + counts[2]! * 10 + counts[3]!;
    expect(value !== answerValueOf(item.answer), "base-ten blocks visualize the answer");
  }

  if (payload.kind === "fraction-bar") {
    const wholes = payload.wholes as number;
    const partsPerWhole = payload.partsPerWhole as number;
    const shadedParts = payload.shadedParts as number | null;
    expect(wholes >= 1 && wholes <= 4, "fraction-bar wholes out of range");
    expect(partsPerWhole >= 1 && partsPerWhole <= 12, "fraction-bar partsPerWhole out of range");
    if (shadedParts !== null) {
      expect(
        shadedParts >= 0 && shadedParts <= wholes * partsPerWhole,
        "fraction-bar shading out of range",
      );
    }
  }

  if (payload.kind === "number-line") {
    const max = payload.max as number;
    const min = payload.min as number;
    const stepValue = payload.stepValue as number;
    const marks = payload.marks as (number | null)[];
    expect(max >= min, "number-line max < min");
    expect(
      marks.every((m) => m === null || (m >= min && m <= max)),
      "number-line marks outside [min, max]",
    );
    expect(stepValue > 0, "number-line stepValue must be positive");
    const ticks = Math.round((max - min) / stepValue);
    expect(ticks >= 2 && ticks <= 40, `number-line tick count ${ticks} outside 2..40`);
  }
}

function walkFinite(value: unknown): void {
  if (typeof value === "number") {
    expect(Number.isFinite(value), "non-finite number in hint payload");
  } else if (Array.isArray(value)) {
    value.forEach(walkFinite);
  } else if (value !== null && typeof value === "object") {
    Object.values(value).forEach(walkFinite);
  }
}

function checkShape(item: Item): void {
  expect(typeof item.prompt === "string" && item.prompt.length > 0, "empty prompt");
  checkAnswerShape(item.answer);
  expect(item.answerType === item.answer.kind, "answerType != answer.kind");
  if (item.choices) {
    expect(item.choices.length >= 2, "too few choices");
    const keys = item.choices.map((c) => stableKey(c));
    expect(new Set(keys).size === keys.length, "duplicate choices");
    expect(
      item.choices.some((c) => answersEqual(c, item.answer)),
      "choices do not contain the answer",
    );
  }
  checkHint(item);
}

function stableKey(a: Answer): string {
  if (a.kind === "unitValue") return `unit:${a.value}:${a.unit}`;
  return `num:${answerValue(a)}`;
}

function checkAnswerShape(a: Answer): void {
  switch (a.kind) {
    case "integer":
      expect(Number.isInteger(a.value), "integer answer not integer");
      break;
    case "decimal":
      expect(a.places === 1 || a.places === 2, "decimal places not 1 or 2");
      expect(Number.isFinite(a.value), "decimal value not finite");
      break;
    case "fraction":
      expect(a.d > 0, "fraction denominator not positive");
      expect(Number.isInteger(a.n) && Number.isInteger(a.d), "fraction not integers");
      break;
    case "mixed":
      expect(a.d > 0 && a.n >= 0, "mixed number field rules violated");
      break;
    case "moneyRupiah":
      expect(Number.isInteger(a.value) && a.value >= 0, "money not whole non-negative rupiah");
      break;
    case "unitValue":
      expect(typeof a.unit === "string" && a.unit.length > 0, "unitValue unit empty");
      break;
  }
}

function eq(given: Answer, expectedValue: number): boolean {
  return Math.abs(answerValue(given) - expectedValue) < 1e-9;
}

// ---------------------------------------------------------------------------
// per-family verifiers
// ---------------------------------------------------------------------------

const PLANE_SHAPES: Record<string, number> = {
  "segi tiga": 3,
  "segi empat": 4,
  "segi lima": 5,
  "segi enam": 6,
  "segi delapan": 8,
};

/** Regular polygons served by the kelilingPolygon measurement kind. */
const REGULAR_POLYGON_SIDES: Record<string, number> = {
  "segi lima": 5,
  "segi enam": 6,
  "segi delapan": 8,
};

const ANGLE_FACTS: Record<string, number> = { "siku-siku": 90, lurus: 180, penuh: 360 };

const CONVERT_FACTORS: Record<string, number> = {
  m: 100, // m -> cm
  cm: 1 / 100, // cm -> m
  mm: 1 / 10,
  kg: 1000,
  g: 1 / 1000, // g -> kg (whole kilograms only)
  jam: 60,
  menit: 1 / 60,
};

type Verifier = (item: Item) => void;

const VERIFY: Record<string, Verifier> = {
  addsub(item) {
    const m = new RegExp(`^${NUM} ([+-]) ${NUM} = \\.\\.\\.$`).exec(item.prompt);
    if (m) {
      const a = pInt(m[1] as string);
      const b = pInt(m[3] as string);
      const expected = m[2] === "+" ? a + b : a - b;
      expect(item.answer.kind === "integer" && item.answer.value === expected, `addsub math ${a}${m[2]}${b}`);
      return;
    }
    // Operand form: exactly one operand is the unknown ("...").
    const missFirst = new RegExp(`^\\.\\.\\. ([+-]) ${NUM} = ${NUM}$`).exec(item.prompt);
    if (missFirst) {
      const b = pInt(missFirst[2] as string);
      const c = pInt(missFirst[3] as string);
      const expected = missFirst[1] === "+" ? c - b : c + b;
      expect(expected >= 0, "addsub operand-form answer negative");
      expect(
        item.answer.kind === "integer" && item.answer.value === expected,
        `addsub math ... ${missFirst[1]} ${b} = ${c}`,
      );
      return;
    }
    const missSecond = new RegExp(`^${NUM} ([+-]) \\.\\.\\. = ${NUM}$`).exec(item.prompt);
    expect(missSecond !== null, "addsub prompt format");
    if (!missSecond) return;
    const a = pInt(missSecond[1] as string);
    const c = pInt(missSecond[3] as string);
    const expected = missSecond[2] === "+" ? c - a : a - c;
    expect(expected >= 0, "addsub operand-form answer negative");
    expect(
      item.answer.kind === "integer" && item.answer.value === expected,
      `addsub math ${a} ${missSecond[2]} ... = ${c}`,
    );
  },

  mult(item) {
    const m = new RegExp(`^${NUM} × ${NUM} = \\.\\.\\.$`).exec(item.prompt);
    if (m) {
      expect(
        item.answer.kind === "integer" && item.answer.value === pInt(m[1] as string) * pInt(m[2] as string),
        "mult math",
      );
      return;
    }
    // Missing-factor form: exactly one factor is the unknown ("...").
    const missFirst = new RegExp(`^\\.\\.\\. × ${NUM} = ${NUM}$`).exec(item.prompt);
    if (missFirst) {
      const b = pInt(missFirst[1] as string);
      const c = pInt(missFirst[2] as string);
      expect(c % b === 0, "mult missing-factor item not exact");
      expect(
        item.answer.kind === "integer" && item.answer.value === c / b,
        `mult math ... x ${b} = ${c}`,
      );
      return;
    }
    const missSecond = new RegExp(`^${NUM} × \\.\\.\\. = ${NUM}$`).exec(item.prompt);
    expect(missSecond !== null, "mult prompt format");
    if (!missSecond) return;
    const a = pInt(missSecond[1] as string);
    const c = pInt(missSecond[2] as string);
    expect(c % a === 0, "mult missing-factor item not exact");
    expect(
      item.answer.kind === "integer" && item.answer.value === c / a,
      `mult math ${a} x ... = ${c}`,
    );
  },

  div(item) {
    const exact = new RegExp(`^${NUM} : ${NUM} = \\.\\.\\.$`).exec(item.prompt);
    const sisa = new RegExp(`^Sisa dari ${NUM} : ${NUM} adalah \\.\\.\\.$`).exec(item.prompt);
    if (exact) {
      const a = pInt(exact[1] as string);
      const b = pInt(exact[2] as string);
      expect(a % b === 0, "div quotient item not exact");
      expect(item.answer.kind === "integer" && item.answer.value === a / b, "div quotient math");
      return;
    }
    expect(sisa !== null, "div prompt format");
    if (!sisa) return;
    const a = pInt(sisa[1] as string);
    const b = pInt(sisa[2] as string);
    expect(a % b !== 0, "div remainder item has no remainder");
    expect(item.answer.kind === "integer" && item.answer.value === a % b, "div remainder math");
  },

  placevalue(item) {
    let m = new RegExp(`^Berapa nilai angka (\\d) pada bilangan ${NUM}\\?$`).exec(item.prompt);
    if (m) {
      const digit = Number(m[1]);
      const n = pInt(m[2] as string);
      const digits = String(n).split("").map(Number).reverse();
      const positions = digits
        .map((d, p) => ({ d, p }))
        .filter(({ d }) => d === digit);
      expect(positions.length === 1, "digitValue digit appears more than once");
      const pos = (positions[0] as { d: number; p: number }).p;
      expect(item.answer.kind === "integer" && item.answer.value === digit * 10 ** pos, "digitValue math");
      return;
    }
    m = new RegExp(`^(?:${NUM})(?: \\+ (?:${NUM}))* = \\.\\.\\.$`).exec(item.prompt);
    if (m && !item.prompt.startsWith("Manakah") && !item.prompt.startsWith("Lengkapi")) {
      const parts = item.prompt.replace(" = ...", "").split(" + ").map(pInt);
      expect(parts.length >= 2, "compose needs >= 2 parts");
      expect(item.answer.kind === "integer" && item.answer.value === parts.reduce((x, y) => x + y, 0), "compose math");
      return;
    }
    m = new RegExp(`^Manakah bilangan yang lebih (besar|kecil): ${NUM} atau ${NUM}\\?$`).exec(item.prompt);
    if (m) {
      const a = pInt(m[2] as string);
      const b = pInt(m[3] as string);
      const expected = m[1] === "besar" ? Math.max(a, b) : Math.min(a, b);
      expect(item.answer.kind === "integer" && item.answer.value === expected, "compare math");
      expect(item.choices !== undefined && item.choices.length === 2, "compare choices");
      return;
    }
    m = new RegExp(`^Membulatkan ${NUM} ke ${NUM} terdekat adalah \\.\\.\\.$`).exec(item.prompt);
    if (m) {
      const n = pInt(m[1] as string);
      const roundTo = pInt(m[2] as string);
      expect(n % roundTo !== 0, "round drawn number is already a multiple");
      expect(
        item.answer.kind === "integer" && item.answer.value === Math.round(n / roundTo) * roundTo,
        "round math",
      );
      return;
    }
    m = new RegExp(`^Lengkapi urutan: ${NUM}, \\.\\.\\., ${NUM}\\.$`).exec(item.prompt);
    expect(m !== null, "placevalue prompt format");
    if (!m) return;
    const a = pInt(m[1] as string);
    const c = pInt(m[2] as string);
    const step = (c - a) / 2;
    expect(Number.isInteger(step) && step > 0, "order sequence step");
    expect(item.answer.kind === "integer" && item.answer.value === a + step, "order math");
  },

  factorsmultiples(item) {
    let m = /^Kelipatan ke-(\d+) dari (\d+) adalah \.\.\.$/.exec(item.prompt);
    if (m) {
      expect(item.answer.kind === "integer" && item.answer.value === Number(m[1]) * Number(m[2]), "kelipatan math");
      return;
    }
    m = /^Kelipatan berikutnya dari (\d+), (\d+), (\d+), \.\.\. adalah \.\.\.$/.exec(item.prompt);
    if (m) {
      const t1 = Number(m[1]);
      const t2 = Number(m[2]);
      const t3 = Number(m[3]);
      const s = t2 - t1;
      expect(s > 0 && t3 === t1 + 2 * s, "kelipatanSeq arithmetic");
      expect(item.answer.kind === "integer" && item.answer.value === t3 + s, "kelipatanSeq math");
      return;
    }
    m = /^Berapa banyak faktor dari (\d+)\?$/.exec(item.prompt);
    if (m) {
      expect(item.answer.kind === "integer" && item.answer.value === divisorCount(Number(m[1])), "faktor math");
      return;
    }
    m = /^KPK dari (\d+) dan (\d+) adalah \.\.\.$/.exec(item.prompt);
    if (m) {
      expect(item.answer.kind === "integer" && item.answer.value === lcm(Number(m[1]), Number(m[2])), "kpk math");
      return;
    }
    m = /^FPB dari (\d+) dan (\d+) adalah \.\.\.$/.exec(item.prompt);
    if (m) {
      expect(
        item.answer.kind === "integer" && item.answer.value === gcd(Number(m[1]), Number(m[2])),
        "fpb math",
      );
      return;
    }
    // Geometric pattern: ascending multiplies the ratio, descending divides.
    m = new RegExp(`^Suku berikutnya dari ${NUM}, ${NUM}, ${NUM}, \\.\\.\\. adalah \\.\\.\\.$`).exec(item.prompt);
    expect(m !== null, "factorsmultiples prompt format");
    if (!m) return;
    const t1 = pInt(m[1] as string);
    const t2 = pInt(m[2] as string);
    const t3 = pInt(m[3] as string);
    if (t1 < t3) {
      expect(t2 * t2 === t1 * t3, "patternX not geometric");
      const r = t2 / t1;
      expect(Number.isInteger(r) && r >= 2, "patternX ratio");
      expect(item.answer.kind === "integer" && item.answer.value === t3 * r, "patternX math");
      return;
    }
    expect(t1 > t3 && t1 * t3 === t2 * t2, "patternDiv not geometric");
    const rDiv = t1 / t2;
    expect(Number.isInteger(rDiv) && rDiv >= 2, "patternDiv ratio");
    expect(t3 % rDiv === 0, "patternDiv terms not divisible");
    expect(item.answer.kind === "integer" && item.answer.value === t3 / rDiv, "patternDiv math");
  },

  fractions(item) {
    let m = new RegExp(`^${FR} ([+-]) ${FR} = \\.\\.\\.$`).exec(item.prompt);
    if (m) {
      const [n1, d1, n2, d2] = [Number(m[1]), Number(m[2]), Number(m[4]), Number(m[5])];
      const num = m[3] === "+" ? n1 * d2 + n2 * d1 : n1 * d2 - n2 * d1;
      const den = d1 * d2;
      expect(eq(item.answer, num / den) && num >= 0, "fraction add/sub math");
      return;
    }
    m = new RegExp(`^${FR} ([×:]) (\\d+) = \\.\\.\\.$`).exec(item.prompt);
    if (m) {
      const n = Number(m[1]);
      const d = Number(m[2]);
      const op = m[3];
      const k = Number(m[4]);
      const expected = op === "×" ? (n * k) / d : n / (d * k);
      expect(eq(item.answer, expected), "fraction mult/div whole math");
      return;
    }
    m = new RegExp(`^Manakah pecahan yang lebih (besar|kecil): ${FR} atau ${FR}\\?$`).exec(item.prompt);
    if (m) {
      const f1 = { n: Number(m[2]), d: Number(m[3]) };
      const f2 = { n: Number(m[4]), d: Number(m[5]) };
      expect(f1.n * f2.d !== f2.n * f1.d, "compare fractions equal");
      const firstBigger = f1.n * f2.d > f2.n * f1.d;
      const want = m[1] === "besar" ? firstBigger : !firstBigger;
      expect(eq(item.answer, (want ? f1 : f2).n / (want ? f1 : f2).d), "compare fraction answer");
      expect(item.choices !== undefined && item.choices.length === 2, "compare fraction choices");
      return;
    }
    m = new RegExp(`^Isi kotak: ${FR} = \\.\\.\\./(\\d+)$`).exec(item.prompt);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      const D = Number(m[3]);
      expect(D % b === 0, "equivalent target denominator not multiple");
      expect(
        item.answer.kind === "fraction" && item.answer.d === D && item.answer.n === (a * D) / b,
        "equivalent math",
      );
      return;
    }
    m = new RegExp(`^Sederhanakan pecahan: ${FR}\\.$`).exec(item.prompt);
    expect(m !== null, "fractions prompt format");
    if (!m) return;
    const n = Number(m[1]);
    const d = Number(m[2]);
    expect(gcd(n, d) > 1, "simplify input already reduced");
    expect(
      item.answer.kind === "fraction" && gcd(item.answer.n, item.answer.d) === 1 && eq(item.answer, n / d),
      "simplify math",
    );
  },

  decimals(item) {
    let m = new RegExp(`^${DEC} ([+-]) ${DEC} = \\.\\.\\.$`).exec(item.prompt);
    if (m) {
      const h1 = pDecHundredths(m[1] as string);
      const h2 = pDecHundredths(m[3] as string);
      const expectedH = m[2] === "+" ? h1 + h2 : h1 - h2;
      expect(
        item.answer.kind === "decimal" &&
          item.answer.places <= 2 &&
          eq(item.answer, expectedH / 100) &&
          expectedH >= 0,
        "decimals add/sub math",
      );
      return;
    }
    m = new RegExp(`^Manakah yang lebih (besar|kecil): ${DEC} atau ${DEC}\\?$`).exec(item.prompt);
    if (m) {
      const h1 = pDecHundredths(m[2] as string);
      const h2 = pDecHundredths(m[3] as string);
      expect(h1 !== h2, "compare decimals equal");
      const firstBigger = h1 > h2;
      const wantFirst = (m[1] === "besar") === firstBigger;
      const expected = (wantFirst ? h1 : h2) / 100;
      expect(eq(item.answer, expected), "decimals compare math");
      return;
    }
    m = new RegExp(`^Lengkapi urutan: ${DEC}; ${DEC}; \\.\\.\\.; ${DEC}\\.$`).exec(item.prompt);
    if (m) {
      const t1 = pDecHundredths(m[1] as string);
      const t2 = pDecHundredths(m[2] as string);
      const t4 = pDecHundredths(m[3] as string);
      const s = t2 - t1;
      expect(s > 0 && t4 === t1 + 3 * s, "decimal sequence arithmetic");
      expect(eq(item.answer, (t1 + 2 * s) / 100), "decimal sequence math");
      return;
    }
    m = /^Tulis (\d+)\/(10|100) sebagai bilangan desimal\.$/.exec(item.prompt);
    if (m) {
      const n = Number(m[1]);
      const den = Number(m[2]);
      expect(eq(item.answer, n / den), "fraction-to-decimal math");
      expect(item.answer.kind === "decimal" && item.answer.places === (den === 10 ? 1 : 2), "fromFraction places");
      return;
    }
    m = /^Berapa nilai tempat angka (\d) pada bilangan (\d),(\d)(\d)\?$/.exec(item.prompt);
    expect(m !== null, "decimals prompt format");
    if (!m) return;
    const digit = Number(m[1]);
    const tenths = Number(m[3]);
    const hundredths = Number(m[4]);
    const positions: number[] = [];
    if (tenths === digit) positions.push(1);
    if (hundredths === digit) positions.push(2);
    expect(positions.length === 1, "placeValue digit ambiguous or zero");
    const pos = positions[0] as number;
    expect(item.answer.kind === "decimal" && item.answer.places === 2, "placeValue places");
    expect(eq(item.answer, digit / 10 ** pos), "placeValue math");
  },

  money(item) {
    let m = new RegExp(`^Rp${NUM} ([+-]) Rp${NUM} = \\.\\.\\.$`).exec(item.prompt);
    if (m) {
      const a = pInt(m[1] as string);
      const b = pInt(m[3] as string);
      const expected = m[2] === "+" ? a + b : a - b;
      expect(item.answer.kind === "moneyRupiah" && item.answer.value === expected, "money add/sub math");
      return;
    }
    m = /^Harga 1 .+ Rp([\d.]+)\. Berapa harga (\d+) .+\?$/.exec(item.prompt);
    if (m) {
      expect(
        item.answer.kind === "moneyRupiah" && item.answer.value === pInt(m[1] as string) * Number(m[2]),
        "money multiply math",
      );
      return;
    }
    m = /^Rp([\d.]+) dibagi rata kepada (\d+) anak\. Berapa uang tiap anak\?$/.exec(item.prompt);
    if (m) {
      const total = pInt(m[1] as string);
      const k = Number(m[2]);
      expect(total % k === 0, "money share not exact");
      expect(item.answer.kind === "moneyRupiah" && item.answer.value === total / k, "money share math");
      return;
    }
    m = /^(.+) membayar Rp([\d.]+) untuk barang seharga Rp([\d.]+)\. Berapa kembaliannya\?$/.exec(item.prompt);
    expect(m !== null, "money prompt format");
    if (!m) return;
    expect(
      item.answer.kind === "moneyRupiah" && item.answer.value === pInt(m[2] as string) - pInt(m[3] as string),
      "money change math",
    );
  },

  measurement(item) {
    let m = /^([\d.]+) (m|cm|mm|kg|g|jam|menit) = \.\.\. (m|cm|mm|kg|g|menit|jam)$/.exec(item.prompt);
    if (m) {
      const v = pInt(m[1] as string);
      const from = m[2] as string;
      const to = m[3] as string;
      const factor = CONVERT_FACTORS[from];
      const expected = v * factor;
      expect(Number.isInteger(expected), "measurement conversion not integer");
      expect(
        item.answer.kind === "unitValue" &&
          item.answer.value === expected &&
          item.answer.unit === to,
        `measurement conversion ${v} ${from} -> ${to}`,
      );
      return;
    }
    m = /^Keliling persegi panjang dengan panjang (\d+) cm dan lebar (\d+) cm adalah \.\.\.$/.exec(item.prompt);
    if (m) {
      const p = Number(m[1]);
      const l = Number(m[2]);
      expect(item.answer.kind === "unitValue" && item.answer.value === 2 * (p + l) && item.answer.unit === "cm", "keliling math");
      return;
    }
    m = /^([\d.]+) jam ([\d.]+) menit = \.\.\. menit$/.exec(item.prompt);
    if (m) {
      const h = pInt(m[1] as string);
      const mnt = pInt(m[2] as string);
      expect(mnt >= 1, "jamMenitCarry item without leftover minutes");
      expect(
        item.answer.kind === "unitValue" &&
          item.answer.value === h * 60 + mnt &&
          item.answer.unit === "menit",
        "jamMenitCarry math",
      );
      return;
    }
    m = /^Keliling segitiga dengan sisi (\d+) cm, (\d+) cm, dan (\d+) cm adalah \.\.\.$/.exec(item.prompt);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      const c = Number(m[3]);
      expect(c < a + b && a < b + c && b < a + c, `degenerate triangle ${[a, b, c]}`);
      expect(
        item.answer.kind === "unitValue" && item.answer.value === a + b + c && item.answer.unit === "cm",
        "triangle keliling math",
      );
      return;
    }
    m = /^Keliling (segi lima|segi enam|segi delapan) dengan panjang sisi (\d+) cm adalah \.\.\.$/.exec(item.prompt);
    if (m) {
      const n = REGULAR_POLYGON_SIDES[m[1] as string];
      expect(n !== undefined, `unknown polygon ${m[1]}`);
      const s = Number(m[2]);
      expect(
        item.answer.kind === "unitValue" && item.answer.value === n * s && item.answer.unit === "cm",
        "polygon keliling math",
      );
      return;
    }
    m = /^Luas segitiga dengan alas (\d+) cm dan tinggi (\d+) cm adalah \.\.\.$/.exec(item.prompt);
    if (m) {
      const alas = Number(m[1]);
      const tinggi = Number(m[2]);
      expect((alas * tinggi) % 2 === 0, "triangle area not a whole number");
      expect(
        item.answer.kind === "unitValue" &&
          item.answer.value === (alas * tinggi) / 2 &&
          item.answer.unit === "cm²",
        "triangle luas math",
      );
      return;
    }
    m = /^Luas persegi panjang dengan panjang (\d+) cm dan lebar (\d+) cm adalah \.\.\.$/.exec(item.prompt);
    expect(m !== null, "measurement prompt format");
    if (!m) return;
    expect(
      item.answer.kind === "unitValue" &&
        item.answer.value === Number(m[1]) * Number(m[2]) &&
        item.answer.unit === "cm²",
      "luas math",
    );
  },

  geometry(item) {
    let m = /^Bangun datar (.+) memiliki berapa (sisi|sudut)\?$/.exec(item.prompt);
    if (m) {
      const n = PLANE_SHAPES[m[1] as string];
      expect(n !== undefined, `unknown shape ${m[1]}`);
      expect(item.answer.kind === "integer" && item.answer.value === n, "geometry shape math");
      return;
    }
    m = /^Dua sudut segitiga masing-masing (\d+)° dan (\d+)°\. Berapa besar sudut ketiga\?$/.exec(item.prompt);
    if (m) {
      const third = 180 - Number(m[1]) - Number(m[2]);
      expect(third > 0, "triangle third angle not positive");
      expect(item.answer.kind === "unitValue" && item.answer.value === third && item.answer.unit === "derajat", "triangle angle math");
      return;
    }
    m = /^Berapa derajat besar tiap sudut pada bangun persegi\?$/.exec(item.prompt);
    if (m) {
      expect(item.answer.kind === "unitValue" && item.answer.value === 90, "quad angle math");
      return;
    }
    m = /^Berapa besar sudut yang harus ditambahkan pada sudut (\d+)° agar menjadi sudut siku-siku\?$/.exec(item.prompt);
    if (m) {
      expect(item.answer.kind === "unitValue" && item.answer.value === 90 - Number(m[1]), "complement math");
      return;
    }
    m = /^Berapa besar sudut yang harus ditambahkan pada sudut (\d+)° agar menjadi sudut berpelurus\?$/.exec(item.prompt);
    if (m) {
      expect(item.answer.kind === "unitValue" && item.answer.value === 180 - Number(m[1]), "supplement math");
      return;
    }
    m = /^Sudut (siku-siku|lurus|penuh) berukuran \.\.\. derajat\.$/.exec(item.prompt);
    if (m) {
      expect(item.answer.kind === "unitValue" && item.answer.value === ANGLE_FACTS[m[1] as string], "angle fact math");
      return;
    }
    m = /^Bangun datar disusun dari (\d+) persegi dengan panjang sisi (\d+) cm\. Berapa luas seluruh bangun\?$/.exec(item.prompt);
    expect(m !== null, "geometry prompt format");
    if (!m) return;
    const pieces = Number(m[1]);
    const s = Number(m[2]);
    expect(
      item.answer.kind === "unitValue" && item.answer.value === pieces * s * s && item.answer.unit === "cm²",
      "compose area math",
    );
  },

  datareading(item) {
    const table = /([a-z]+) (\d+) (kg|buah)/g;
    const values = new Map<string, number>();
    let unitName = "";
    for (const match of item.prompt.matchAll(table)) {
      values.set(match[1] as string, Number(match[2]));
      unitName = match[3] as string;
    }
    expect(values.size >= 2, "datareading table missing");
    let m = /Berapa kg (\w+) yang terjual\?$/.exec(item.prompt)
      ?? /Berapa banyak permen (\w+)\?$/.exec(item.prompt);
    if (m) {
      const v = values.get(m[1] as string);
      expect(v !== undefined, `datareading read label ${m[1]} not in table`);
      expect(item.answer.kind === "unitValue" && item.answer.value === v && item.answer.unit === unitName, "datareading read math");
      return;
    }
    m = /Berapa jumlah (\w+) dan (\w+) seluruhnya\?$/.exec(item.prompt);
    if (m) {
      const va = values.get(m[1] as string);
      const vb = values.get(m[2] as string);
      expect(va !== undefined && vb !== undefined, "datareading sum labels");
      expect(item.answer.kind === "unitValue" && item.answer.value === (va as number) + (vb as number), "datareading sum math");
      return;
    }
    m = /Berapa selisih (\w+) dan (\w+)\?$/.exec(item.prompt);
    expect(m !== null, "datareading prompt format");
    if (!m) return;
    const va = values.get(m[1] as string);
    const vb = values.get(m[2] as string);
    expect(va !== undefined && vb !== undefined, "datareading diff labels");
    expect(
      item.answer.kind === "unitValue" &&
        item.answer.value === Math.abs((va as number) - (vb as number)) &&
        item.answer.value > 0,
      "datareading diff math",
    );
  },

  wordproblems(item) {
    // Story prompts: verify through the hint payload, which restates the numbers.
    expect(item.hint !== null && item.hint !== undefined, "wordproblems item missing hint");
    checkHint(item);
    const payload = item.hint?.payload as Record<string, unknown>;
    if (payload.kind === "part-whole") {
      const total = payload.total as number | null;
      const parts = payload.parts as (number | null)[];
      expect(total === null || total >= 0, "negative total");
      expect(total !== 0 && parts.every((p) => p === null || p >= 0), "negative part");
    }
  },
};

export function verifyFamilyItem(familyId: string, item: Item): void {
  checkShape(item);
  const verify = VERIFY[familyId];
  if (!verify) throw new Error(`verifyFamilyItem: no verifier for family "${familyId}"`);
  verify(item);
}
