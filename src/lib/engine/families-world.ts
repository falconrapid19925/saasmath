/**
 * Generator families — measurement, geometry, datareading, wordproblems
 * (plan sections 3.3: the Pengukuran/Geometri/Data strands "are ours alone",
 * plus the soal-cerita shell pool).
 *
 * Parameters (itemCount required):
 * - measurement: kinds=["mToCm","cmToM","mmToCm","kgToG","gToKg",
 *   "jamToMenit","menitToJam","jamMenitCarry","keliling",
 *   "kelilingTriangle","kelilingPolygon","luas","luasTriangle"]
 * - geometry:    kinds=["sides","corners","triangleAngle","quadAngle",
 *   "complement","supplement","angleType","compose" (params: pieces, max)]
 * - datareading: kinds=["read","sum","diff"], rows=3, maxValue=30,
 *   contexts=["jualBuah","koleksi"]
 * - wordproblems: kinds=["total","difference","groups","share","moneyTotal",
 *   "moneyChange","moneyGroups"], max=1000, moneyMax=100000, moneyStep=500
 */

import { formatInt, formatMoney, int, rupiah, unit } from "./answers";
import { distinctIn, intIn, pInt, pItemCount, pKinds, pNum } from "./params";
import type { Rng } from "./rng";
import type { GeneratorFamily, Item, StepParams } from "./types";

import {
  baseTenHint,
  buildItems,
  numberLineHint,
  partWholeHint,
} from "./families-shared";

// ---------------------------------------------------------------------------
// measurement — konversi satuan, keliling, luas persegi panjang
// ---------------------------------------------------------------------------

const MEASURE_KINDS = [
  "mToCm",
  "cmToM",
  "mmToCm",
  "kgToG",
  "gToKg",
  "jamToMenit",
  "menitToJam",
  "jamMenitCarry",
  "keliling",
  "kelilingTriangle",
  "kelilingPolygon",
  "luas",
  "luasTriangle",
] as const;

