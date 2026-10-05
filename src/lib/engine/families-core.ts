/**
 * Generator families — the Bilangan core (plan section 3.3, Kumon levels C-D
 * mirror): addsub, mult, div, placevalue, factorsmultiples.
 *
 * Parameter conventions (all keys optional unless noted; itemCount required):
 * - addsub:        max=1000, min=1 (operand floor), kinds=["add","sub"],
 *                  regroup=false, choices=true, missingPosition="result"
 * - mult:          kinds=["tables"], tablesMax=10, choices=true,
 *                  missingPosition="result"; aMin/aMax/bMin/bMax bound the
 *                  operands (kind defaults: tables 2..tablesMax, 2x1
 *                  10..99 x 2..9, 2x2 10..99 x 10..99)
 * - div:           kinds=["quotient"], dividendMax=100, dividendMin=0,
 *                  divisorMax=9, divisorMin=2, choices=true
 * - placevalue:    max=100000, kinds=["digitValue","compose","compare","order"],
 *                  roundTo=100 (round kind only)
 * - factorsmultiples: kinds=["kelipatan","kelipatanSeq","faktor","kpk","fpb",
 *                  "patternX","patternDiv"], max=48 (ceiling for faktor n,
 *                  kelipatan and kpk answers, fpb operands and pattern
 *                  terms), factorMax=5 (pattern ratio bound)
 */

import {
  additionHasCarry,
  divisorCount,
  formatInt,
  gcd,
  int,
  lcm,
  subtractionHasBorrow,
} from "./answers";
import { distinctIn, intIn, pBool, pEnum, pInt, pItemCount, pKinds } from "./params";
import type { Rng } from "./rng";
import type { GeneratorFamily, Item, StepParams } from "./types";

/** Which part of the sentence is the unknown: the result or an operand. */
const MISSING_POSITIONS = ["result", "operand"] as const;

import {
  baseTenHint,
  buildItems,
  drawWithRetry,
  intChoices,
  numberLineHint,
  pairChoices,
  partWholeHint,
} from "./families-shared";

// ---------------------------------------------------------------------------
// addsub — penjumlahan & pengurangan dengan/ tanpa menyimpan
// ---------------------------------------------------------------------------

function addsubParams(sp: StepParams) {
  return {
    count: pItemCount(sp.params, "addsub"),
    // Operand floor (authored `min`); the engine never serves 0 operands.
    min: Math.max(1, pInt(sp.params, "min", "addsub", 1)),
    max: pInt(sp.params, "max", "addsub", 1000),
    kinds: pKinds(sp.params, "kinds", "addsub", ["add", "sub"] as const, ["add", "sub"]),
    regroup: pBool(sp.params, "regroup", "addsub", false),
    choices: pBool(sp.params, "choices", "addsub", true),
    missingPosition: pEnum(sp.params, "missingPosition", "addsub", MISSING_POSITIONS, "result"),
  };
}

