/**
 * Generator families — fractions, decimals, money (plan section 3.3).
 *
 * Parameters (itemCount required):
 * - fractions: kinds=["addSame","subSame","addDiff","subDiff","multWhole",
 *   "divWhole","compare","equivalent","simplify"], maxDen=12,
 *   denominators (allowed penyebut; default 2..maxDen), maxWhole=5,
 *   requireSimplify=false (same-denominator answers in lowest terms)
 * - decimals:  kinds=["add","sub","compare","sequence","fromFraction",
 *   "placeValue"]  (values built from integer counts of 10^places units)
 * - money:     kinds=["add","sub","multiply","share","change"], step=500,
 *   maxTotal=100000
 *
 * Fraction answers keep the working denominator for same-denominator drills
 * (1/4 + 1/4 -> 4/4) and are fully reduced for different-denominator ops,
 * x/: by whole numbers, simplify and compare — grading (answersEqual) accepts
 * any equivalent form the child enters.
 */

import {
  decFromUnits,
  formatDecimalFromUnits,
  formatFraction,
  formatMoney,
  frac,
  gcd,
  lcm,
  reduceFraction,
  rupiah,
} from "./answers";
import { intIn, pBool, pInt, pItemCount, pKinds, pNum } from "./params";
import type { Rng } from "./rng";
import type { Answer, GeneratorFamily, Item, StepParams } from "./types";

import {
  baseTenHint,
  buildItems,
  drawWithRetry,
  fractionBarHint,
  numberLineHint,
  pairChoices,
  partWholeHint,
} from "./families-shared";

// ---------------------------------------------------------------------------
// fractions
// ---------------------------------------------------------------------------

const FRACTION_KINDS = [
  "addSame",
  "subSame",
  "addDiff",
  "subDiff",
  "multWhole",
  "divWhole",
  "compare",
  "equivalent",
  "simplify",
] as const;

type Proper = { n: number; d: number };

/** Denominator drawer: the authored allowed set when present, else [min, maxDen]. */
type DenDraw = (min: number) => number;

function properReduced(rng: Rng, drawDen: DenDraw): Proper {
  const d = drawDen(2);
  const n = intIn(rng, 1, d - 1);
  return gcd(n, d) === 1 ? { n, d } : properReduced(rng, drawDen);
}

function fractionItem(
  prompt: string,
  answer: Proper,
  hint: ItemHintOf,
  choices?: Answer[],
): Item {
  return {
    id: "",
    prompt,
    answer: frac(answer.n, answer.d),
    answerType: "fraction",
    choices,
    hint,
  };
}

type ItemHintOf = Item["hint"];

