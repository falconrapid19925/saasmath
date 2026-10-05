/**
 * Seeded PRNG for the drill engine: xmur3 string hash feeding mulberry32.
 * A (skillId, step, seed) triple always regenerates the identical item set —
 * generators must take their Rng from createRng/setSeed, never Math.random().
 */

/** Stream of floats in [0, 1). */
export type Rng = {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  /** Uniform pick from a non-empty array. Throws on empty input. */
  pick<T>(items: readonly T[]): T;
  /** Fisher-Yates copy; the input array is not mutated. */
  shuffle<T>(items: readonly T[]): T[];
};

/** xmur3: 32-bit string hash producing a seed factory. */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** mulberry32: tiny, fast, good-enough PRNG with a 2^32 period. */
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Canonical numeric seed for a generated set. Call sites that persist seeds
 * (attempts.seed) store this number; the server hands it back and the client
 * regenerates the identical set offline.
 */
export function setSeed(skillId: string, step: number, seed: number): number {
  return xmur3(`${skillId}:${step}:${seed}`)();
}

/**
 * Build an Rng from a numeric seed (e.g. from setSeed or attempts.seed) or a
 * string seed. Same input, same sequence — guaranteed.
 */
export function createRng(seed: number | string): Rng {
  const nextFloat = mulberry32(
    typeof seed === "number" ? seed >>> 0 : xmur3(seed)(),
  );

  const rng: Rng = {
    next: nextFloat,

    int(min: number, max: number): number {
      if (max < min) {
        throw new Error(`rng.int: max (${max}) < min (${min})`);
      }
      return Math.floor(nextFloat() * (max - min + 1)) + min;
    },

    pick<T>(items: readonly T[]): T {
      if (items.length === 0) {
        throw new Error("rng.pick: empty array");
      }
      return items[Math.floor(nextFloat() * items.length)] as T;
    },

    shuffle<T>(items: readonly T[]): T[] {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(nextFloat() * (i + 1));
        const a = out[i] as T;
        const b = out[j] as T;
        out[i] = b;
        out[j] = a;
      }
      return out;
    },
  };

  return rng;
}