function generateMeasurement(sp: StepParams, rng: Rng): Item[] {
  const count = pItemCount(sp.params, "measurement");
  const kinds = pKinds(sp.params, "kinds", "measurement", MEASURE_KINDS, MEASURE_KINDS);

  return buildItems(sp, count, () => {
    const kind = rng.pick(kinds);

    switch (kind) {
      case "mToCm": {
        const m = intIn(rng, 1, 10);
        return {
          id: "",
          prompt: `${formatInt(m)} m = ... cm`,
          answer: unit(m * 100, "cm"),
          answerType: "unitValue",
          hint: numberLineHint({
            min: 0,
            max: m * 100,
            step: 100,
            marks: [m * 100],
            jump: 100,
            target: null,
          }),
        };
      }
      case "cmToM": {
        const cm = 100 * intIn(rng, 1, 10);
        return {
          id: "",
          prompt: `${formatInt(cm)} cm = ... m`,
          answer: unit(cm / 100, "m"),
          answerType: "unitValue",
          hint: numberLineHint({
            min: 0,
            max: Math.max(1000, cm),
            step: 100,
            marks: [cm],
            jump: null,
            target: null,
          }),
        };
      }
      case "mmToCm": {
        const mm = 10 * intIn(rng, 1, 9);
        return {
          id: "",
          prompt: `${formatInt(mm)} mm = ... cm`,
          answer: unit(mm / 10, "cm"),
          answerType: "unitValue",
          hint: numberLineHint({
            min: 0,
            max: Math.max(100, mm),
            step: 10,
            marks: [mm],
            jump: null,
            target: null,
          }),
        };
      }
      case "kgToG": {
        const kg = intIn(rng, 1, 10);
        return {
          id: "",
          prompt: `${formatInt(kg)} kg = ... g`,
          answer: unit(kg * 1000, "g"),
          answerType: "unitValue",
          hint: numberLineHint({
            min: 0,
            max: kg * 1000,
            step: 1000,
            marks: [kg * 1000],
            jump: 1000,
            target: null,
          }),
        };
      }
      case "gToKg": {
        // Whole kilograms only: kelas 4 converts before decimals exist.
        const g = 1000 * intIn(rng, 1, 10);
        return {
          id: "",
          prompt: `${formatInt(g)} g = ... kg`,
          answer: unit(g / 1000, "kg"),
          answerType: "unitValue",
          hint: numberLineHint({
            min: 0,
            max: g,
            step: 1000,
            marks: [g],
            jump: 1000,
            target: null,
          }),
        };
      }
      case "jamToMenit": {
        const h = intIn(rng, 1, 12);
        return {
          id: "",
          prompt: `${formatInt(h)} jam = ... menit`,
          answer: unit(h * 60, "menit"),
          answerType: "unitValue",
          hint: numberLineHint({
            min: 0,
            max: h * 60,
            step: 60,
            marks: [h * 60],
            jump: 60,
            target: null,
          }),
        };
      }
      case "menitToJam": {
        const minutes = 60 * intIn(rng, 1, 10);
        return {
          id: "",
          prompt: `${formatInt(minutes)} menit = ... jam`,
          answer: unit(minutes / 60, "jam"),
          answerType: "unitValue",
          hint: numberLineHint({
            min: 0,
            max: Math.max(600, minutes),
            step: 60,
            marks: [minutes],
            jump: null,
            target: null,
          }),
        };
      }
      case "jamMenitCarry": {
        // withCarry (menit melewati 60 — menyimpan): compound source
        // converted to minutes; the child regroups the hours (x * 60) and
        // adds the leftover minutes. m >= 1 keeps the carry genuine.
        const h = intIn(rng, 1, 9);
        const m = intIn(rng, 1, 59);
        return {
          id: "",
          prompt: `${formatInt(h)} jam ${formatInt(m)} menit = ... menit`,
          answer: unit(h * 60 + m, "menit"),
          answerType: "unitValue",
          hint: partWholeHint(null, [h * 60, m], ["jam", "menit"]),
        };
      }
      case "keliling": {
        const p = intIn(rng, 5, 25);
        const l = intIn(rng, 2, p - 1);
        return {
          id: "",
          prompt: `Keliling persegi panjang dengan panjang ${formatInt(p)} cm dan lebar ${formatInt(l)} cm adalah ...`,
          answer: unit(2 * (p + l), "cm"),
          answerType: "unitValue",
          hint: partWholeHint(
            null,
            [p, l, p, l],
            ["panjang", "lebar", "panjang", "lebar"],
          ),
        };
      }
      case "kelilingTriangle": {
        // Three sides always satisfying the triangle inequality: c is drawn
        // strictly between |a-b| and a+b, so no degenerate triangle appears.
        const a = intIn(rng, 2, 12);
        const b = intIn(rng, 2, 12);
        const c = intIn(rng, Math.max(1, Math.abs(a - b) + 1), a + b - 1);
        return {
          id: "",
          prompt: `Keliling segitiga dengan sisi ${formatInt(a)} cm, ${formatInt(b)} cm, dan ${formatInt(c)} cm adalah ...`,
          answer: unit(a + b + c, "cm"),
          answerType: "unitValue",
          hint: partWholeHint(null, [a, b, c], ["sisi a", "sisi b", "sisi c"]),
        };
      }
      case "kelilingPolygon": {
        // Regular polygons from the kelas-5 set: pentagon, hexagon, octagon.
        const [name, n] = rng.pick(REGULAR_POLYGONS);
        const s = intIn(rng, 2, 12);
        return {
          id: "",
          prompt: `Keliling ${name} dengan panjang sisi ${formatInt(s)} cm adalah ...`,
          answer: unit(n * s, "cm"),
          answerType: "unitValue",
        };
      }
      case "luas": {
        const p = intIn(rng, 2, 12);
        const l = intIn(rng, 2, 12);
        return {
          id: "",
          prompt: `Luas persegi panjang dengan panjang ${formatInt(p)} cm dan lebar ${formatInt(l)} cm adalah ...`,
          answer: unit(p * l, "cm²"),
          answerType: "unitValue",
          hint: baseTenHint({ variant: "array", rows: p, cols: l }),
        };
      }
      case "luasTriangle": {
        // Even height keeps alas x tinggi even, so the halved area is a
        // whole number (decimals arrive only in kelas 5 fractions work).
        const alas = intIn(rng, 2, 12);
        const tinggi = 2 * intIn(rng, 1, 6);
        return {
          id: "",
          prompt: `Luas segitiga dengan alas ${formatInt(alas)} cm dan tinggi ${formatInt(tinggi)} cm adalah ...`,
          answer: unit((alas * tinggi) / 2, "cm²"),
          answerType: "unitValue",
        };
      }
    }
  });
}

// ---------------------------------------------------------------------------
// geometry — sifat bangun datar & sudut dasar
// ---------------------------------------------------------------------------

const GEOMETRY_KINDS = [
  "sides",
  "corners",
  "triangleAngle",
  "quadAngle",
  "complement",
  "supplement",
  "angleType",
  "compose",
] as const;

/** Regular polygons for the kelilingPolygon kind: [Bahasa name, side count]. */
const REGULAR_POLYGONS: ReadonlyArray<readonly [name: string, sides: number]> = [
  ["segi lima", 5],
  ["segi enam", 6],
  ["segi delapan", 8],
];

