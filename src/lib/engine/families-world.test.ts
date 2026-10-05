/**
 * Engine-seam tests for the measurement/geometry family additions (audit
 * findings 6-9): the new kinds generate verified items at the family's public
 * generate(stepParams, rng) boundary. Authored-content wiring is probed in
 * src/lib/server/family-params.test.ts through the real server path.
 */

import { describe, expect, it } from "vitest";

import { getFamily, registerBuiltinFamilies } from "./families";
import { createRng } from "./rng";
import type { Item } from "./types";
import { verifyFamilyItem } from "../../../tests/helpers/verifyItem";

type WorldFamily = "measurement" | "geometry";

function generate(family: WorldFamily, params: Record<string, unknown>, seed: number): Item[] {
  registerBuiltinFamilies();
  const fam = getFamily(family);
  if (!fam) throw new Error(`family ${family} missing`);
  return fam.generate({ step: 1, params }, createRng(seed));
}

describe("measurement shape kinds (finding 8: triangle/polygon keliling+luas)", () => {
  it("kelilingTriangle serves three-side sums", () => {
    for (const seed of [1, 7, 123]) {
      for (const item of generate(
        "measurement",
        { itemCount: 8, kinds: ["kelilingTriangle"] },
        seed,
      )) {
        const m = /^Keliling segitiga dengan sisi ([\d.]+) cm, ([\d.]+) cm, dan ([\d.]+) cm adalah \.\.\.$/.exec(
          item.prompt,
        );
        expect(m !== null, `prompt format: ${item.prompt}`).toBe(true);
        if (!m) continue;
        const sides = m.slice(1).map((s) => Number(s.replace(/\./g, "")));
        // Degenerate triangles (one side >= sum of the others) never appear.
        const [a, b, c] = sides as [number, number, number];
        expect(c < a + b && a < b + c && b < a + c, `degenerate triangle ${sides}`).toBe(true);
        expect(item.answer).toEqual({ kind: "unitValue", value: a + b + c, unit: "cm" });
        verifyFamilyItem("measurement", item);
      }
    }
  });

  it("kelilingPolygon serves regular pentagons, hexagons, and octagons", () => {
    for (const seed of [1, 7, 123]) {
      for (const item of generate("measurement", { itemCount: 8, kinds: ["kelilingPolygon"] }, seed)) {
        const m = /^Keliling (segi lima|segi enam|segi delapan) dengan panjang sisi ([\d.]+) cm adalah \.\.\.$/.exec(
          item.prompt,
        );
        expect(m !== null, `prompt format: ${item.prompt}`).toBe(true);
        if (!m) continue;
        const n = { "segi lima": 5, "segi enam": 6, "segi delapan": 8 }[m[1]!]!;
        const s = Number(m[2]!.replace(/\./g, ""));
        expect(item.answer).toEqual({ kind: "unitValue", value: n * s, unit: "cm" });
        verifyFamilyItem("measurement", item);
      }
    }
  });

  it("luasTriangle serves whole-number triangle areas", () => {
    for (const seed of [1, 7, 123]) {
      for (const item of generate("measurement", { itemCount: 8, kinds: ["luasTriangle"] }, seed)) {
        const m = /^Luas segitiga dengan alas ([\d.]+) cm dan tinggi ([\d.]+) cm adalah \.\.\.$/.exec(
          item.prompt,
        );
        expect(m !== null, `prompt format: ${item.prompt}`).toBe(true);
        if (!m) continue;
        const a = Number(m[1]!.replace(/\./g, ""));
        const t = Number(m[2]!.replace(/\./g, ""));
        expect((a * t) % 2).toBe(0);
        expect(item.answer).toEqual({ kind: "unitValue", value: (a * t) / 2, unit: "cm²" });
        verifyFamilyItem("measurement", item);
      }
    }
  });
});

describe("geometry compose kind (finding 8: shape-compose)", () => {
  it("compose serves pieces-of-squares areas bounded by max", () => {
    for (const seed of [1, 7, 123]) {
      const items = generate(
        "geometry",
        { itemCount: 8, kinds: ["compose"], pieces: 3, max: 200 },
        seed,
      );
      for (const item of items) {
        const m = /^Bangun datar disusun dari ([\d.]+) persegi dengan panjang sisi ([\d.]+) cm\. Berapa luas seluruh bangun\?$/.exec(
          item.prompt,
        );
        expect(m !== null, `prompt format: ${item.prompt}`).toBe(true);
        if (!m) continue;
        const pieces = Number(m[1]!.replace(/\./g, ""));
        const s = Number(m[2]!.replace(/\./g, ""));
        expect(pieces).toBe(3);
        expect(pieces * s * s).toBeLessThanOrEqual(200);
        expect(item.answer).toEqual({ kind: "unitValue", value: pieces * s * s, unit: "cm²" });
        verifyFamilyItem("geometry", item);
      }
    }
  });
});

describe("geometry supplement kind (finding 9: supplementary angles)", () => {
  it("supplement serves the berpelurus missing angle summing to 180", () => {
    for (const seed of [1, 7, 123]) {
      for (const item of generate("geometry", { itemCount: 8, kinds: ["supplement"], max: 360 }, seed)) {
        const m = /^Berapa besar sudut yang harus ditambahkan pada sudut (\d+)° agar menjadi sudut berpelurus\?$/.exec(
          item.prompt,
        );
        expect(m !== null, `supplement prompt format: ${item.prompt}`).toBe(true);
        if (!m) continue;
        const a = Number(m[1]);
        expect(item.answer).toEqual({ kind: "unitValue", value: 180 - a, unit: "derajat" });
        verifyFamilyItem("geometry", item);
      }
    }
  });
});

describe("measurement g->kg kind (finding 7)", () => {
  it("gToKg serves whole-kilogram grams->kg conversions", () => {
    for (const seed of [1, 7, 123]) {
      for (const item of generate("measurement", { itemCount: 8, kinds: ["gToKg"] }, seed)) {
        const m = /^([\d.]+) g = \.\.\. kg$/.exec(item.prompt);
        expect(m !== null, `gToKg prompt format: ${item.prompt}`).toBe(true);
        if (!m) continue;
        const grams = Number(m[1]!.replace(/\./g, ""));
        expect(grams % 1000).toBe(0);
        expect(item.answer).toEqual({ kind: "unitValue", value: grams / 1000, unit: "kg" });
        verifyFamilyItem("measurement", item);
      }
    }
  });
});

describe("measurement carry kind (finding 6: withCarry duration)", () => {
  it("jamMenitCarry serves compound durations with a leftover minute part", () => {
    for (const seed of [1, 7, 123]) {
      for (const item of generate(
        "measurement",
        { itemCount: 8, kinds: ["jamMenitCarry"] },
        seed,
      )) {
        const m = /^([\d.]+) jam ([\d.]+) menit = \.\.\. menit$/.exec(item.prompt);
        expect(m !== null, `carry prompt format: ${item.prompt}`).toBe(true);
        if (!m) continue;
        const h = Number(m[1]!.replace(/\./g, ""));
        const mnt = Number(m[2]!.replace(/\./g, ""));
        expect(mnt).toBeGreaterThanOrEqual(1);
        expect(item.answer).toEqual({ kind: "unitValue", value: h * 60 + mnt, unit: "menit" });
        verifyFamilyItem("measurement", item);
      }
    }
  });
});