function generateAddsub(sp: StepParams, rng: Rng): Item[] {
  const cfg = addsubParams(sp);
  // add needs both operands >= min with a + b <= max, so max >= 2 * min
  // (sub needs max >= min + 1, implied for min >= 1).
  if (cfg.max < 2 * cfg.min) throw new Error("addsub: max must be >= 2 * min");

  return buildItems(sp, cfg.count, () => {
    const kind = rng.pick(cfg.kinds);
    if (kind === "add") {
      const { a, b } = drawWithRetry(
        200,
        ({ a, b }) => a + b <= cfg.max && (!cfg.regroup || additionHasCarry(a, b)),
        () => {
          const a = intIn(rng, cfg.min, cfg.max - cfg.min);
          const b = intIn(rng, cfg.min, cfg.max - a);
          return { a, b };
        },
      );
      const answer = a + b;
      if (cfg.missingPosition === "operand") {
        const missingFirst = rng.pick(["first", "second"] as const) === "first";
        const unknown = missingFirst ? a : b;
        return {
          id: "",
          prompt: missingFirst
            ? `... + ${formatInt(b)} = ${formatInt(answer)}`
            : `${formatInt(a)} + ... = ${formatInt(answer)}`,
          answer: int(unknown),
          answerType: "integer",
          choices: cfg.choices
            ? intChoices(rng, unknown, [unknown + 1, unknown - 1, unknown + 10, unknown - 10])
            : undefined,
          hint: partWholeHint(answer, missingFirst ? [null, b] : [a, null], ["bagian 1", "bagian 2"]),
        };
      }
      const hintModel = rng.pick(["part-whole", "number-line"] as const);
      const hint =
        hintModel === "part-whole"
          ? partWholeHint(null, [a, b], ["bagian 1", "bagian 2"])
          : numberLineHint({
              min: 0,
              max: answer,
              step: null,
              marks: [a],
              jump: b,
              target: null,
            });
      return {
        id: "",
        prompt: `${formatInt(a)} + ${formatInt(b)} = ...`,
        answer: int(answer),
        answerType: "integer",
        choices: cfg.choices ? intChoices(rng, answer, [answer + 1, answer - 1, answer + 10, answer - 10]) : undefined,
        hint,
      };
    }

    const { a, b } = drawWithRetry(
      200,
      ({ a, b }) => a - b >= 1 && (!cfg.regroup || subtractionHasBorrow(a, b)),
      () => {
        const a = intIn(rng, cfg.min + 1, cfg.max);
        const b = intIn(rng, cfg.min, a - 1);
        return { a, b };
      },
    );
    const answer = a - b;
    if (cfg.missingPosition === "operand") {
      const missingFirst = rng.pick(["first", "second"] as const) === "first";
      const unknown = missingFirst ? a : b;
      return {
        id: "",
        prompt: missingFirst
          ? `... - ${formatInt(b)} = ${formatInt(answer)}`
          : `${formatInt(a)} - ... = ${formatInt(answer)}`,
        answer: int(unknown),
        answerType: "integer",
        choices: cfg.choices
          ? intChoices(rng, unknown, [unknown + 1, unknown - 1, unknown + 10, unknown - 10])
          : undefined,
        hint: missingFirst
          ? partWholeHint(null, [b, answer], ["diambil", "sisa"])
          : partWholeHint(a, [null, answer], ["diambil", "sisa"]),
      };
    }
    return {
      id: "",
      prompt: `${formatInt(a)} - ${formatInt(b)} = ...`,
      answer: int(answer),
      answerType: "integer",
      choices: cfg.choices ? intChoices(rng, answer, [answer + 1, answer - 1, answer + 10, answer - 10]) : undefined,
      hint: partWholeHint(a, [b, null], ["diberikan", "diambil"]),
    };
  });
}

// ---------------------------------------------------------------------------
// mult — perkalian: tabel sampai 2 digit x 1 digit, lalu 2 x 2 digit
// ---------------------------------------------------------------------------

/** Place-value split of an operand for the area-model hint payload. */
function placeParts(v: number): number[] {
  return v >= 10 ? [Math.floor(v / 10) * 10, v % 10] : [v];
}