const PLANE_SHAPES: ReadonlyArray<readonly [name: string, corners: number]> = [
  ["segi tiga", 3],
  ["segi empat", 4],
  ["segi lima", 5],
  ["segi enam", 6],
  ["segi delapan", 8],
];

const ANGLE_FACTS: ReadonlyArray<readonly [name: string, degrees: number]> = [
  ["siku-siku", 90],
  ["lurus", 180],
  ["penuh", 360],
];

function generateGeometry(sp: StepParams, rng: Rng): Item[] {
  const count = pItemCount(sp.params, "geometry");
  const kinds = pKinds(sp.params, "kinds", "geometry", GEOMETRY_KINDS, GEOMETRY_KINDS);

  return buildItems(sp, count, () => {
    const kind = rng.pick(kinds);

    if (kind === "sides" || kind === "corners") {
      const [name, n] = rng.pick(PLANE_SHAPES);
      return {
        id: "",
        prompt:
          kind === "sides"
            ? `Bangun datar ${name} memiliki berapa sisi?`
            : `Bangun datar ${name} memiliki berapa sudut?`,
        answer: int(n),
        answerType: "integer",
      };
    }

    if (kind === "triangleAngle") {
      const a = intIn(rng, 20, 80);
      const b = intIn(rng, 20, Math.min(80, 160 - a));
      const third = 180 - a - b;
      return {
        id: "",
        prompt: `Dua sudut segitiga masing-masing ${a}° dan ${b}°. Berapa besar sudut ketiga?`,
        answer: unit(third, "derajat"),
        answerType: "unitValue",
        hint: partWholeHint(180, [a, b, null], ["sudut 1", "sudut 2", "sudut 3"]),
      };
    }

    if (kind === "quadAngle") {
      return {
        id: "",
        prompt: "Berapa derajat besar tiap sudut pada bangun persegi?",
        answer: unit(90, "derajat"),
        answerType: "unitValue",
      };
    }

    if (kind === "complement") {
      const a = intIn(rng, 10, 80);
      return {
        id: "",
        prompt: `Berapa besar sudut yang harus ditambahkan pada sudut ${a}° agar menjadi sudut siku-siku?`,
        answer: unit(90 - a, "derajat"),
        answerType: "unitValue",
        hint: partWholeHint(90, [a, null], ["sudut 1", "sudut 2"]),
      };
    }

    if (kind === "supplement") {
      // Berpelurus (supplementary): the two angles sum to 180° — the kelas-5
      // continuation of the siku-siku (complementary) kind.
      const a = intIn(rng, 10, 170);
      return {
        id: "",
        prompt: `Berapa besar sudut yang harus ditambahkan pada sudut ${a}° agar menjadi sudut berpelurus?`,
        answer: unit(180 - a, "derajat"),
        answerType: "unitValue",
        hint: partWholeHint(180, [a, null], ["sudut 1", "sudut 2"]),
      };
    }

    if (kind === "compose") {
      // Area of a compound shape made of identical unit squares: the side is
      // bounded so pieces x s x s stays within the step's `max`.
      const pieces = pInt(sp.params, "pieces", "geometry", 2);
      const max = pNum(sp.params, "max", "geometry", 100);
      const maxSide = Math.max(1, Math.floor(Math.sqrt(max / pieces)));
      const s = intIn(rng, 1, maxSide);
      return {
        id: "",
        prompt: `Bangun datar disusun dari ${formatInt(pieces)} persegi dengan panjang sisi ${formatInt(s)} cm. Berapa luas seluruh bangun?`,
        answer: unit(pieces * s * s, "cm²"),
        answerType: "unitValue",
        hint: partWholeHint(null, Array<number>(pieces).fill(s * s), Array(pieces).fill("persegi")),
      };
    }

    // angleType
    const [name, degrees] = rng.pick(ANGLE_FACTS);
    return {
      id: "",
      prompt: `Sudut ${name} berukuran ... derajat.`,
      answer: unit(degrees, "derajat"),
      answerType: "unitValue",
    };
  });
}

// ---------------------------------------------------------------------------
// datareading — baca tabel kecil tertanam, perbandingan satu langkah
// ---------------------------------------------------------------------------

const DATA_KINDS = ["read", "sum", "diff"] as const;

type DataContext = {
  intro: string;
  unit: string;
  labels: readonly string[];
  /** Question body for a "read" item about `label`. */
  readQuestion: (label: string) => string;
};