function generateFractions(sp: StepParams, rng: Rng): Item[] {
  const count = pItemCount(sp.params, "fractions");
  const kinds = pKinds(sp.params, "kinds", "fractions", FRACTION_KINDS, FRACTION_KINDS);
  const maxDen = pInt(sp.params, "maxDen", "fractions", 12);
  if (maxDen < 4 || maxDen > 24) throw new Error("fractions: maxDen must be in [4, 24]");
  // Whole operand of x/: by whole numbers, bounded by the authored maxWhole
  // (default 5 keeps the historical 2..5 range).
  const maxWhole = pInt(sp.params, "maxWhole", "fractions", 5);
  if (maxWhole < 2 || maxWhole > 20) throw new Error("fractions: maxWhole must be in [2, 20]");
  const requireSimplify = pBool(sp.params, "requireSimplify", "fractions", false);

  // Authored allowed penyebut (data/skills/params.ts fractionsStepSchema).
  // Values outside [2, maxDen] are unreachable at this step and drop out; an
  // empty remainder falls back to the full 2..maxDen range. subSame keeps its
  // >= 3 floor: with a pool of nothing but 2s it falls back rather than fail.
  const rawDenoms = sp.params.denominators;
  const denoms: number[] | null = Array.isArray(rawDenoms)
    ? [...new Set(
      rawDenoms.filter(
        (v): v is number => typeof v === "number" && Number.isInteger(v) && v >= 2 && v <= maxDen,
      ),
    )]
    : null;
  const drawDen: DenDraw = (min) => {
    const pool = denoms?.filter((d) => d >= min);
    return pool !== undefined && pool.length > 0 ? rng.pick(pool) : intIn(rng, min, maxDen);
  };

  return buildItems(sp, count, () => {
    const kind = rng.pick(kinds);

    if (kind === "addSame" || kind === "subSame") {
      // subSame needs n1 >= 2, so its denominator starts at 3.
      const d = drawDen(kind === "addSame" ? 2 : 3);
      let n1: number;
      let n2: number;
      if (kind === "addSame") {
        n1 = intIn(rng, 1, d - 1);
        n2 = intIn(rng, 1, d - 1);
      } else {
        n1 = intIn(rng, 2, d - 1);
        n2 = intIn(rng, 1, n1 - 1);
      }
      const result = kind === "addSame" ? n1 + n2 : n1 - n2;
      // Without requireSimplify the working denominator is kept (1/4 + 1/4 ->
      // 4/4); with it the canonical answer is the simplified form.
      const answer = requireSimplify ? reduceFraction(result, d) : { n: result, d };
      const op = kind === "addSame" ? "+" : "-";
      return fractionItem(
        `${formatFraction(n1, d)} ${op} ${formatFraction(n2, d)} = ...`,
        answer,
        fractionBarHint(kind === "addSame" ? "add" : "sub", { n: n1, d }, { n: n2, d }),
      );
    }

    if (kind === "addDiff" || kind === "subDiff") {
      const isAdd = kind === "addDiff";
      const { d1, d2 } = drawWithRetry(
        200,
        (ds: { d1: number; d2: number }) =>
          ds.d1 !== ds.d2 &&
          (ds.d2 % ds.d1 === 0 || ds.d1 % ds.d2 === 0 || lcm(ds.d1, ds.d2) <= 24),
        () => ({ d1: drawDen(2), d2: drawDen(2) }),
      );
      const draw = (): { n1: number; n2: number } => ({
        n1: intIn(rng, 1, d1 - 1),
        n2: intIn(rng, 1, d2 - 1),
      });
      const { n1, n2 } = isAdd
        ? draw()
        : drawWithRetry(200, (ns: { n1: number; n2: number }) => ns.n1 * d2 > ns.n2 * d1, draw);
      const L = lcm(d1, d2);
      const num = isAdd
        ? (n1 * L) / d1 + (n2 * L) / d2
        : (n1 * L) / d1 - (n2 * L) / d2;
      const reduced = reduceFraction(num, L);
      return fractionItem(
        `${formatFraction(n1, d1)} ${isAdd ? "+" : "-"} ${formatFraction(n2, d2)} = ...`,
        { n: reduced.n, d: reduced.d },
        fractionBarHint(isAdd ? "add" : "sub", { n: n1, d: d1 }, { n: n2, d: d2 }),
      );
    }

    if (kind === "multWhole" || kind === "divWhole") {
      const d = drawDen(2);
      const n = intIn(rng, 1, d - 1);
      const k = intIn(rng, 2, maxWhole);
      const reduced =
        kind === "multWhole" ? reduceFraction(n * k, d) : reduceFraction(n, d * k);
      const op = kind === "multWhole" ? "×" : ":";
      return fractionItem(
        `${formatFraction(n, d)} ${op} ${k} = ...`,
        { n: reduced.n, d: reduced.d },
        fractionBarHint(kind === "multWhole" ? "mult" : "div", { n, d }, null, k),
      );
    }

    if (kind === "compare") {
      const f1 = properReduced(rng, drawDen);
      const f2 = drawWithRetry(
        300,
        (g: Proper) => f1.n * g.d !== g.n * f1.d,
        () => properReduced(rng, drawDen),
      );
      const askLarger = rng.pick(["besar", "kecil"] as const) === "besar";
      const firstBigger = f1.n * f2.d > f2.n * f1.d;
      const answer = askLarger
        ? firstBigger
          ? f1
          : f2
        : firstBigger
          ? f2
          : f1;
      const toAnswer = (f: Proper): Answer => frac(f.n, f.d);
      return {
        id: "",
        prompt: `Manakah pecahan yang lebih ${askLarger ? "besar" : "kecil"}: ${formatFraction(f1.n, f1.d)} atau ${formatFraction(f2.n, f2.d)}?`,
        answer: frac(answer.n, answer.d),
        answerType: "fraction",
        choices: pairChoices(rng, toAnswer(f1), toAnswer(f2)),
        hint: numberLineHint({
          min: 0,
          max: 1,
          step: 0.25,
          marks: [f1.n / f1.d, f2.n / f2.d],
          target: null,
        }),
      };
    }

    if (kind === "equivalent") {
      const base = drawWithRetry(
        200,
        (b: Proper) => b.d * 3 <= 36,
        () => properReduced(rng, drawDen),
      );
      const k = intIn(rng, 2, 3);
      const D = base.d * k;
      return fractionItem(
        `Isi kotak: ${formatFraction(base.n, base.d)} = .../${D}`,
        { n: base.n * k, d: D },
        fractionBarHint("equiv", { n: base.n, d: base.d }, { n: null, d: D }),
      );
    }

    // simplify: draw a reduced base, present it multiplied by m
    const base = drawWithRetry(
      200,
      (b: Proper) => b.n * 4 <= 96 && b.d * 4 <= 96,
      () => properReduced(rng, drawDen),
    );
    const m = intIn(rng, 2, 4);
    return fractionItem(
      `Sederhanakan pecahan: ${formatFraction(base.n * m, base.d * m)}.`,
      { n: base.n, d: base.d },
      fractionBarHint("simplify", { n: base.n * m, d: base.d * m }),
    );
  });
}

