import { describe, expect, it } from "vitest";

import { createRng, setSeed } from "./rng";

describe("createRng determinism", () => {
  it("produces the identical sequence for the same numeric seed", () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("produces the identical sequence for the same string seed", () => {
    const a = createRng("k4-mult-1digit:2:99");
    const b = createRng("k4-mult-1digit:2:99");
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("differs for different seeds", () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it("setSeed derives a stable number from a (skill, step, seed) triple", () => {
    const first = setSeed("k4-add-regroup", 1, 42);
    const second = setSeed("k4-add-regroup", 1, 42);
    expect(first).toBe(second);
    expect(typeof first).toBe("number");
    // A different triple must (with overwhelming probability) hash elsewhere.
    expect(first).not.toBe(setSeed("k4-add-regroup", 1, 43));
    expect(first).not.toBe(setSeed("k4-add-regroup", 2, 42));
  });
});

describe("rng helpers", () => {
  it("next() stays in [0, 1)", () => {
    const rng = createRng(7);
    const values = Array.from({ length: 1000 }, () => rng.next());
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("int() covers [min, max] inclusively and stays in bounds", () => {
    const rng = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = rng.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6, 7]);
  });

  it("pick() returns a member and rejects empty input", () => {
    const rng = createRng(7);
    const items = ["a", "b", "c"] as const;
    for (let i = 0; i < 50; i++) {
      expect(items).toContain(rng.pick(items));
    }
    expect(() => rng.pick([])).toThrow(/empty/);
  });

  it("shuffle() is a permutation and does not mutate the input", () => {
    const rng = createRng(7);
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const snapshot = [...input];
    const out = rng.shuffle(input);
    expect(input).toEqual(snapshot);
    expect([...out].sort((a, b) => a - b)).toEqual(snapshot);
  });
});
