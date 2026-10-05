/**
 * Kelas 5 (Fase C) skills — plan 3.3: numbers to 1.000.000, KPK/FPB, the
 * four fraction operations (launch focus), decimals, plus the measurement,
 * geometry and data strands. Every skill's same-strand prerequisites are
 * kelas 4 skills (launch rule: kelas 4 before kelas 5 within a strand).
 *
 * Array order within a strand IS the display order (orderIndex) and must stay
 * a valid prerequisite topological order — the tests enforce both.
 */

import { defineSkill, type UnitDef } from "./types.ts";

// ---------------------------------------------------------------------------
// Bilangan
// ---------------------------------------------------------------------------

export const K5_BILANGAN_SKILLS = [
  defineSkill({
    id: "k5-placevalue-juta",
    grade: 5,
    strand: "Bilangan",
    unit: 1,
    titleId: "Bilangan sampai 1.000.000",
    family: "placevalue",
    steps: [
      { itemCount: 10, max: 1000000, mode: "identify" },
      { itemCount: 12, max: 1000000, mode: "compose" },
      { itemCount: 15, max: 1000000, mode: "decompose" },
    ],
    prereqIds: ["k4-placevalue-compare"],
    baseSctSecondsPerItem: 12,
  }),
  defineSkill({
    id: "k5-addsub-100000",
    grade: 5,
    strand: "Bilangan",
    unit: 1,
    titleId: "Penjumlahan dan Pengurangan sampai 100.000",
    family: "addsub",
    steps: [
      { itemCount: 10, min: 1000, max: 10000, operation: "mixed", regroup: true },
      { itemCount: 12, min: 1000, max: 50000, operation: "mixed", regroup: true },
      { itemCount: 15, min: 1000, max: 100000, operation: "mixed", regroup: true },
    ],
    prereqIds: ["k5-placevalue-juta", "k4-addsub-mixed"],
    baseSctSecondsPerItem: 20,
  }),
  defineSkill({
    id: "k5-mult-3x2",
    grade: 5,
    strand: "Bilangan",
    unit: 2,
    titleId: "Perkalian 3 Digit x 2 Digit",
    family: "mult",
    steps: [
      { itemCount: 8, minA: 100, maxA: 199, minB: 11, maxB: 19 },
      { itemCount: 10, minA: 100, maxA: 499, minB: 10, maxB: 49 },
      { itemCount: 12, minA: 100, maxA: 999, minB: 10, maxB: 99 },
    ],
    prereqIds: ["k4-mult-2x2"],
    baseSctSecondsPerItem: 60,
  }),
  defineSkill({
    id: "k5-div-long",
    grade: 5,
    strand: "Bilangan",
    unit: 2,
    titleId: "Pembagian Bersusun oleh 2 Digit",
    family: "div",
    steps: [
      { itemCount: 8, minDividend: 100, maxDividend: 300, minDivisor: 10, maxDivisor: 20, allowRemainder: false },
      { itemCount: 10, minDividend: 100, maxDividend: 600, minDivisor: 10, maxDivisor: 50, allowRemainder: false },
      { itemCount: 12, minDividend: 100, maxDividend: 999, minDivisor: 10, maxDivisor: 99, allowRemainder: false },
      { itemCount: 12, minDividend: 100, maxDividend: 999, minDivisor: 10, maxDivisor: 99, allowRemainder: true },
    ],
    prereqIds: ["k4-div-remainder"],
    baseSctSecondsPerItem: 45,
  }),
  defineSkill({
    id: "k5-kpk-fpb",
    grade: 5,
    strand: "Bilangan",
    unit: 3,
    titleId: "KPK dan FPB",
    family: "factorsmultiples",
    steps: [
      { itemCount: 8, max: 20, mode: "kpk" },
      { itemCount: 10, max: 50, mode: "fpb" },
      { itemCount: 12, max: 100, mode: "fpb" },
    ],
    prereqIds: ["k4-factors", "k4-multiples"],
    baseSctSecondsPerItem: 40,
  }),
  defineSkill({
    id: "k5-pattern",
    grade: 5,
    strand: "Bilangan",
    unit: 3,
    titleId: "Pola Bilangan dengan Perkalian dan Pembagian",
    family: "factorsmultiples",
    steps: [
      { itemCount: 10, max: 50, mode: "pattern", op: "x", factorMax: 3 },
      { itemCount: 12, max: 100, mode: "pattern", op: "x", factorMax: 5 },
      { itemCount: 12, max: 100, mode: "pattern", op: "div", factorMax: 5 },
    ],
    prereqIds: ["k4-multiples"],
    baseSctSecondsPerItem: 20,
  }),
  defineSkill({
    id: "k5-missing-number",
    grade: 5,
    strand: "Bilangan",
    unit: 4,
    titleId: "Kalimat Matematika dengan Bilangan Tak Diketahui",
    family: "addsub",
    steps: [
      { itemCount: 10, min: 10, max: 100, operation: "add", regroup: false, missingPosition: "result" },
      { itemCount: 12, min: 10, max: 100, operation: "sub", regroup: true, missingPosition: "result" },
      { itemCount: 12, min: 10, max: 1000, operation: "mixed", regroup: true, missingPosition: "operand" },
    ],
    prereqIds: ["k4-addsub-mixed"],
    baseSctSecondsPerItem: 20,
  }),
  defineSkill({
    id: "k5-missing-factor",
    grade: 5,
    strand: "Bilangan",
    unit: 4,
    titleId: "Kalimat Perkalian dengan Bilangan Tak Diketahui",
    family: "mult",
    steps: [
      { itemCount: 10, minA: 2, maxA: 9, minB: 2, maxB: 9, missingPosition: "result" },
      { itemCount: 12, minA: 2, maxA: 9, minB: 2, maxB: 9, missingPosition: "operand" },
      { itemCount: 12, minA: 2, maxA: 10, minB: 2, maxB: 10, missingPosition: "operand" },
    ],
    prereqIds: ["k4-mult-facts"],
    baseSctSecondsPerItem: 15,
  }),
  defineSkill({
    id: "k5-fract-add-diffden",
    grade: 5,
    strand: "Bilangan",
    unit: 5,
    titleId: "Penjumlahan Pecahan Beda Penyebut",
    family: "fractions",
    cpaModels: ["fraction-bar"],
    steps: [
      { itemCount: 8, mode: "add", sameDen: false, denominators: [2, 4] },
      { itemCount: 10, mode: "add", sameDen: false, denominators: [2, 3, 4, 6] },
      { itemCount: 12, mode: "add", sameDen: false, denominators: [2, 3, 4, 6, 8, 12], requireSimplify: true },
    ],
    prereqIds: ["k4-fract-add-sameden"],
    baseSctSecondsPerItem: 35,
  }),
  defineSkill({
    id: "k5-fract-sub-diffden",
    grade: 5,
    strand: "Bilangan",
    unit: 5,
    titleId: "Pengurangan Pecahan Beda Penyebut",
    family: "fractions",
    steps: [
      { itemCount: 8, mode: "sub", sameDen: false, denominators: [2, 4] },
      { itemCount: 10, mode: "sub", sameDen: false, denominators: [2, 3, 4, 6] },
      { itemCount: 12, mode: "sub", sameDen: false, denominators: [2, 3, 4, 6, 8, 12], requireSimplify: true },
    ],
    prereqIds: ["k5-fract-add-diffden"],
    baseSctSecondsPerItem: 35,
  }),
  defineSkill({
    id: "k5-fract-mult-whole",
    grade: 5,
    strand: "Bilangan",
    unit: 5,
    titleId: "Perkalian Pecahan dengan Bilangan Bulat",
    family: "fractions",
    steps: [
      { itemCount: 10, mode: "mult", sameDen: false, denominators: [2, 3, 4], maxWhole: 3 },
      { itemCount: 12, mode: "mult", sameDen: false, denominators: [2, 3, 4, 5, 6], maxWhole: 6 },
      { itemCount: 15, mode: "mult", sameDen: false, denominators: [2, 3, 4, 5, 6, 7, 8], maxWhole: 9, requireSimplify: true },
    ],
    prereqIds: ["k4-fract-add-sameden"],
    baseSctSecondsPerItem: 25,
  }),
  defineSkill({
    id: "k5-fract-div-whole",
    grade: 5,
    strand: "Bilangan",
    unit: 5,
    titleId: "Pembagian Pecahan dengan Bilangan Bulat",
    family: "fractions",
    steps: [
      { itemCount: 10, mode: "div", sameDen: false, denominators: [2, 3], maxWhole: 2 },
      { itemCount: 12, mode: "div", sameDen: false, denominators: [2, 3, 4], maxWhole: 5 },
      { itemCount: 15, mode: "div", sameDen: false, denominators: [2, 3, 4, 5, 6, 8], maxWhole: 9, requireSimplify: true },
    ],
    prereqIds: ["k5-fract-mult-whole"],
    baseSctSecondsPerItem: 35,
  }),
  defineSkill({
    id: "k5-fract-decimal-convert",
    grade: 5,
    strand: "Bilangan",
    unit: 6,
    titleId: "Mengubah Pecahan menjadi Desimal",
    family: "decimals",
    steps: [
      { itemCount: 10, mode: "convert", places: 1, denominators: [2, 5, 10] },
      { itemCount: 12, mode: "convert", places: 2, denominators: [2, 4, 5, 10] },
      { itemCount: 15, mode: "convert", places: 2, denominators: [2, 4, 5, 10, 20, 25, 50] },
    ],
    prereqIds: ["k4-fract-decimal-link"],
    baseSctSecondsPerItem: 25,
  }),
  defineSkill({
    id: "k5-decimal-order",
    grade: 5,
    strand: "Bilangan",
    unit: 6,
    titleId: "Mengurutkan Desimal sampai Satu Tempat Desimal",
    family: "decimals",
    steps: [
      { itemCount: 10, mode: "order", places: 1, max: 99, descending: false },
      { itemCount: 12, mode: "order", places: 1, max: 99, descending: true },
      { itemCount: 15, mode: "order", places: 1, max: 999, descending: true },
    ],
    prereqIds: ["k4-decimal-compare"],
    baseSctSecondsPerItem: 15,
  }),
  defineSkill({
    id: "k5-money",
    grade: 5,
    strand: "Bilangan",
    unit: 7,
    titleId: "Soal Uang sampai Satuan Juta Rupiah",
    family: "money",
    steps: [
      { itemCount: 10, mode: "add", max: 100000 },
      { itemCount: 12, mode: "sub", max: 500000 },
      { itemCount: 12, mode: "change", max: 1000000 },
    ],
    prereqIds: ["k4-money-addsub"],
    baseSctSecondsPerItem: 25,
  }),
  defineSkill({
    id: "k5-wordproblems",
    grade: 5,
    strand: "Bilangan",
    unit: 7,
    titleId: "Soal Cerita Dua Langkah",
    family: "wordproblems",
    steps: [
      { itemCount: 8, max: 1000, steps: 1, operations: ["add", "sub"] },
      { itemCount: 10, max: 1000, steps: 1, operations: ["add", "sub", "mult"] },
      { itemCount: 10, max: 10000, steps: 2, operations: ["add", "sub", "mult", "div"] },
    ],
    prereqIds: ["k5-addsub-100000", "k5-mult-3x2"],
    baseSctSecondsPerItem: 60,
  }),
] as const;