// ---------------------------------------------------------------------------
// decimals — values carried as integer counts of 10^places units
// ---------------------------------------------------------------------------

const DECIMAL_KINDS = [
  "add",
  "sub",
  "compare",
  "sequence",
  "fromFraction",
  "placeValue",
] as const;

const MAX_DECIMAL_VALUE = 2; // add/sub/compare/sequence values <= 2.00

function generateDecimals(sp: StepParams, rng: Rng): Item[] {
  const count = pItemCount(sp.params, "decimals");
  const kinds = pKinds(sp.params, "kinds", "decimals", DECIMAL_KINDS, DECIMAL_KINDS);
  // Optional authored level keys: fixed places (1|2) instead of per-item
  // random, and a scaled-units value cap (value * 10^places <= maxUnits).
  // Defaults keep the historical behaviour (random places, <= 2.00 values).
  const rawPlaces = sp.params.places;
  const fixedPlaces: 1 | 2 | null = rawPlaces === 1 || rawPlaces === 2 ? rawPlaces : null;
  const rawMaxUnits = pNum(sp.params, "maxUnits", "decimals", 0);
  const capFor = (places: 1 | 2): number =>
    rawMaxUnits > 0 ? rawMaxUnits : 10 ** places * MAX_DECIMAL_VALUE;

  const decAnswer = (units: number, places: number): Answer => decFromUnits(units, places);
  const fmt = (units: number, places: number): string =>
    formatDecimalFromUnits(units, places);
  const toHundredths = (units: number, places: number): number =>
    units * (places === 1 ? 10 : 1);

  return buildItems(sp, count, () => {
    const kind = rng.pick(kinds);

    if (kind === "add" || kind === "sub") {
      const places: 1 | 2 = fixedPlaces ?? rng.pick([1, 2] as const);
      const cap = capFor(places);
      // sub needs u2 >= 1, so u1 starts at 2.
      const u1 = intIn(rng, kind === "add" ? 1 : 2, cap - 1);
      const u2 = kind === "add" ? intIn(rng, 1, cap - u1) : intIn(rng, 1, u1 - 1);
      const resultUnits = kind === "add" ? u1 + u2 : u1 - u2;
      return {
        id: "",
        prompt: `${fmt(u1, places)} ${kind === "add" ? "+" : "-"} ${fmt(u2, places)} = ...`,
        answer: decAnswer(resultUnits, places),
        answerType: "decimal",
        hint: baseTenHint({
          variant: "hundredthsChart",
          shaded: toHundredths(u1, places),
          shaded2: toHundredths(u2, places),
          op: kind,
        }),
      };
    }

    if (kind === "compare") {
      const p1: 1 | 2 = fixedPlaces ?? rng.pick([1, 2] as const);
      const p2: 1 | 2 = fixedPlaces ?? rng.pick([1, 2] as const);
      const u1 = intIn(rng, 1, capFor(p1));
      const u2 = drawWithRetry(
        200,
        (u: number) => u / 10 ** p2 !== u1 / 10 ** p1,
        () => intIn(rng, 1, capFor(p2)),
      );
      const askLarger = rng.pick(["besar", "kecil"] as const) === "besar";
      const a = decAnswer(u1, p1);
      const b = decAnswer(u2, p2);
      const firstBigger = u1 / 10 ** p1 > u2 / 10 ** p2;
      const answer = firstBigger === askLarger ? a : b;
      return {
        id: "",
        prompt: `Manakah yang lebih ${askLarger ? "besar" : "kecil"}: ${fmt(u1, p1)} atau ${fmt(u2, p2)}?`,
        answer,
        answerType: "decimal",
        choices: pairChoices(rng, a, b),
        hint: baseTenHint({
          variant: "hundredthsChart",
          shaded: toHundredths(u1, p1),
          shaded2: toHundredths(u2, p2),
          op: "compare",
        }),
      };
    }

    if (kind === "sequence") {
      const places: 1 | 2 = fixedPlaces ?? rng.pick([1, 2] as const);
      const stepChoices: number[] = places === 2 ? [1, 10] : [1];
      const s = stepChoices[intIn(rng, 0, stepChoices.length - 1)] as number;
      const cap = capFor(places);
      const t = intIn(rng, 1, cap - 3 * s);
      const [t1, t2, t3, t4] = [t, t + s, t + 2 * s, t + 3 * s];
      return {
        id: "",
        prompt: `Lengkapi urutan: ${fmt(t1, places)}; ${fmt(t2, places)}; ...; ${fmt(t4, places)}.`,
        answer: decAnswer(t3, places),
        answerType: "decimal",
        hint: numberLineHint({
          min: 0,
          max: t4 / 10 ** places,
          step: s / 10 ** places,
          marks: [t1 / 10 ** places, t2 / 10 ** places, t4 / 10 ** places],
          target: null,
        }),
      };
    }

    if (kind === "fromFraction") {
      // Authored level (places 1|2) pins the denominator: tenths vs hundredths.
      const den = fixedPlaces !== null ? (fixedPlaces === 1 ? 10 : 100) : (rng.pick([10, 100] as const));
      const n = intIn(rng, 1, den - 1);
      // n/10 is n tenths (places 1); n/100 is n hundredths (places 2).
      const places = den === 10 ? 1 : 2;
      return {
        id: "",
        prompt: `Tulis ${n}/${den} sebagai bilangan desimal.`,
        answer: decAnswer(n, places),
        answerType: "decimal",
        hint: fractionBarHint("toDecimal", { n, d: den }),
      };
    }

    // placeValue: always a 2-decimal number like 3,74; the asked digit must be
    // nonzero and must not also appear at the other decimal position (prompt
    // would be ambiguous).
    const draw = (): { intPart: number; tenths: number; hundredths: number; position: 1 | 2 } => ({
      intPart: intIn(rng, 1, 9),
      tenths: intIn(rng, 0, 9),
      hundredths: intIn(rng, 0, 9),
      position: rng.pick([1, 2] as const),
    });
    const ok = (v: { tenths: number; hundredths: number; position: 1 | 2 }): boolean => {
      const digit = v.position === 1 ? v.tenths : v.hundredths;
      const other = v.position === 1 ? v.hundredths : v.tenths;
      return digit !== 0 && digit !== other;
    };
    const { intPart, tenths, hundredths, position } = drawWithRetry(300, ok, draw);
    const digit = position === 1 ? tenths : hundredths;
    const units = position === 1 ? digit * 10 : digit;
    const value = intPart + tenths / 10 + hundredths / 100;
    return {
      id: "",
      prompt: `Berapa nilai tempat angka ${digit} pada bilangan ${intPart},${tenths}${hundredths}?`,
      answer: decAnswer(units, 2),
      answerType: "decimal",
      hint: baseTenHint({
        variant: "placeValue",
        number: value,
        digit,
        place: position,
      }),
    };
  });
}

