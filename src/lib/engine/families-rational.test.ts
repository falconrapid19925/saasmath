/**
 * Engine-seam tests for the fractions family's authored-parameter support
 * (audit finding 10): the authored denominators list, maxWhole bound, and
 * requireSimplify flag must reach the generators at the family's public
 * generate(stepParams, rng) boundary. Authored-content wiring is probed in
 * src/lib/server/family-params.test.ts through the real server path.
 */

import { describe, expect, it } from "vitest";

import { gcd } from "./answers";
import { getFamily, registerBuiltinFamilies } from "./families";
import { createRng } from "./rng";
import type { Item } from "./types";
import { verifyFamilyItem } from "../../../tests/helpers/verifyItem";

function generate(params: Record<string, unknown>, seed: number): Item[] {
  registerBuiltinFamilies();
  const fam = getFamily("fractions");
  if (!fam) throw new Error("family fractions missing");
  return fam.generate({ step: 1, params }, createRng(seed));
}

describe("fractions authored denominators (finding 10)", () => {
  it("draws denominators only from the authored list", () => {
    const denoms = [3, 5, 6];
    for (const seed of [1, 7, 123]) {
      for (const kind of ["compare", "addSame", "subSame", "addDiff", "multWhole"]) {
        for (const item of generate(
          { itemCount: 10, kinds: [kind], maxDen: 10, denominators: denoms },
          seed,
        )) {
          const dens = [...item.prompt.matchAll(/(\d+)\/(\d+)/g)].map((m) => Number(m[2]));
          expect(dens.length > 0, `no fraction in prompt: ${item.prompt}`).toBe(true);
          for (const d of dens) {
            expect(denoms.includes(d), `denominator ${d} outside authored set: ${item.prompt}`).toBe(
              true,
            );
          }
          verifyFamilyItem("fractions", item);
        }
      }
    }
  });

  it("falls back to the full 2..maxDen range when no list is authored", () => {
    for (const seed of [1, 7, 123]) {
      for (const item of generate({ itemCount: 10, kinds: ["compare"], maxDen: 8 }, seed)) {
        for (const m of item.prompt.matchAll(/(\d+)\/(\d+)/g)) {
          const d = Number(m[2]);
          expect(d >= 2 && d <= 8, `denominator ${d} outside 2..maxDen`).toBe(true);
        }
      }
    }
  });
});

describe("fractions maxWhole (finding 10)", () => {
  it("bounds the whole operand of mult/div-by-whole items", () => {
    for (const seed of [1, 7, 123]) {
      for (const kind of ["multWhole", "divWhole"] as const) {
        for (const item of generate(
          { itemCount: 10, kinds: [kind], maxDen: 8, maxWhole: 3 },
          seed,
        )) {
          const m = /^(\d+)\/(\d+) ([×:]) (\d+) = \.\.\.$/.exec(item.prompt);
          expect(m !== null, `prompt format: ${item.prompt}`).toBe(true);
          if (!m) continue;
          const k = Number(m[4]);
          expect(k >= 2 && k <= 3, `whole operand ${k} outside 2..maxWhole(3)`).toBe(true);
          verifyFamilyItem("fractions", item);
        }
      }
    }
  });
});

describe("fractions requireSimplify (finding 10)", () => {
  it("serves same-denominator answers in lowest terms when required", () => {
    for (const seed of [1, 7, 123]) {
      for (const kind of ["addSame", "subSame"] as const) {
        for (const item of generate(
          { itemCount: 10, kinds: [kind], maxDen: 8, requireSimplify: true },
          seed,
        )) {
          const m = /^(\d+)\/(\d+) ([+-]) (\d+)\/(\d+) = \.\.\.$/.exec(item.prompt);
          expect(m !== null, `prompt format: ${item.prompt}`).toBe(true);
          if (!m) continue;
          const n1 = Number(m[1]);
          const d1 = Number(m[2]);
          const n2 = Number(m[4]);
          const d2 = Number(m[5]);
          const expected = m[3] === "+" ? (n1 * d2 + n2 * d1) / (d1 * d2) : (n1 * d2 - n2 * d1) / (d1 * d2);
          expect(item.answer.kind === "fraction", `answer kind: ${item.prompt}`).toBe(true);
          if (item.answer.kind !== "fraction") continue;
          expect(gcd(item.answer.n, item.answer.d), `answer not simplified: ${item.prompt}`).toBe(1);
          expect(Math.abs(item.answer.n / item.answer.d - expected)).toBeLessThan(1e-9);
        }
      }
    }
  });

  it("keeps the working denominator by default (1/4 + 1/4 -> 4/4 style)", () => {
    let sawUnreduced = false;
    for (const seed of [1, 7, 123]) {
      for (const item of generate(
        { itemCount: 10, kinds: ["addSame"], maxDen: 4, denominators: [4] },
        seed,
      )) {
        const m = /^(\d+)\/(\d+) \+ (\d+)\/(\d+) = \.\.\.$/.exec(item.prompt);
        expect(m !== null, `prompt format: ${item.prompt}`).toBe(true);
        if (!m) continue;
        expect(item.answer.kind === "fraction").toBe(true);
        if (item.answer.kind !== "fraction") continue;
        expect(item.answer.d).toBe(4);
        sawUnreduced = sawUnreduced || item.answer.n % 2 === 0;
      }
    }
    expect(sawUnreduced, "no unreduced same-denominator answer in the default draws").toBe(true);
  });
});