function generateMult(sp: StepParams, rng: Rng): Item[] {
  const count = pItemCount(sp.params, "mult");
  const kinds = pKinds(
    sp.params,
    "kinds",
    "mult",
    ["tables", "2x1", "2x2"] as const,
    ["tables"],
  );
  const tablesMax = pInt(sp.params, "tablesMax", "mult", 10);
  const choices = pBool(sp.params, "choices", "mult", true);
  const missingPosition = pEnum(sp.params, "missingPosition", "mult", MISSING_POSITIONS, "result");
  if (tablesMax < 2 || tablesMax > 12) {
    throw new Error("mult: tablesMax must be in [2, 12]");
  }

  return buildItems(sp, count, () => {
    const kind = rng.pick(kinds);
    // Operand ranges: authored aMin/aMax/bMin/bMax when present; otherwise the
    // kind's historical defaults (tables 2..tablesMax, 2x1 10..99 x 2..9,
    // 2x2 10..99 x 10..99).
    const aMin = pInt(sp.params, "aMin", "mult", kind === "tables" ? 2 : 10);
    const aMax = pInt(sp.params, "aMax", "mult", kind === "tables" ? tablesMax : 99);
    const bMin = pInt(sp.params, "bMin", "mult", kind === "2x2" ? 10 : 2);
    const bMax = pInt(
      sp.params,
      "bMax",
      "mult",
      kind === "tables" ? tablesMax : kind === "2x1" ? 9 : 99,
    );
    const a = intIn(rng, aMin, aMax);
    const b = intIn(rng, bMin, bMax);
    const answer = a * b;

    if (missingPosition === "operand") {
      const missingFirst = rng.pick(["first", "second"] as const) === "first";
      const unknown = missingFirst ? a : b;
      const known = missingFirst ? b : a;
      return {
        id: "",
        prompt: missingFirst
          ? `... × ${formatInt(b)} = ${formatInt(answer)}`
          : `${formatInt(a)} × ... = ${formatInt(answer)}`,
        answer: int(unknown),
        answerType: "integer",
        choices: choices
          ? intChoices(rng, unknown, [unknown + 1, unknown - 1, unknown + 10, unknown - 10])
          : undefined,
        hint:
          kind === "tables"
            ? undefined
            : baseTenHint({ variant: "areaModel", aParts: placeParts(known) }),
      };
    }

    const hint =
      kind === "tables"
        ? baseTenHint({ variant: "array", rows: a, cols: b })
        : kind === "2x1"
          ? baseTenHint({
              variant: "areaModel",
              aParts: [Math.floor(a / 10) * 10, a % 10],
              b,
            })
          : baseTenHint({
              variant: "areaModel",
              aParts: [Math.floor(a / 10) * 10, a % 10],
              bParts: [Math.floor(b / 10) * 10, b % 10],
            });
    return {
      id: "",
      prompt: `${formatInt(a)} × ${formatInt(b)} = ...`,
      answer: int(answer),
      answerType: "integer",
      choices: choices
        ? intChoices(rng, answer, [a * (b + 1), a * (b - 1), (a + 10) * b, Math.max(0, (a - 10) * b)])
        : undefined,
      hint,
    };
  });
}

// ---------------------------------------------------------------------------
// div — pembagian; "quotient" kinds are exact, "remainder" kinds ask the sisa
// ---------------------------------------------------------------------------

function generateDiv(sp: StepParams, rng: Rng): Item[] {
  const count = pItemCount(sp.params, "div");
  const kinds = pKinds(
    sp.params,
    "kinds",
    "div",
    ["quotient", "remainder"] as const,
    ["quotient"],
  );
  const dividendMin = Math.max(0, pInt(sp.params, "dividendMin", "div", 0));
  const dividendMax = pInt(sp.params, "dividendMax", "div", 100);
  const divisorMin = pInt(sp.params, "divisorMin", "div", 2);
  const divisorMax = pInt(sp.params, "divisorMax", "div", 9);
  const choices = pBool(sp.params, "choices", "div", true);
  if (dividendMax < 4 || divisorMax < 2) {
    throw new Error("div: dividendMax >= 4 and divisorMax >= 2 required");
  }
  if (dividendMax < dividendMin || divisorMax < divisorMin) {
    throw new Error("div: max bounds must be >= min bounds");
  }

  return buildItems(sp, count, () => {
    if (rng.pick(kinds) === "quotient") {
      // a = b * q inside [dividendMin, dividendMax] with q >= 2; the divisor
      // draw retries until its quotient range is non-empty.
      const { b, qMin, qMax } = drawWithRetry(
        200,
        (v: { b: number; qMin: number; qMax: number }) => v.qMin <= v.qMax,
        () => {
          const b = intIn(rng, Math.max(2, divisorMin), divisorMax);
          return {
            b,
            qMin: Math.max(2, Math.ceil(dividendMin / b)),
            qMax: Math.floor(dividendMax / b),
          };
        },
      );
      const q = intIn(rng, qMin, qMax);
      const a = b * q;
      return {
        id: "",
        prompt: `${formatInt(a)} : ${formatInt(b)} = ...`,
        answer: int(q),
        answerType: "integer",
        choices: choices ? intChoices(rng, q, [q + 1, q - 1, q + 2, q - 2]) : undefined,
        hint: baseTenHint({
          variant: "equalGroups",
          groups: b,
          perGroup: null,
          total: a,
          remainder: 0,
          unknown: "perGroup",
        }),
      };
    }

    // a = b*q + r with 1 <= r <= b-1 inside [dividendMin, dividendMax]:
    // q <= (dividendMax - (b - 1)) / b keeps b*q + r <= dividendMax for any
    // r <= b-1; q >= (dividendMin - (b - 1)) / b keeps a >= dividendMin
    // reachable.
    const { b, qMin, qMax } = drawWithRetry(
      200,
      (v: { b: number; qMin: number; qMax: number }) => v.qMin <= v.qMax,
      () => {
        const b = intIn(rng, Math.max(2, divisorMin), divisorMax);
        return {
          b,
          qMin: Math.max(1, Math.ceil((dividendMin - b + 1) / b)),
          qMax: Math.floor((dividendMax - b + 1) / b),
        };
      },
    );
    const q = intIn(rng, qMin, qMax);
    const r = intIn(rng, Math.max(1, dividendMin - b * q), b - 1);
    const a = b * q + r;
    return {
      id: "",
      prompt: `Sisa dari ${formatInt(a)} : ${formatInt(b)} adalah ...`,
      answer: int(r),
      answerType: "integer",
      choices: choices ? intChoices(rng, r, [r + 1, r - 1, b - r, b - r + 1]) : undefined,
      hint: baseTenHint({
        variant: "equalGroups",
        groups: b,
        perGroup: q,
        total: a,
        remainder: null,
        unknown: "remainder",
      }),
    };
  });
}