// ---------------------------------------------------------------------------
// money — rupiah amounts in whole hundreds/thousands
// ---------------------------------------------------------------------------

const MONEY_KINDS = ["add", "sub", "multiply", "share", "change"] as const;
const MONEY_NAMES = ["Ani", "Budi", "Citra", "Dewi", "Eko", "Fajar"] as const;
const MONEY_OBJECTS = ["buku tulis", "pensil", "penghapus", "buku gambar"] as const;

function generateMoney(sp: StepParams, rng: Rng): Item[] {
  const count = pItemCount(sp.params, "money");
  const kinds = pKinds(sp.params, "kinds", "money", MONEY_KINDS, MONEY_KINDS);
  const step = pInt(sp.params, "step", "money", 500);
  const maxTotal = pInt(sp.params, "maxTotal", "money", 100000);
  if (step < 100 || maxTotal < 40 * step) {
    // 40 * step: multiply/share answers (up to 9 * maxPrice) stay <= maxTotal.
    throw new Error("money: need step >= 100 and maxTotal >= 40 * step");
  }

  return buildItems(sp, count, () => {
    const kind = rng.pick(kinds);

    if (kind === "add" || kind === "sub") {
      const a = step * intIn(rng, 2, Math.floor(maxTotal / 2 / step));
      const b =
        kind === "add"
          ? step * intIn(rng, 2, Math.floor((maxTotal - a) / step))
          : step * intIn(rng, 1, Math.floor(a / step) - 1);
      const answer = kind === "add" ? a + b : a - b;
      return {
        id: "",
        prompt: `${formatMoney(a)} ${kind === "add" ? "+" : "-"} ${formatMoney(b)} = ...`,
        answer: rupiah(answer),
        answerType: "moneyRupiah",
        hint:
          kind === "add"
            ? partWholeHint(null, [a, b], ["uang 1", "uang 2"])
            : partWholeHint(a, [b, null], ["total", "diambil"]),
      };
    }

    if (kind === "multiply") {
      const obj = rng.pick(MONEY_OBJECTS);
      const k = intIn(rng, 2, 9);
      // Price stays <= 9000 (18 steps): realistic per-item prices for kelas
      // 4-5 AND small enough for a renderable base-ten hint.
      const price = step *
        intIn(rng, 2, Math.max(2, Math.min(18, Math.floor(maxTotal / (2 * k) / step))));
      const answer = price * k;
      return {
        id: "",
        prompt: `Harga 1 ${obj} ${formatMoney(price)}. Berapa harga ${k} ${obj}?`,
        answer: rupiah(answer),
        answerType: "moneyRupiah",
        hint: baseTenHint({
          variant: "equalGroups",
          groups: k,
          perGroup: price,
          total: null,
          remainder: 0,
          unknown: "total",
        }),
      };
    }

    if (kind === "share") {
      const k = intIn(rng, 2, 9);
      // Same 9000 cap on the per-child share keeps the total (k * per) within
      // the renderable base-ten range too.
      const per = step *
        intIn(
          rng,
          2,
          Math.max(2, Math.min(Math.floor(9999 / k / step), Math.floor(maxTotal / (2 * k) / step))),
        );
      const total = k * per;
      return {
        id: "",
        prompt: `${formatMoney(total)} dibagi rata kepada ${k} anak. Berapa uang tiap anak?`,
        answer: rupiah(per),
        answerType: "moneyRupiah",
        hint: baseTenHint({
          variant: "equalGroups",
          groups: k,
          perGroup: null,
          total,
          remainder: 0,
          unknown: "perGroup",
        }),
      };
    }

    // change (kembalian)
    const name = rng.pick(MONEY_NAMES);
    const price = step * intIn(rng, 2, Math.max(2, Math.floor((maxTotal * 0.6) / step)));
    const payExtra = step * intIn(rng, 2, Math.max(2, Math.floor((maxTotal - price) / step)));
    const pay = price + payExtra;
    return {
      id: "",
      prompt: `${name} membayar ${formatMoney(pay)} untuk barang seharga ${formatMoney(price)}. Berapa kembaliannya?`,
      answer: rupiah(pay - price),
      answerType: "moneyRupiah",
      hint: partWholeHint(pay, [price, null], ["dibayar", "kembalian"]),
    };
  });
}

// ---------------------------------------------------------------------------

export const fractionsFamily: GeneratorFamily = { id: "fractions", generate: generateFractions };
export const decimalsFamily: GeneratorFamily = { id: "decimals", generate: generateDecimals };
export const moneyFamily: GeneratorFamily = { id: "money", generate: generateMoney };