export const K5_BILANGAN_UNITS: UnitDef[] = [
  {
    grade: 5,
    strand: "Bilangan",
    unit: 1,
    titleId: "Bilangan sampai 1.000.000",
    skillIds: ["k5-placevalue-juta", "k5-addsub-100000"],
  },
  {
    grade: 5,
    strand: "Bilangan",
    unit: 2,
    titleId: "Perkalian dan Pembagian Lanjut",
    skillIds: ["k5-mult-3x2", "k5-div-long"],
  },
  {
    grade: 5,
    strand: "Bilangan",
    unit: 3,
    titleId: "KPK, FPB, dan Pola Bilangan",
    skillIds: ["k5-kpk-fpb", "k5-pattern"],
  },
  {
    grade: 5,
    strand: "Bilangan",
    unit: 4,
    titleId: "Kalimat Matematika",
    skillIds: ["k5-missing-number", "k5-missing-factor"],
  },
  {
    grade: 5,
    strand: "Bilangan",
    unit: 5,
    titleId: "Pecahan",
    skillIds: [
      "k5-fract-add-diffden",
      "k5-fract-sub-diffden",
      "k5-fract-mult-whole",
      "k5-fract-div-whole",
    ],
  },
  {
    grade: 5,
    strand: "Bilangan",
    unit: 6,
    titleId: "Desimal",
    skillIds: ["k5-fract-decimal-convert", "k5-decimal-order"],
  },
  {
    grade: 5,
    strand: "Bilangan",
    unit: 7,
    titleId: "Uang dan Soal Cerita",
    skillIds: ["k5-money", "k5-wordproblems"],
  },
];

