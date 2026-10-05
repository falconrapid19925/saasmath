/**
 * Fail-fast readers for family-specific StepParams entries (contract note in
 * src/lib/engine/types.ts: "Generator families read what they need and should
 * fail fast on missing keys rather than guessing defaults").
 *
 * Every family REQUIRES params.itemCount. All other keys have a documented
 * default per family (declared in code, listed in the family's JSDoc) — a
 * missing optional key is not a silent guess, it resolves to the family's
 * declared default; a missing required key or a wrong-typed value throws with
 * the family id and key name so content authoring mistakes surface loudly.
 */

import type { Rng } from "./rng";
import type { StepParams } from "./types";

function fail(familyId: string, key: string, why: string): never {
  throw new Error(`params: family "${familyId}" key "${key}" ${why}`);
}

/** Required: number of items to generate, integer >= 1. */
export function pItemCount(params: StepParams["params"], familyId: string): number {
  const raw = params.itemCount;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) {
    fail(familyId, "itemCount", "is required and must be an integer >= 1");
  }
  return raw;
}

export function pInt(
  params: StepParams["params"],
  key: string,
  familyId: string,
  fallback?: number,
): number {
  const raw = params[key];
  if (raw === undefined) {
    if (fallback === undefined) fail(familyId, key, "is required");
    return fallback;
  }
  if (typeof raw !== "number" || !Number.isInteger(raw)) {
    fail(familyId, key, "must be an integer");
  }
  return raw;
}

export function pNum(
  params: StepParams["params"],
  key: string,
  familyId: string,
  fallback?: number,
): number {
  const raw = params[key];
  if (raw === undefined) {
    if (fallback === undefined) fail(familyId, key, "is required");
    return fallback;
  }
  if (typeof raw !== "number" || Number.isNaN(raw)) {
    fail(familyId, key, "must be a number");
  }
  return raw;
}

export function pBool(
  params: StepParams["params"],
  key: string,
  familyId: string,
  fallback?: boolean,
): boolean {
  const raw = params[key];
  if (raw === undefined) {
    if (fallback === undefined) fail(familyId, key, "is required");
    return fallback;
  }
  if (typeof raw !== "boolean") fail(familyId, key, "must be a boolean");
  return raw;
}

export function pStr(
  params: StepParams["params"],
  key: string,
  familyId: string,
  fallback?: string,
): string {
  const raw = params[key];
  if (raw === undefined) {
    if (fallback === undefined) fail(familyId, key, "is required");
    return fallback;
  }
  if (typeof raw !== "string") fail(familyId, key, "must be a string");
  return raw;
}

/** One of `allowed` string values (fail-fast enum reader with fallback). */
export function pEnum<T extends string>(
  params: StepParams["params"],
  key: string,
  familyId: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = params[key];
  if (raw === undefined) return fallback;
  if (typeof raw !== "string" || !(allowed as readonly string[]).includes(raw)) {
    fail(familyId, key, `must be one of: ${allowed.join(", ")}`);
  }
  return raw as T;
}

/**
 * Array of kind strings (e.g. ["add", "sub"]). Empty or non-array throws.
 * With `allowed` set, members outside it throw — catches typos in authored
 * content early.
 */
export function pKinds<T extends string>(
  params: StepParams["params"],
  key: string,
  familyId: string,
  allowed: readonly T[],
  fallback: readonly T[],
): T[] {
  const raw = params[key];
  let list: unknown[];
  if (raw === undefined) {
    list = [...fallback];
  } else if (Array.isArray(raw) && raw.every((x) => typeof x === "string")) {
    list = raw;
  } else {
    fail(familyId, key, "must be an array of strings");
  }
  if (list.length === 0) fail(familyId, key, "must not be empty");
  const allowedSet = new Set<string>(allowed);
  for (const k of list) {
    if (!allowedSet.has(k as string)) {
      fail(
        familyId,
        key,
        `contains "${String(k)}"; allowed: ${allowed.join(", ")}`,
      );
    }
  }
  return list as T[];
}

/** Uniform integer in [min, max] (inclusive), both bounds enforced. */
export function intIn(rng: Rng, min: number, max: number): number {
  if (max < min) throw new Error(`intIn: max ${max} < min ${min}`);
  return rng.int(min, max);
}

/**
 * Draw `count` distinct values from [min, max] via partial Fisher-Yates on a
 * full range array. Throws when the range is too small.
 */
export function distinctIn(rng: Rng, min: number, max: number, count: number): number[] {
  if (count > max - min + 1) {
    throw new Error(`distinctIn: cannot draw ${count} distinct from [${min}, ${max}]`);
  }
  const pool: number[] = [];
  for (let v = min; v <= max; v++) pool.push(v);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const j = rng.int(i, pool.length - 1);
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
    out.push(pool[i] as number);
  }
  return out;
}