const DATA_CONTEXTS: ReadonlyArray<readonly [id: "jualBuah" | "koleksi", ctx: DataContext]> = [
  [
    "jualBuah",
    {
      intro: "Penjualan buah di kios Pak Budi",
      unit: "kg",
      labels: ["apel", "jeruk", "mangga", "pisang", "rambutan"],
      readQuestion: (label) => `Berapa kg ${label} yang terjual?`,
    },
  ],
  [
    "koleksi",
    {
      intro: "Koleksi permen Dina",
      unit: "buah",
      labels: ["stroberi", "cokelat", "melati", "kopi", "anggur"],
      readQuestion: (label) => `Berapa banyak permen ${label}?`,
    },
  ],
];

function generateDatareading(sp: StepParams, rng: Rng): Item[] {
  const count = pItemCount(sp.params, "datareading");
  const kinds = pKinds(sp.params, "kinds", "datareading", DATA_KINDS, DATA_KINDS);
  const rows = pInt(sp.params, "rows", "datareading", 3);
  const maxValue = pInt(sp.params, "maxValue", "datareading", 30);
  const contextIds = pKinds(
    sp.params,
    "contexts",
    "datareading",
    ["jualBuah", "koleksi"] as const,
    ["jualBuah", "koleksi"],
  );
  if (rows < 2 || rows > 5) throw new Error("datareading: rows must be in [2, 5]");

  // One table per set, shared by all items in it (drawn from the same rng
  // stream, so still fully deterministic).
  const [contextId] = contextIds;
  const ctx = DATA_CONTEXTS.find(([id]) => id === contextId)?.[1] ?? DATA_CONTEXTS[0]![1];
  const labels = rng.shuffle(ctx.labels).slice(0, rows);
  const values = distinctIn(rng, 5, Math.max(maxValue, 5 + rows), rows);
  const tableText = `${ctx.intro}: ${labels
    .map((l, i) => `${l} ${values[i]} ${ctx.unit}`)
    .join(", ")}.`;

  return buildItems(sp, count, () => {
    const kind = rng.pick(kinds);
    const i = intIn(rng, 0, rows - 1);
    let j = intIn(rng, 0, rows - 1);
    while (rows > 1 && j === i) j = (j + 1) % rows;

    if (kind === "read") {
      const label = labels[i] as string;
      return {
        id: "",
        prompt: `${tableText} ${ctx.readQuestion(label)}`,
        answer: unit(values[i] as number, ctx.unit),
        answerType: "unitValue",
      };
    }

    const a = labels[i] as string;
    const b = labels[j] as string;
    const va = values[i] as number;
    const vb = values[j] as number;
    if (kind === "sum") {
      return {
        id: "",
        prompt: `${tableText} Berapa jumlah ${a} dan ${b} seluruhnya?`,
        answer: unit(va + vb, ctx.unit),
        answerType: "unitValue",
      };
    }
    return {
      id: "",
      prompt: `${tableText} Berapa selisih ${a} dan ${b}?`,
      answer: unit(Math.abs(va - vb), ctx.unit),
      answerType: "unitValue",
    };
  });
}

// ---------------------------------------------------------------------------
// wordproblems — soal cerita satu langkah dari kumpulan templat
// ---------------------------------------------------------------------------

const WP_KINDS = [
  "total",
  "difference",
  "groups",
  "share",
  "moneyTotal",
  "moneyChange",
  "moneyGroups",
] as const;

const WP_NAMES = ["Ani", "Budi", "Citra", "Dewi", "Eko", "Fajar", "Gita", "Hadi"] as const;
const WP_OBJECTS = ["buku", "pensil", "kue", "jeruk", "apel", "permen", "donat", "mainan"] as const;

