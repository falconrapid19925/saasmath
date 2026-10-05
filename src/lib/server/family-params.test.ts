/**
 * Authored-content-to-generator bridge tests (plan-review finding): the
 * authored skill ladders (src/data/skills, keyed by mode/minA/maxA/…) must
 * reach the generator families through engineParamsFor — before the bridge,
 * families missed their param keys and silently served default-level,
 * off-topic items (k4-div-remainder served 0 remainder items, k4-round-ribuan
 * 0 rounding items, k4-mult-2x1 served 1x1 tables, k4-fract-unit served
 * kelas-5 add/sub, every datareading skill rendered the same table).
 *
 * Every probe here runs through the REAL server path: authored spec ->
 * skillSpecToRow -> generateSetItems (the exact call /api/session/next,
 * /api/sync and the PDF route make).
 */

import { describe, expect, it } from "vitest";

import { normalizeHint } from "@/lib/client/hints";
import { gcd, lcm } from "@/lib/engine/answers";
import { SKILL_SPECS, getSkillSpec, skillSpecToRow } from "@/data/skills";
import { generateSetItems } from "./engine";
import { engineParamsFor } from "./family-params";
import { verifyFamilyItem } from "../../../tests/helpers/verifyItem";
import type { Item } from "@/lib/engine/types";

const SEEDS = [1, 7, 123];
const SPEC_BY_ID = new Map(SKILL_SPECS.map((spec) => [spec.id, spec]));

function generateAuthored(skillId: string, step: number, seed: number): Item[] {
  const spec = SPEC_BY_ID.get(skillId);
  if (!spec) throw new Error(`unknown skill ${skillId}`);
  return generateSetItems(skillSpecToRow(spec), step, seed);
}

describe("engineParamsFor mapping rules", () => {
  it("maps div allowRemainder to the remainder kind and passes the ranges through", () => {
    expect(
      engineParamsFor("div", {
        itemCount: 10,
        minDividend: 10,
        maxDividend: 99,
        minDivisor: 2,
        maxDivisor: 9,
        allowRemainder: true,
      }),
    ).toEqual({
      itemCount: 10,
      kinds: ["remainder"],
      dividendMin: 10,
      dividendMax: 99,
      divisorMin: 2,
      divisorMax: 9,
    });
  });

  it("infers the mult kind from the authored ranges and passes the ranges through", () => {
    expect(
      engineParamsFor("mult", { itemCount: 10, minA: 2, maxA: 5, minB: 2, maxB: 5 }),
    ).toEqual({
      itemCount: 10,
      kinds: ["tables"],
      tablesMax: 5,
      aMin: 2,
      aMax: 5,
      bMin: 2,
      bMax: 5,
      missingPosition: "result",
    });
    expect(
      engineParamsFor("mult", { itemCount: 10, minA: 10, maxA: 29, minB: 2, maxB: 5 }),
    ).toEqual({
      itemCount: 10,
      kinds: ["2x1"],
      aMin: 10,
      aMax: 29,
      bMin: 2,
      bMax: 5,
      missingPosition: "result",
    });
    expect(
      engineParamsFor("mult", { itemCount: 10, minA: 11, maxA: 20, minB: 11, maxB: 15 }),
    ).toEqual({
      itemCount: 10,
      kinds: ["2x2"],
      aMin: 11,
      aMax: 20,
      bMin: 11,
      bMax: 15,
      missingPosition: "result",
    });
  });

  it("passes an authored operand missingPosition through verbatim", () => {
    expect(
      engineParamsFor("addsub", {
        itemCount: 12,
        min: 10,
        max: 1000,
        operation: "mixed",
        regroup: true,
        missingPosition: "operand",
      }).missingPosition,
    ).toBe("operand");
    expect(
      engineParamsFor("mult", {
        itemCount: 12,
        minA: 2,
        maxA: 9,
        minB: 2,
        maxB: 9,
        missingPosition: "operand",
      }).missingPosition,
    ).toBe("operand");
  });

  it("passes the addsub operand floor through as the engine min", () => {
    expect(
      engineParamsFor("addsub", {
        itemCount: 10,
        min: 1000,
        max: 10000,
        operation: "mixed",
        regroup: true,
      }),
    ).toEqual({
      itemCount: 10,
      min: 1000,
      max: 10000,
      kinds: ["add", "sub"],
      regroup: true,
      missingPosition: "result",
    });
  });

  it("maps placevalue modes including round", () => {
    expect(
      engineParamsFor("placevalue", { itemCount: 10, max: 9999, mode: "round", roundTo: 100 }),
    ).toEqual({ itemCount: 10, max: 9999, kinds: ["round"], roundTo: 100 });
    expect(
      engineParamsFor("placevalue", { itemCount: 10, max: 9999, mode: "identify" }).kinds,
    ).toEqual(["digitValue"]);
  });
});