// ---------------------------------------------------------------------------
// Pengukuran
// ---------------------------------------------------------------------------

export const K5_PENGUKURAN_SKILLS = [
  defineSkill({
    id: "k5-keliling-segitiga",
    grade: 5,
    strand: "Pengukuran",
    unit: 1,
    titleId: "Keliling Segitiga dan Segi Banyak",
    family: "measurement",
    steps: [
      { itemCount: 8, mode: "keliling", max: 50, shape: "triangle" },
      { itemCount: 10, mode: "keliling", max: 100, shape: "triangle" },
      { itemCount: 12, mode: "keliling", max: 200, shape: "polygon" },
    ],
    prereqIds: ["k4-keliling"],
    baseSctSecondsPerItem: 30,
  }),
  defineSkill({
    id: "k5-luas-segitiga",
    grade: 5,
    strand: "Pengukuran",
    unit: 1,
    titleId: "Luas Segitiga dan Segi Empat",
    family: "measurement",
    steps: [
      { itemCount: 8, mode: "luas", max: 20, shape: "triangle" },
      { itemCount: 10, mode: "luas", max: 40, shape: "triangle" },
      { itemCount: 12, mode: "luas", max: 80, shape: "triangle" },
    ],
    prereqIds: ["k4-luas"],
    baseSctSecondsPerItem: 30,
  }),
  defineSkill({
    id: "k5-time-duration",
    grade: 5,
    strand: "Pengukuran",
    unit: 1,
    titleId: "Durasi Waktu",
    family: "measurement",
    steps: [
      { itemCount: 8, mode: "duration", max: 60, units: ["menit", "jam"], withCarry: false },
      { itemCount: 10, mode: "duration", max: 180, units: ["menit", "jam"], withCarry: false },
      { itemCount: 12, mode: "duration", max: 600, units: ["menit", "jam"], withCarry: true },
    ],
    prereqIds: ["k4-add-1000"],
    baseSctSecondsPerItem: 30,
  }),
] as const;