// ---------------------------------------------------------------------------
// placevalue — nilai tempat, membandingkan, mengurutkan (sampai max)
// ---------------------------------------------------------------------------

function generatePlacevalue(sp: StepParams, rng: Rng): Item[] {
  const count = pItemCount(sp.params, "placevalue");
  const max = pInt(sp.params, "max", "placevalue", 100000);
  const kinds = pKinds(
    sp.params,
    "kinds",
    "placevalue",
    ["digitValue", "compose", "compare", "order", "round"] as const,
    ["digitValue", "compose", "compare", "order"],
  );
  const roundTo = pInt(sp.params, "roundTo", "placevalue", 100);
  if (max < 1000) throw new Error("placevalue: max must be >= 1000");
  const minNumber = Math.max(1000, Math.floor(max / 10));

  return buildItems(sp, count, () => {
    const kind = rng.pick(kinds);

    if (kind === "round") {
      // Membulatkan ke roundTo terdekat (10/100/1000); the answer is the
      // rounded number, so the drawn number must not already be a multiple.
      const n = drawWithRetry(
        200,
        (v: number) => v % roundTo !== 0,
        () => intIn(rng, minNumber, max),
      );
      const rounded = Math.round(n / roundTo) * roundTo;
      return {
        id: "",
        prompt: `Membulatkan ${formatInt(n)} ke ${formatInt(roundTo)} terdekat adalah ...`,
        answer: int(rounded),
        answerType: "integer",
        hint: numberLineHint({
          min: rounded - roundTo,
          max: rounded + roundTo,
          step: roundTo,
          marks: [n],
          target: null,
        }),
      };
    }

    if (kind === "digitValue") {
      // Build the number around a chosen (digit, place) so the digit appears
      // exactly once — the draw is deterministic per construction, unlike
      // drawing a number first and re-parsing it (re-parsing drew fresh rng
      // values on every check).
      const drawn = drawWithRetry(
        300,
        (v: { n: number; digit: number; place: number }) => v.n >= minNumber && v.n <= max,
        () => {
          const digit = intIn(rng, 1, 9);
          const numDigits = intIn(rng, 4, String(max).length);
          const place = intIn(rng, 0, numDigits - 1);
          let n = 0;
          for (let p = 0; p < numDigits; p++) {
            if (p === place) {
              n += digit * 10 ** p;
              continue;
            }
            const lo = p === numDigits - 1 ? 1 : 0;
            let d = intIn(rng, lo, 9);
            let guard = 0;
            while (d === digit && guard < 30) {
              d = intIn(rng, lo, 9);
              guard++;
            }
            if (d === digit) d = digit === 9 ? 8 : digit + 1;
            n += d * 10 ** p;
          }
          return { n, digit, place };
        },
      );
      return {
        id: "",
        prompt: `Berapa nilai angka ${drawn.digit} pada bilangan ${formatInt(drawn.n)}?`,
        answer: int(drawn.digit * 10 ** drawn.place),
        answerType: "integer",
        hint: baseTenHint({
          variant: "placeValue",
          number: drawn.n,
          digit: drawn.digit,
          place: drawn.place,
        }),
      };
    }

    if (kind === "compose") {
      const n = drawWithRetry(
        200,
        (v) => String(v).split("").filter((d) => d !== "0").length >= 2,
        () => intIn(rng, minNumber, max),
      );
      const parts: string[] = [];
      const str = String(n);
      for (let i = 0; i < str.length; i++) {
        const d = Number(str[i]);
        if (d !== 0) parts.push(formatInt(d * 10 ** (str.length - 1 - i)));
      }
      return {
        id: "",
        prompt: `${parts.join(" + ")} = ...`,
        answer: int(n),
        answerType: "integer",
        hint: baseTenHint({ variant: "placeValue", number: n, digit: null, place: null }),
      };
    }

    if (kind === "compare") {
      const [a, b] = distinctIn(rng, minNumber, max, 2);
      const askLarger = rng.pick(["besar", "kecil"] as const) === "besar";
      const answer = askLarger ? Math.max(a, b) : Math.min(a, b);
      return {
        id: "",
        prompt: `Manakah bilangan yang lebih ${askLarger ? "besar" : "kecil"}: ${formatInt(a)} atau ${formatInt(b)}?`,
        answer: int(answer),
        answerType: "integer",
        choices: pairChoices(rng, int(a), int(b)),
        hint: numberLineHint({
          min: 0,
          max,
          step: null,
          marks: [a, b],
          target: null,
        }),
      };
    }

    // order: fill the missing middle of an ascending 3-term sequence. Cap the
    // step scale so a stays above minNumber: 5*10^k <= (max - minNumber)/2.
    const scaleK = intIn(rng, 0, String(Math.floor((max - minNumber) / 2 / 5)).length - 1);
    const step = [1, 2, 5][intIn(rng, 0, 2)] * 10 ** scaleK;
    const a = intIn(rng, minNumber, max - 2 * step);
    const answer = a + step;
    return {
      id: "",
      prompt: `Lengkapi urutan: ${formatInt(a)}, ..., ${formatInt(a + 2 * step)}.`,
      answer: int(answer),
      answerType: "integer",
      hint: numberLineHint({
        min: a - step,
        max: a + 3 * step,
        step,
        marks: [a, a + 2 * step],
        target: null,
      }),
    };
  });
}