function generateWordproblems(sp: StepParams, rng: Rng): Item[] {
  const count = pItemCount(sp.params, "wordproblems");
  const kinds = pKinds(sp.params, "kinds", "wordproblems", WP_KINDS, WP_KINDS);
  const max = pInt(sp.params, "max", "wordproblems", 1000);
  const moneyMax = pInt(sp.params, "moneyMax", "wordproblems", 100000);
  const moneyStep = pInt(sp.params, "moneyStep", "wordproblems", 500);
  if (max < 40 || moneyMax < 40 * moneyStep) {
    throw new Error("wordproblems: need max >= 40 and moneyMax >= 40 * moneyStep");
  }

  const pickTwoNames = (): [string, string] => {
    const a = rng.pick(WP_NAMES);
    let b = rng.pick(WP_NAMES);
    while (b === a) b = rng.pick(WP_NAMES);
    return [a, b];
  };

  return buildItems(sp, count, () => {
    const kind = rng.pick(kinds);
    const obj = rng.pick(WP_OBJECTS);

    switch (kind) {
      case "total": {
        const a = intIn(rng, 10, max - 10);
        let b = intIn(rng, 10, max - 10);
        let guard = 0;
        while (b === a && guard < 20) {
          b = intIn(rng, 10, max - 10);
          guard++;
        }
        const [name] = pickTwoNames();
        return {
          id: "",
          prompt: `${name} memiliki ${formatInt(a)} ${obj} di keranjang dan ${formatInt(b)} ${obj} di tas. Berapa jumlah ${obj} seluruhnya?`,
          answer: int(a + b),
          answerType: "integer",
          hint: partWholeHint(null, [a, b], ["di keranjang", "di tas"]),
        };
      }
      case "difference": {
        const a = intIn(rng, 20, max);
        const b = intIn(rng, 1, a - 1);
        const [nameA, nameB] = pickTwoNames();
        return {
          id: "",
          prompt: `${nameA} memiliki ${formatInt(a)} ${obj} dan ${nameB} memiliki ${formatInt(b)} ${obj}. Berapa selisih ${obj} mereka?`,
          answer: int(a - b),
          answerType: "integer",
          hint: partWholeHint(a, [b, null], [`milik ${nameA}`, `milik ${nameB}`]),
        };
      }
      case "groups": {
        const g = intIn(rng, 2, 9);
        const per = intIn(rng, 2, Math.floor(max / g));
        return {
          id: "",
          prompt: `Ada ${formatInt(g)} kotak, tiap kotak berisi ${formatInt(per)} ${obj}. Berapa jumlah ${obj} seluruhnya?`,
          answer: int(g * per),
          answerType: "integer",
          hint: baseTenHint({
            variant: "equalGroups",
            groups: g,
            perGroup: per,
            total: null,
            remainder: 0,
            unknown: "total",
          }),
        };
      }
      case "share": {
        const k = intIn(rng, 2, 9);
        const per = intIn(rng, 2, Math.floor(max / k));
        const total = k * per;
        return {
          id: "",
          prompt: `Ada ${formatInt(total)} ${obj} dibagi rata kepada ${formatInt(k)} anak. Berapa ${obj} tiap anak?`,
          answer: int(per),
          answerType: "integer",
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
      case "moneyTotal": {
        const a = moneyStep * intIn(rng, 2, Math.floor(moneyMax / 2 / moneyStep));
        const b = moneyStep * intIn(rng, 2, Math.floor((moneyMax - a) / moneyStep));
        const [name] = pickTwoNames();
        return {
          id: "",
          prompt: `${name} membawa ${formatMoney(a)} dan ${formatMoney(b)}. Berapa jumlah uangnya?`,
          answer: rupiah(a + b),
          answerType: "moneyRupiah",
          hint: partWholeHint(null, [a, b], ["uang 1", "uang 2"]),
        };
      }
      case "moneyChange": {
        const price = moneyStep * intIn(rng, 2, Math.floor((moneyMax * 0.6) / moneyStep));
        const pay = price + moneyStep * intIn(rng, 2, Math.floor((moneyMax - price) / moneyStep));
        const [name] = pickTwoNames();
        return {
          id: "",
          prompt: `${name} membayar ${formatMoney(pay)} untuk barang seharga ${formatMoney(price)}. Berapa kembaliannya?`,
          answer: rupiah(pay - price),
          answerType: "moneyRupiah",
          hint: partWholeHint(pay, [price, null], ["dibayar", "kembalian"]),
        };
      }
      case "moneyGroups": {
        const k = intIn(rng, 2, 9);
        // Price capped at 18 steps (<= 9000 at the default step): realistic
        // per-item prices AND renderable as a base-ten hint.
        const price = moneyStep *
          intIn(
            rng,
            2,
            Math.max(2, Math.min(18, Math.floor(moneyMax / (2 * k) / moneyStep))),
          );
        return {
          id: "",
          prompt: `Harga 1 ${obj} ${formatMoney(price)}. Berapa harga ${formatInt(k)} ${obj}?`,
          answer: rupiah(price * k),
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
    }
  });
}

// ---------------------------------------------------------------------------

export const measurementFamily: GeneratorFamily = {
  id: "measurement",
  generate: generateMeasurement,
};
export const geometryFamily: GeneratorFamily = { id: "geometry", generate: generateGeometry };
export const datareadingFamily: GeneratorFamily = {
  id: "datareading",
  generate: generateDatareading,
};
export const wordproblemsFamily: GeneratorFamily = {
  id: "wordproblems",
  generate: generateWordproblems,
};