describe("reviewer probes: authored content reaches the generators", () => {
  it("k4-div-remainder serves remainder items at every step and seed", () => {
    for (const step of [1, 2, 3]) {
      for (const seed of SEEDS) {
        const items = generateAuthored("k4-div-remainder", step, seed);
        expect(items.length).toBeGreaterThan(0);
        for (const item of items) {
          expect(item.prompt).toMatch(/^Sisa dari /);
        }
      }
    }
  });

  it("k4-round-ribuan serves rounding items at every step", () => {
    const roundTos = [1000, 100, 10];
    for (const step of [1, 2, 3]) {
      for (const seed of SEEDS) {
        const items = generateAuthored("k4-round-ribuan", step, seed);
        expect(items.length).toBeGreaterThan(0);
        for (const item of items) {
          const m = /^Membulatkan ([\d.]+) ke ([\d.]+) terdekat adalah \.\.\.$/.exec(item.prompt);
          expect(m !== null, `round prompt format: ${item.prompt}`);
          if (!m) continue;
          const n = Number(m[1]!.replace(/\./g, ""));
          const roundTo = Number(m[2]!.replace(/\./g, ""));
          expect(roundTo).toBe(roundTos[step - 1]);
          expect(item.answer).toEqual({ kind: "integer", value: Math.round(n / roundTo) * roundTo });
        }
      }
    }
  });

  it("k4-mult-2x1 serves 2-digit x 1-digit items, not 1x1 tables", () => {
    for (const seed of SEEDS) {
      for (const item of generateAuthored("k4-mult-2x1", 1, seed)) {
        const m = /^([\d.]+) × ([\d.]+) = \.\.\.$/.exec(item.prompt);
        expect(m !== null, `mult prompt format: ${item.prompt}`).toBe(true);
        if (!m) continue;
        const a = Number(m[1]!.replace(/\./g, ""));
        const b = Number(m[2]!.replace(/\./g, ""));
        expect(a).toBeGreaterThanOrEqual(10);
        expect(b).toBeLessThanOrEqual(9);
      }
    }
  });

  it("k4-fract-unit serves no different-denominator add/sub (kelas-5 content)", () => {
    for (const step of [1, 2, 3]) {
      for (const seed of SEEDS) {
        for (const item of generateAuthored("k4-fract-unit", step, seed)) {
          expect(item.prompt).not.toMatch(/ \+ | - /);
          expect(item.prompt).toMatch(/^Manakah pecahan/);
        }
      }
    }
  });

  it("k5-addsub-100000 serves operands at or above the authored min", () => {
    for (const step of [1, 2, 3]) {
      for (const seed of SEEDS) {
        for (const item of generateAuthored("k5-addsub-100000", step, seed)) {
          const m = /^([\d.]+) ([+-]) ([\d.]+) = \.\.\.$/.exec(item.prompt);
          expect(m !== null, `addsub prompt format: ${item.prompt}`).toBe(true);
          if (!m) continue;
          expect(Number(m[1]!.replace(/\./g, ""))).toBeGreaterThanOrEqual(1000);
          expect(Number(m[3]!.replace(/\./g, ""))).toBeGreaterThanOrEqual(1000);
        }
      }
    }
  });

  it("k5-missing-number step 3 serves missing-operand add/sub items", () => {
    const spec = getSkillSpec("k5-missing-number");
    expect((spec.steps[2]!.params as { missingPosition: string }).missingPosition).toBe("operand");
    for (const seed of SEEDS) {
      for (const item of generateAuthored("k5-missing-number", 3, seed)) {
        expect(item.prompt).toMatch(/^(?:\.\.\. [\d.]*|[\d.]+) [+-] (?:\.\.\.|[\d.]+) = [\d.]+$/);
        expect(item.prompt).not.toMatch(/= \.\.\.$/);
      }
    }
  });

  it("k5-missing-factor serves missing-factor items at steps 2-3 and result items at step 1", () => {
    for (const seed of SEEDS) {
      for (const item of generateAuthored("k5-missing-factor", 1, seed)) {
        expect(item.prompt).toMatch(/^[\d.]+ × [\d.]+ = \.\.\.$/);
      }
      for (const step of [2, 3]) {
        for (const item of generateAuthored("k5-missing-factor", step, seed)) {
          expect(item.prompt).toMatch(/^(?:\.\.\. × [\d.]+|[\d.]+ × \.\.\.) = [\d.]+$/);
        }
      }
    }
  });

  it("k4-mult-3x1 and k5-mult-3x2 honor the authored 3-digit operand ranges", () => {
    for (const seed of SEEDS) {
      for (const item of generateAuthored("k4-mult-3x1", 3, seed)) {
        const m = /^([\d.]+) × ([\d.]+) = \.\.\.$/.exec(item.prompt);
        expect(m !== null, `mult prompt format: ${item.prompt}`).toBe(true);
        if (!m) continue;
        expect(Number(m[1]!.replace(/\./g, ""))).toBeGreaterThanOrEqual(100);
      }
      for (const item of generateAuthored("k5-mult-3x2", 1, seed)) {
        const m = /^([\d.]+) × ([\d.]+) = \.\.\.$/.exec(item.prompt);
        expect(m !== null, `mult prompt format: ${item.prompt}`).toBe(true);
        if (!m) continue;
        const a = Number(m[1]!.replace(/\./g, ""));
        const b = Number(m[2]!.replace(/\./g, ""));
        expect(a >= 100 && a <= 199).toBe(true);
        expect(b >= 11 && b <= 19).toBe(true);
      }
    }
  });

  it("k4-mult-facts keeps b within the authored maxB per step", () => {
    for (const seed of SEEDS) {
      for (const item of generateAuthored("k4-mult-facts", 2, seed)) {
        const m = /^([\d.]+) × ([\d.]+) = \.\.\.$/.exec(item.prompt);
        expect(m !== null, `mult prompt format: ${item.prompt}`).toBe(true);
        if (!m) continue;
        expect(Number(m[2]!.replace(/\./g, ""))).toBeLessThanOrEqual(5);
      }
    }
  });

  it("k5-div-long serves 3-digit dividends and 2-digit divisors per the authored floors", () => {
    for (const step of [1, 2, 3]) {
      for (const seed of SEEDS) {
        for (const item of generateAuthored("k5-div-long", step, seed)) {
          const m = /^([\d.]+) : ([\d.]+) = \.\.\.$/.exec(item.prompt);
          expect(m !== null, `div prompt format: ${item.prompt}`).toBe(true);
          if (!m) continue;
          const a = Number(m[1]!.replace(/\./g, ""));
          const b = Number(m[2]!.replace(/\./g, ""));
          expect(a).toBeGreaterThanOrEqual(100);
          expect(b).toBeGreaterThanOrEqual(10);
        }
      }
    }
  });

  it("k4-div-facts keeps dividends and divisors inside the authored ranges", () => {
    for (const seed of SEEDS) {
      for (const item of generateAuthored("k4-div-facts", 4, seed)) {
        const m = /^([\d.]+) : ([\d.]+) = \.\.\.$/.exec(item.prompt);
        expect(m !== null, `div prompt format: ${item.prompt}`).toBe(true);
        if (!m) continue;
        const a = Number(m[1]!.replace(/\./g, ""));
        const b = Number(m[2]!.replace(/\./g, ""));
        expect(a >= 2 && a <= 100).toBe(true);
        expect(b >= 2 && b <= 10).toBe(true);
      }
    }
  });

  it("maps pattern mode to the geometric sequence kinds with the ratio bound", () => {
    expect(
      engineParamsFor("factorsmultiples", { itemCount: 10, max: 100, mode: "pattern", op: "x", factorMax: 5 }),
    ).toEqual({ itemCount: 10, max: 100, kinds: ["patternX"], factorMax: 5 });
    expect(
      engineParamsFor("factorsmultiples", { itemCount: 10, max: 50, mode: "pattern", op: "div", factorMax: 3 }).kinds,
    ).toEqual(["patternDiv"]);
    expect(
      engineParamsFor("factorsmultiples", { itemCount: 10, max: 50, mode: "pattern" }).kinds,
    ).toEqual(["patternX"]);
  });

  it("k5-pattern serves geometric sequences matching the authored op and factorMax", () => {
    const patternSteps = [
      { max: 50, factorMax: 3, op: "x" },
      { max: 100, factorMax: 5, op: "x" },
      { max: 100, factorMax: 5, op: "div" },
    ] as const;
    for (const [index, authored] of patternSteps.entries()) {
      for (const seed of SEEDS) {
        for (const item of generateAuthored("k5-pattern", index + 1, seed)) {
          const m = /^Suku berikutnya dari ([\d.]+), ([\d.]+), ([\d.]+), \.\.\. adalah \.\.\.$/.exec(item.prompt);
          expect(m !== null, `pattern prompt format: ${item.prompt}`).toBe(true);
          if (!m) continue;
          const t1 = Number(m[1]!.replace(/\./g, ""));
          const t2 = Number(m[2]!.replace(/\./g, ""));
          const t3 = Number(m[3]!.replace(/\./g, ""));
          if (authored.op === "x") {
            const r = t2 / t1;
            expect(Number.isInteger(r) && r >= 2 && r <= authored.factorMax).toBe(true);
            expect(t3 === t1 * r * r).toBe(true);
            expect(item.answer.kind === "integer" && item.answer.value === t3 * r).toBe(true);
            expect(item.answer.kind === "integer" && item.answer.value <= authored.max).toBe(true);
          } else {
            const r = t1 / t2;
            expect(Number.isInteger(r) && r >= 2 && r <= authored.factorMax).toBe(true);
            expect(t3 === t1 / (r * r)).toBe(true);
            expect(item.answer.kind === "integer" && item.answer.value === t3 / r).toBe(true);
            expect(t1 <= authored.max).toBe(true);
          }
        }
      }
    }
  });

  it("k5-kpk-fpb keeps KPK answers and FPB operands within the authored max", () => {
    for (const seed of SEEDS) {
      for (const item of generateAuthored("k5-kpk-fpb", 1, seed)) {
        const m = /^KPK dari (\d+) dan (\d+) adalah \.\.\.$/.exec(item.prompt);
        expect(m !== null, `kpk prompt format: ${item.prompt}`).toBe(true);
        if (!m) continue;
        expect(lcm(Number(m[1]), Number(m[2]))).toBeLessThanOrEqual(20);
      }
      for (const item of generateAuthored("k5-kpk-fpb", 2, seed)) {
        const m = /^FPB dari (\d+) dan (\d+) adalah \.\.\.$/.exec(item.prompt);
        expect(m !== null, `fpb prompt format: ${item.prompt}`).toBe(true);
        if (!m) continue;
        expect(Number(m[1])).toBeLessThanOrEqual(50);
        expect(Number(m[2])).toBeLessThanOrEqual(50);
      }
    }
  });

  it("maps duration withCarry to the compound-to-minutes carry kind", () => {
    expect(
      engineParamsFor("measurement", {
        itemCount: 8,
        mode: "duration",
        max: 60,
        units: ["menit", "jam"],
        withCarry: false,
      }).kinds,
    ).toEqual(["menitToJam"]);
    expect(
      engineParamsFor("measurement", {
        itemCount: 12,
        mode: "duration",
        max: 600,
        units: ["menit", "jam"],
        withCarry: true,
      }).kinds,
    ).toEqual(["jamMenitCarry"]);
  });

  it("k5-time-duration serves exact menit->jam items, then carry items at step 3", () => {
    for (const seed of SEEDS) {
      for (const item of generateAuthored("k5-time-duration", 1, seed)) {
        const m = /^([\d.]+) menit = \.\.\. jam$/.exec(item.prompt);
        expect(m !== null, `duration prompt format: ${item.prompt}`).toBe(true);
        if (!m) continue;
        const minutes = Number(m[1]!.replace(/\./g, ""));
        expect(minutes % 60).toBe(0);
        expect(item.answer).toEqual({ kind: "unitValue", value: minutes / 60, unit: "jam" });
      }
      for (const item of generateAuthored("k5-time-duration", 3, seed)) {
        const m = /^([\d.]+) jam ([\d.]+) menit = \.\.\. menit$/.exec(item.prompt);
        expect(m !== null, `carry prompt format: ${item.prompt}`).toBe(true);
        if (!m) continue;
        const h = Number(m[1]!.replace(/\./g, ""));
        const mnt = Number(m[2]!.replace(/\./g, ""));
        expect(mnt, "carry item without leftover minutes").toBeGreaterThanOrEqual(1);
        expect(item.answer).toEqual({ kind: "unitValue", value: h * 60 + mnt, unit: "menit" });
      }
    }
  });

  it("maps the g|kg pair to gToKg for toLarger instead of re-serving kgToG", () => {
    expect(
      engineParamsFor("measurement", {
        itemCount: 10,
        mode: "convert",
        max: 5000,
        units: ["g", "kg"],
        direction: "toLarger",
      }).kinds,
    ).toEqual(["gToKg"]);
    expect(
      engineParamsFor("measurement", {
        itemCount: 15,
        mode: "convert",
        max: 10000,
        units: ["g", "kg"],
        direction: "mixed",
      }).kinds,
    ).toEqual(["kgToG", "gToKg"]);
    expect(
      engineParamsFor("measurement", {
        itemCount: 10,
        mode: "convert",
        max: 2000,
        units: ["g", "kg"],
        direction: "toSmaller",
      }).kinds,
    ).toEqual(["kgToG"]);
  });

  it("k4-weight-units serves g->kg items at the toLarger step, kg->g at toSmaller", () => {
    for (const seed of SEEDS) {
      for (const item of generateAuthored("k4-weight-units", 1, seed)) {
        const m = /^([\d.]+) kg = \.\.\. g$/.exec(item.prompt);
        expect(m !== null, `toSmaller prompt format: ${item.prompt}`).toBe(true);
        if (!m) continue;
        expect(item.answer).toEqual({
          kind: "unitValue",
          value: Number(m[1]!.replace(/\./g, "")) * 1000,
          unit: "g",
        });
      }
      for (const item of generateAuthored("k4-weight-units", 2, seed)) {
        const m = /^([\d.]+) g = \.\.\. kg$/.exec(item.prompt);
        expect(m !== null, `toLarger prompt format: ${item.prompt}`).toBe(true);
        if (!m) continue;
        const grams = Number(m[1]!.replace(/\./g, ""));
        expect(grams % 1000, "g->kg item not a whole number of kg").toBe(0);
        expect(item.answer).toEqual({ kind: "unitValue", value: grams / 1000, unit: "kg" });
      }
    }
  });

  it("maps keliling/luas shape to the triangle, polygon, and rectangle kinds", () => {
    expect(engineParamsFor("measurement", { itemCount: 8, mode: "keliling", max: 25 }).kinds).toEqual([
      "keliling",
    ]);
    expect(
      engineParamsFor("measurement", { itemCount: 8, mode: "keliling", max: 50, shape: "triangle" })
        .kinds,
    ).toEqual(["kelilingTriangle"]);
    expect(
      engineParamsFor("measurement", { itemCount: 12, mode: "keliling", max: 200, shape: "polygon" })
        .kinds,
    ).toEqual(["kelilingPolygon"]);
    expect(
      engineParamsFor("measurement", { itemCount: 8, mode: "luas", max: 20, shape: "triangle" }).kinds,
    ).toEqual(["luasTriangle"]);
    expect(
      engineParamsFor("measurement", { itemCount: 8, mode: "luas", max: 12, shape: "rectangle" }).kinds,
    ).toEqual(["luas"]);
  });

  it("maps geometry compose to the compose kind with pieces and max", () => {
    expect(
      engineParamsFor("geometry", { itemCount: 8, mode: "compose", max: 100, pieces: 2 }),
    ).toEqual({ itemCount: 8, kinds: ["compose"], pieces: 2, max: 100 });
  });

  it("k5-keliling-segitiga serves triangle and polygon keliling per the authored shape", () => {
    for (const seed of SEEDS) {
      for (const item of generateAuthored("k5-keliling-segitiga", 1, seed)) {
        const m = /^Keliling segitiga dengan sisi ([\d.]+) cm, ([\d.]+) cm, dan ([\d.]+) cm adalah \.\.\.$/.exec(
          item.prompt,
        );
        expect(m !== null, `triangle keliling prompt format: ${item.prompt}`).toBe(true);
        if (!m) continue;
        const sides = m.slice(1).map((s) => Number(s.replace(/\./g, "")));
        expect(item.answer).toEqual({
          kind: "unitValue",
          value: sides[0]! + sides[1]! + sides[2]!,
          unit: "cm",
        });
      }
      for (const item of generateAuthored("k5-keliling-segitiga", 3, seed)) {
        const m = /^Keliling (segi lima|segi enam|segi delapan) dengan panjang sisi ([\d.]+) cm adalah \.\.\.$/.exec(
          item.prompt,
        );
        expect(m !== null, `polygon keliling prompt format: ${item.prompt}`).toBe(true);
        if (!m) continue;
        const n = { "segi lima": 5, "segi enam": 6, "segi delapan": 8 }[m[1]!]!;
        const s = Number(m[2]!.replace(/\./g, ""));
        expect(item.answer).toEqual({ kind: "unitValue", value: n * s, unit: "cm" });
      }
    }
  });

  it("k5-luas-segitiga serves triangle luas items with whole-number areas", () => {
    for (const seed of SEEDS) {
      for (const item of generateAuthored("k5-luas-segitiga", 2, seed)) {
        const m = /^Luas segitiga dengan alas ([\d.]+) cm dan tinggi ([\d.]+) cm adalah \.\.\.$/.exec(
          item.prompt,
        );
        expect(m !== null, `triangle luas prompt format: ${item.prompt}`).toBe(true);
        if (!m) continue;
        const a = Number(m[1]!.replace(/\./g, ""));
        const t = Number(m[2]!.replace(/\./g, ""));
        expect((a * t) % 2, "triangle luas area not whole").toBe(0);
        expect(item.answer).toEqual({ kind: "unitValue", value: (a * t) / 2, unit: "cm²" });
      }
    }
  });

  it("maps the supplement angleTask to the supplement kind instead of falling back to complement", () => {
    expect(
      engineParamsFor("geometry", { itemCount: 15, mode: "angles", max: 360, angleTask: "supplement", sumTo: 180 })
        .kinds,
    ).toEqual(["supplement"]);
    expect(
      engineParamsFor("geometry", { itemCount: 12, mode: "angles", max: 180, angleTask: "complement", sumTo: 90 })
        .kinds,
    ).toEqual(["complement"]);
    expect(
      engineParamsFor("geometry", { itemCount: 10, mode: "angles", max: 180, angleTask: "classify" }).kinds,
    ).toEqual(["angleType"]);
  });

  it("k5-angles serves siku-siku complement items at step 2 and berpelurus supplement items at step 3", () => {
    for (const seed of SEEDS) {
      for (const item of generateAuthored("k5-angles", 2, seed)) {
        const m = /^Berapa besar sudut yang harus ditambahkan pada sudut (\d+)° agar menjadi sudut siku-siku\?$/.exec(
          item.prompt,
        );
        expect(m !== null, `complement prompt format: ${item.prompt}`).toBe(true);
        if (!m) continue;
        const a = Number(m[1]);
        expect(item.answer).toEqual({ kind: "unitValue", value: 90 - a, unit: "derajat" });
      }
      for (const item of generateAuthored("k5-angles", 3, seed)) {
        const m = /^Berapa besar sudut yang harus ditambahkan pada sudut (\d+)° agar menjadi sudut berpelurus\?$/.exec(
          item.prompt,
        );
        expect(m !== null, `supplement prompt format: ${item.prompt}`).toBe(true);
        if (!m) continue;
        const a = Number(m[1]);
        expect(item.answer).toEqual({ kind: "unitValue", value: 180 - a, unit: "derajat" });
      }
    }
  });

  it("passes fractions denominators, maxWhole, and requireSimplify through to the engine", () => {
    expect(
      engineParamsFor("fractions", {
        itemCount: 10,
        mode: "mult",
        sameDen: false,
        denominators: [2, 3, 4],
        maxWhole: 3,
      }),
    ).toEqual({
      itemCount: 10,
      kinds: ["multWhole"],
      maxDen: 4,
      denominators: [2, 3, 4],
      maxWhole: 3,
    });
    expect(
      engineParamsFor("fractions", {
        itemCount: 15,
        mode: "add",
        sameDen: true,
        denominators: [2, 3, 4, 5, 6, 7, 8, 9, 10],
        requireSimplify: true,
      }),
    ).toEqual({
      itemCount: 15,
      kinds: ["addSame"],
      maxDen: 10,
      denominators: [2, 3, 4, 5, 6, 7, 8, 9, 10],
      requireSimplify: true,
    });
  });

  it("k4-fract-unit serves only authored denominators at every step", () => {
    const authored = [[2, 3, 4], [2, 3, 4, 5, 6], [2, 3, 4, 5, 6, 8, 10]];
    for (const step of [1, 2, 3]) {
      for (const seed of SEEDS) {
        for (const item of generateAuthored("k4-fract-unit", step, seed)) {
          for (const m of item.prompt.matchAll(/(\d+)\/(\d+)/g)) {
            expect(
              authored[step - 1]!.includes(Number(m[2])),
              `denominator ${m[2]} outside authored set: ${item.prompt}`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it("k5-fract-mult-whole and k5-fract-div-whole bound the whole operand by maxWhole", () => {
    const multMaxWholes = [3, 6, 9];
    const divMaxWholes = [2, 5, 9];
    for (const step of [1, 2, 3]) {
      for (const seed of SEEDS) {
        for (const item of generateAuthored("k5-fract-mult-whole", step, seed)) {
          const m = /^(\d+)\/(\d+) × (\d+) = \.\.\.$/.exec(item.prompt);
          expect(m !== null, `mult prompt format: ${item.prompt}`).toBe(true);
          if (!m) continue;
          expect(Number(m[3])).toBeLessThanOrEqual(multMaxWholes[step - 1]!);
        }
        for (const item of generateAuthored("k5-fract-div-whole", step, seed)) {
          const m = /^(\d+)\/(\d+) : (\d+) = \.\.\.$/.exec(item.prompt);
          expect(m !== null, `div prompt format: ${item.prompt}`).toBe(true);
          if (!m) continue;
          expect(Number(m[3])).toBeLessThanOrEqual(divMaxWholes[step - 1]!);
        }
      }
    }
  });

  it("k4-fract-add-sameden step 3 serves simplified canonical answers", () => {
    for (const seed of SEEDS) {
      for (const item of generateAuthored("k4-fract-add-sameden", 3, seed)) {
        const m = /^(\d+)\/(\d+) \+ (\d+)\/(\d+) = \.\.\.$/.exec(item.prompt);
        expect(m !== null, `add prompt format: ${item.prompt}`).toBe(true);
        if (!m) continue;
        const n1 = Number(m[1]);
        const d1 = Number(m[2]);
        const n2 = Number(m[3]);
        const d2 = Number(m[4]);
        expect(item.answer.kind === "fraction").toBe(true);
        if (item.answer.kind !== "fraction") continue;
        expect(
          gcd(item.answer.n, item.answer.d),
          `answer not simplified: ${item.prompt}`,
        ).toBe(1);
        expect(Math.abs(item.answer.n / item.answer.d - (n1 * d2 + n2 * d1) / (d1 * d2))).toBeLessThan(
          1e-9,
        );
      }
    }
  });

  it("k4-shape-compose serves compose items matching the authored pieces and max", () => {
    for (const step of [1, 2, 3]) {
      const authoredMax = [100, 200, 500][step - 1]!;
      const authoredPieces = step + 1; // authored pieces are 2, 3, 4
      for (const seed of SEEDS) {
        for (const item of generateAuthored("k4-shape-compose", step, seed)) {
          const m = /^Bangun datar disusun dari ([\d.]+) persegi dengan panjang sisi ([\d.]+) cm\. Berapa luas seluruh bangun\?$/.exec(
            item.prompt,
          );
          expect(m !== null, `compose prompt format: ${item.prompt}`).toBe(true);
          if (!m) continue;
          const pieces = Number(m[1]!.replace(/\./g, ""));
          const s = Number(m[2]!.replace(/\./g, ""));
          expect(pieces).toBe(authoredPieces);
          const area = pieces * s * s;
          expect(area, `compose area ${area} over authored max ${authoredMax}`).toBeLessThanOrEqual(
            authoredMax,
          );
          expect(item.answer).toEqual({ kind: "unitValue", value: area, unit: "cm²" });
        }
      }
    }
  });

  it("k4-pictogram and k4-bar-chart honor the authored maxRows per step", () => {
    for (const skillId of ["k4-pictogram", "k4-bar-chart"]) {
      const spec = getSkillSpec(skillId);
      for (let step = 1; step <= spec.steps.length; step++) {
        const authored = spec.steps[step - 1]!.params as { maxRows: number };
        for (const seed of SEEDS) {
          const items = generateAuthored(skillId, step, seed);
          for (const item of items) {
            const pairs = item.prompt.match(/[a-z]+ \d+ (?:kg|buah)/g) ?? [];
            expect(pairs.length).toBe(authored.maxRows);
          }
        }
      }
    }
  });
});

describe("full authored graph through the server path", () => {
  it("every authored (skill, step, seed) generates family-verified items", () => {
    for (const spec of SKILL_SPECS) {
      for (let step = 1; step <= spec.steps.length; step++) {
        for (const seed of SEEDS) {
          const items = generateAuthored(spec.id, step, seed);
          expect(items.length, `${spec.id} step ${step}`).toBe(
            (spec.steps[step - 1]!.params as { itemCount: number }).itemCount,
          );
          for (const item of items) {
            try {
              verifyFamilyItem(spec.family, item);
            } catch (error) {
              throw new Error(
                `${spec.id} step ${step} seed ${seed}: ${(error as Error).message}\nprompt: ${item.prompt}`,
              );
            }
          }
        }
      }
    }
  });

  it("every generated CPA hint passes the client normalizer (renders at runtime)", () => {
    let hintsChecked = 0;
    for (const spec of SKILL_SPECS) {
      for (let step = 1; step <= spec.steps.length; step++) {
        for (const seed of SEEDS) {
          for (const item of generateAuthored(spec.id, step, seed)) {
            if (!item.hint) continue;
            hintsChecked++;
            expect(
              normalizeHint(item.hint.model, item.hint.payload),
              `${spec.id} step ${step} seed ${seed} hint not renderable: ${JSON.stringify(item.hint)}`,
            ).not.toBeNull();
          }
        }
      }
    }
    // The CPA layer must be substantially alive, not trivially empty.
    expect(hintsChecked).toBeGreaterThan(1000);
  });
});