// ---------------------------------------------------------------------------
// factorsmultiples — kelipatan, faktor, KPK, FPB
// ---------------------------------------------------------------------------

function generateFactorsmultiples(sp: StepParams, rng: Rng): Item[] {
  const count = pItemCount(sp.params, "factorsmultiples");
  const kinds = pKinds(
    sp.params,
    "kinds",
    "factorsmultiples",
    ["kelipatan", "kelipatanSeq", "faktor", "kpk", "fpb", "patternX", "patternDiv"] as const,
    ["kelipatan", "kelipatanSeq", "faktor", "kpk", "fpb"],
  );
  // Optional difficulty ceiling (authored content passes it): faktor n,
  // kelipatan answers and pattern terms stay <= max. Defaults keep the
  // historical ranges.
  const max = pInt(sp.params, "max", "factorsmultiples", 48);
  // Pattern kinds only: multiplier/divisor upper bound of the sequence rule.
  const factorMax = pInt(sp.params, "factorMax", "factorsmultiples", 5);

  const multiplesUpTo = (b: number, upTo: number): number[] => {
    const marks: number[] = [];
    for (let m = b; m <= upTo; m += b) marks.push(m);
    return marks;
  };

  return buildItems(sp, count, () => {
    const kind = rng.pick(kinds);

    if (kind === "kelipatan") {
      const b = intIn(rng, 2, 9);
      const k = intIn(rng, 2, Math.max(2, Math.min(12, Math.floor(max / b))));
      const answer = b * k;
      return {
        id: "",
        prompt: `Kelipatan ke-${k} dari ${b} adalah ...`,
        answer: int(answer),
        answerType: "integer",
        hint: numberLineHint({
          min: 0,
          max: answer,
          step: b,
          marks: multiplesUpTo(b, answer),
          target: null,
        }),
      };
    }

    if (kind === "kelipatanSeq") {
      const b = intIn(rng, 2, 9);
      const k0 = intIn(rng, 1, Math.max(1, Math.min(5, Math.floor(max / b) - 3)));
      const t1 = b * k0;
      const answer = b * (k0 + 3);
      return {
        id: "",
        prompt: `Kelipatan berikutnya dari ${t1}, ${t1 + b}, ${t1 + 2 * b}, ... adalah ...`,
        answer: int(answer),
        answerType: "integer",
        hint: numberLineHint({
          min: 0,
          max: answer,
          step: b,
          marks: multiplesUpTo(b, answer),
          target: null,
        }),
      };
    }

    if (kind === "patternX" || kind === "patternDiv") {
      // 4-term geometric sequence: t1, t1*r, t1*r^2, ask t1*r^3 (ascending,
      // op "x") or t1, t1/r, t1/r^2, ask t1/r^3 (descending, op "div"). The
      // ratio is bounded by factorMax AND by the largest r whose cube still
      // fits inside max.
      let rMax = 1;
      while ((rMax + 1) ** 3 <= max && rMax + 1 <= factorMax) rMax++;
      if (rMax < 2) {
        throw new Error("factorsmultiples: max/factorMax too small for a 4-term pattern (need max >= 8 and factorMax >= 2)");
      }
      const r = intIn(rng, 2, rMax);
      if (kind === "patternX") {
        const t1 = intIn(rng, 1, Math.floor(max / r ** 3));
        const t2 = t1 * r;
        const t3 = t2 * r;
        const answer = t3 * r;
        return {
          id: "",
          prompt: `Suku berikutnya dari ${formatInt(t1)}, ${formatInt(t2)}, ${formatInt(t3)}, ... adalah ...`,
          answer: int(answer),
          answerType: "integer",
          hint: numberLineHint({ min: 0, max: answer, step: null, marks: [t1, t2, t3], target: null }),
        };
      }
      const k = intIn(rng, 1, Math.floor(max / r ** 3));
      const t1 = k * r ** 3;
      const t2 = k * r * r;
      const t3 = k * r;
      return {
        id: "",
        prompt: `Suku berikutnya dari ${formatInt(t1)}, ${formatInt(t2)}, ${formatInt(t3)}, ... adalah ...`,
        answer: int(k),
        answerType: "integer",
        hint: numberLineHint({ min: 0, max: t1, step: null, marks: [t1, t2, t3], target: null }),
      };
    }

    if (kind === "faktor") {
      const n = intIn(rng, 4, Math.max(4, Math.min(max, 200)));
      return {
        id: "",
        prompt: `Berapa banyak faktor dari ${n}?`,
        answer: int(divisorCount(n)),
        answerType: "integer",
        hint: baseTenHint({ variant: "factorPairs", n, n2: null }),
      };
    }

    if (kind === "kpk") {
      const { a, b } = drawWithRetry(
        200,
        ({ a, b }) => a !== b && lcm(a, b) <= max,
        () => ({ a: intIn(rng, 2, 12), b: intIn(rng, 2, 12) }),
      );
      const answer = lcm(a, b);
      return {
        id: "",
        prompt: `KPK dari ${a} dan ${b} adalah ...`,
        answer: int(answer),
        answerType: "integer",
        hint: numberLineHint({
          min: 0,
          max: answer,
          step: null,
          marks: multiplesUpTo(a, answer),
          marksB: multiplesUpTo(b, answer),
          target: null,
        }),
      };
    }

    // fpb: operands stay <= max, so the FPB answer (<= either operand) does too.
    const { a, b } = drawWithRetry(
      200,
      ({ a, b }) => a !== b && gcd(a, b) >= 2,
      () => ({ a: intIn(rng, 2, max), b: intIn(rng, 2, max) }),
    );
    return {
      id: "",
      prompt: `FPB dari ${a} dan ${b} adalah ...`,
      answer: int(gcd(a, b)),
      answerType: "integer",
      hint: baseTenHint({ variant: "factorPairs", n: a, n2: b }),
    };
  });
}

// ---------------------------------------------------------------------------

export const addsubFamily: GeneratorFamily = { id: "addsub", generate: generateAddsub };
export const multFamily: GeneratorFamily = { id: "mult", generate: generateMult };
export const divFamily: GeneratorFamily = { id: "div", generate: generateDiv };
export const placevalueFamily: GeneratorFamily = { id: "placevalue", generate: generatePlacevalue };
export const factorsmultiplesFamily: GeneratorFamily = {
  id: "factorsmultiples",
  generate: generateFactorsmultiples,
};
