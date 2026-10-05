/**
 * Generator-family roster (plan section 3.3). Content specs and skills.family
 * reference these ids; the engine builder registers implementations below.
 * Bilangan mirrors Kumon levels C-F; Pengukuran/Geometri/Data are ours alone.
 */

import type { GeneratorFamily } from "./types";

import { addsubFamily, divFamily, factorsmultiplesFamily, multFamily, placevalueFamily } from "./families-core";
import { decimalsFamily, fractionsFamily, moneyFamily } from "./families-rational";
import {
  datareadingFamily,
  geometryFamily,
  measurementFamily,
  wordproblemsFamily,
} from "./families-world";

export const GENERATOR_FAMILY_IDS = [
  "addsub", // penjumlahan & pengurangan (dengan menyimpan)
  "mult", // perkalian
  "div", // pembagian (termasuk hasil bagi bersisa)
  "placevalue", // nilai tempat, membandingkan & mengurutkan bilangan
  "factorsmultiples", // kelipatan dan faktor, KPK & FPB
  "fractions", // pecahan: senilai, membandingkan, operasi
  "decimals", // desimal: persepuluhan/perseratusan, membandingkan, operasi
  "money", // soal uang dalam ribuan rupiah
  "measurement", // satuan panjang/berat/waktu, keliling, luas, volume
  "geometry", // sifat bangun datar & ruang, sudut
  "datareading", // tabel, diagram gambar, diagram batang
  "wordproblems", // soal cerita multi-langkah
] as const;

export type GeneratorFamilyId = (typeof GENERATOR_FAMILY_IDS)[number];

/**
 * Registry keyed by family id. Empty at scaffold; the engine builder fills it
 * at startup via registerFamily. Lookup stays a Map so route handlers can
 * check `generatorFamilies.get(skill.family)` cheaply.
 */
export const generatorFamilies: Map<GeneratorFamilyId, GeneratorFamily> = new Map();

/** Register a family implementation. Throws on an id outside the roster. */
export function registerFamily(family: GeneratorFamily): void {
  if (!(GENERATOR_FAMILY_IDS as readonly string[]).includes(family.id)) {
    throw new Error(`Unknown generator family id: ${family.id}`);
  }
  generatorFamilies.set(family.id, family);
}

/** Look up a registered family; undefined when the engine has not filled it yet. */
export function getFamily(id: GeneratorFamilyId): GeneratorFamily | undefined {
  return generatorFamilies.get(id);
}

const BUILTIN_FAMILIES: readonly GeneratorFamily[] = [
  addsubFamily,
  multFamily,
  divFamily,
  placevalueFamily,
  factorsmultiplesFamily,
  fractionsFamily,
  decimalsFamily,
  moneyFamily,
  measurementFamily,
  geometryFamily,
  datareadingFamily,
  wordproblemsFamily,
];

/**
 * Register the 12 built-in family implementations. Idempotent; call once at
 * engine startup (server route handler init or client engine bootstrap) before
 * any getFamily/generateSet call. The registry stays empty until this runs,
 * per the scaffold contract.
 */
export function registerBuiltinFamilies(): void {
  for (const family of BUILTIN_FAMILIES) {
    registerFamily(family);
  }
}