export const K5_PENGUKURAN_UNITS: UnitDef[] = [
  {
    grade: 5,
    strand: "Pengukuran",
    unit: 1,
    titleId: "Keliling, Luas, dan Waktu",
    skillIds: ["k5-keliling-segitiga", "k5-luas-segitiga", "k5-time-duration"],
  },
];

// ---------------------------------------------------------------------------
// Geometri
// ---------------------------------------------------------------------------

export const K5_GEOMETRI_SKILLS = [
  defineSkill({
    id: "k5-angles",
    grade: 5,
    strand: "Geometri",
    unit: 1,
    titleId: "Mengukur dan Menghitung Sudut",
    family: "geometry",
    steps: [
      { itemCount: 10, mode: "angles", max: 180, angleTask: "classify" },
      { itemCount: 12, mode: "angles", max: 180, angleTask: "complement", sumTo: 90 },
      { itemCount: 15, mode: "angles", max: 360, angleTask: "supplement", sumTo: 180 },
    ],
    prereqIds: ["k4-shape-properties"],
    baseSctSecondsPerItem: 25,
  }),
] as const;

export const K5_GEOMETRI_UNITS: UnitDef[] = [
  {
    grade: 5,
    strand: "Geometri",
    unit: 1,
    titleId: "Sudut",
    skillIds: ["k5-angles"],
  },
];

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

export const K5_DATA_SKILLS = [
  defineSkill({
    id: "k5-bar-chart",
    grade: 5,
    strand: "Data",
    unit: 1,
    titleId: "Diagram Batang Berskala",
    family: "datareading",
    steps: [
      { itemCount: 6, mode: "bar", task: "compare", maxRows: 4, maxScale: 5, maxTotal: 200 },
      { itemCount: 8, mode: "bar", task: "total", maxRows: 5, maxScale: 10, maxTotal: 500 },
      { itemCount: 10, mode: "bar", task: "difference", maxRows: 6, maxScale: 10, maxTotal: 1000 },
    ],
    prereqIds: ["k4-bar-chart"],
    baseSctSecondsPerItem: 40,
  }),
  defineSkill({
    id: "k5-frequency-table",
    grade: 5,
    strand: "Data",
    unit: 1,
    titleId: "Tabel Frekuensi",
    family: "datareading",
    steps: [
      { itemCount: 6, mode: "table", task: "read", maxRows: 5, maxScale: 1, maxTotal: 100 },
      { itemCount: 8, mode: "table", task: "total", maxRows: 6, maxScale: 1, maxTotal: 300 },
      { itemCount: 10, mode: "table", task: "difference", maxRows: 8, maxScale: 1, maxTotal: 500 },
    ],
    prereqIds: ["k4-table-read"],
    baseSctSecondsPerItem: 40,
  }),
] as const;

export const K5_DATA_UNITS: UnitDef[] = [
  {
    grade: 5,
    strand: "Data",
    unit: 1,
    titleId: "Membaca Data Lanjut",
    skillIds: ["k5-bar-chart", "k5-frequency-table"],
  },
];
