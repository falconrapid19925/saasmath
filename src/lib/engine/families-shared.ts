/**
 * Shared mechanical helpers for the generator-family implementations:
 * item assembly with prompt dedupe, multiple-choice distractors, and the CPA
 * hint payload constructors (plan section 3.2 for the five models).
 *
 * The per-model payload schemas are OWNED by the CPA/UI builder
 * (src/lib/client/hints.ts) — these constructors emit exactly those shapes so
 * every engine hint passes normalizeHint and renders (hint payloads that do
 * not conform render the "belum tersedia" fallback, which is a dead CPA
 * layer). Constructors return undefined when the client schema cannot express
 * the model (the item then simply has no hint).
 *
 * Payload schemas emitted (client hints.ts):
 * - part-whole: { kind, total: number|null, parts: (number|null)[], caption? }
 *   — exactly one null across total/parts (enforced by call-site shapes).
 * - fraction-bar: { wholes: 1-4, partsPerWhole: 1-12, shadedParts: number|null }
 *   — null = the child shades interactively.
 * - number-line: { kind, min, max, stepValue, marks: (number|null)[],
 *   caption? } — stepValue snapped so (max-min)/stepValue stays in 2..40
 *   ticks.
 * - base-ten: { kind, variant: "blocks", thousands, hundreds, tens, ones }
 *   — blocks always visualize a KNOWN quantity (never the answer).
 */

import type { Rng } from "./rng";
import type { Answer, HintModel, Item, ItemHint, StepParams } from "./types";

import { answerKey, formatInt, int } from "./answers";

/** Placeholder item id; generateSet() rewrites ids canonically. */
export function placeholderId(step: number, index: number): string {
  return `f-s${step}-${index}`;
}

/**
 * Build `count` items, redrawing (deterministically, from the same rng) when a
 * prompt repeats. The redraw loop is bounded so tiny parameter universes
 * cannot hang a set; a repeat may survive after 40 tries and is then accepted.
 */
export function buildItems(
  stepParams: StepParams,
  count: number,
  make: (index: number) => Item,
): Item[] {
  const seen = new Set<string>();
  const items: Item[] = [];
  for (let i = 0; i < count; i++) {
    let item = make(i);
    let tries = 0;
    while (seen.has(item.prompt) && tries < 40) {
      item = make(i);
      tries++;
    }
    seen.add(item.prompt);
    items.push({ ...item, id: placeholderId(stepParams.step, i) });
  }
  return items;
}

/**
 * Draw with a bounded rejection loop. `ok` guards mathematical constraints
 * (e.g. regrouping required); after `tries` rejections this throws so bad
 * parameter combos (unsatisfiable ranges) fail loudly instead of looping.
 */
export function drawWithRetry<T>(tries: number, ok: (t: T) => boolean, draw: () => T): T {
  for (let i = 0; i < tries; i++) {
    const t = draw();
    if (ok(t)) return t;
  }
  throw new Error(`drawWithRetry: no valid draw after ${tries} tries — check the step params`);
}

// ---------------------------------------------------------------------------
// Multiple-choice distractors
// ---------------------------------------------------------------------------

/**
 * 4-option shuffle for an integer answer: up to 3 preferred distractors
 * (deduped, kept >= 0), padded with answer +/- k; the answer is included.
 */
export function intChoices(rng: Rng, answer: number, preferred: number[]): Answer[] {
  const seen = new Set<number>([answer]);
  const picked: number[] = [];
  for (const c of preferred) {
    if (picked.length >= 3) break;
    if (Number.isInteger(c) && c >= 0 && !seen.has(c)) {
      seen.add(c);
      picked.push(c);
    }
  }
  let k = 1;
  while (picked.length < 3 && k < 100) {
    for (const d of [answer + k, answer - k]) {
      if (picked.length >= 3) break;
      if (Number.isInteger(d) && d >= 0 && !seen.has(d)) {
        seen.add(d);
        picked.push(d);
      }
    }
    k++;
  }
  return rng.shuffle([...picked.map(int), int(answer)]);
}

/** Two-option shuffle for compare items ("which is larger/smaller"). */
export function pairChoices(rng: Rng, a: Answer, b: Answer): Answer[] {
  return rng.shuffle([a, b]);
}

/** True when all choices are distinct under the canonical answer key. */
export function choicesDistinct(choices: Answer[]): boolean {
  const keys = choices.map(answerKey);
  return new Set(keys).size === keys.length;
}

// ---------------------------------------------------------------------------
// Hint payload constructors (client-owned schemas; see the file header)
// ---------------------------------------------------------------------------

function hint(model: HintModel, payload: Record<string, unknown>): ItemHint {
  return { model, payload };
}

/** Part-whole bars: exactly one null across total/parts marks the unknown. */
export function partWholeHint(
  whole: number | null,
  parts: (number | null)[],
  labels: string[],
): ItemHint {
  return hint("part-whole", {
    kind: "part-whole",
    total: whole,
    parts,
    caption: labels.length > 0 ? labels.join(" · ") : undefined,
  });
}

/**
 * Fraction bars (client schema: wholes/partsPerWhole/shadedParts). Returns
 * undefined when the fraction pair cannot be shown honestly in a single
 * partsPerWhole bar (mixed denominators beyond the lcm cap, compare items).
 * `whole` carries the whole-number operand of x/: by whole numbers.
 */
export function fractionBarHint(
  op: string,
  a: { n: number | null; d: number },
  b: { n: number | null; d: number } | null = null,
  whole: number | null = null,
): ItemHint | undefined {
  const maxPpw = 12;
  const bar = (wholes: number, partsPerWhole: number, shadedParts: number | null): ItemHint | undefined =>
    partsPerWhole >= 1 && partsPerWhole <= maxPpw
      ? hint("fraction-bar", { kind: "fraction-bar", wholes, partsPerWhole, shadedParts })
      : undefined;

  if (op === "mult" || op === "div") {
    const k = whole ?? 0;
    if (k < 1) return undefined;
    // mult: k wholes, the first one shaded with a -> fill the rest.
    if (op === "mult") return k <= 4 ? bar(k, a.d, a.n) : undefined;
    // div: one bar split into d*k parts; the child shades k equal groups.
    return bar(1, a.d * k, null);
  }
  if (op === "equiv" || op === "simplify") {
    // b.d (equiv) or a.d (simplify) is the target denominator to shade into.
    const target = b !== null ? (b.d as number) : a.d;
    return bar(1, target, null);
  }
  if (op === "toDecimal") {
    // n/10 shades directly; n/100 exceeds the parts-per-whole cap.
    return bar(1, a.d, a.d <= maxPpw ? a.n : null);
  }
  if (b === null) return undefined;
  if (a.d === b.d) {
    // Same-denominator add/sub: shade the first operand.
    return op === "add" ? bar(2, a.d, a.n) : bar(1, a.d, a.n);
  }
  // Different denominators: a common bar only when the lcm is renderable,
  // shading left interactive (the child finds the common pieces).
  const gcdv = gcdOf(a.d, b.d);
  const lcm = (a.d * b.d) / gcdv;
  return bar(1, lcm, null);
}

function gcdOf(x: number, y: number): number {
  let a = Math.abs(x);
  let b = Math.abs(y);
  while (b !== 0) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

/**
 * Number line. The client schema needs a finite stepValue with a 2..40 tick
 * count, so a null/oversized engine step is snapped to a nice 1/2/5-decade
 * value targeting ~10 ticks.
 */
export function numberLineHint(payload: {
  min: number;
  max: number;
  step: number | null;
  marks: number[];
  marksB?: number[] | null;
  jump?: number | null;
  target: number | null;
}): ItemHint {
  return hint("number-line", {
    kind: "number-line",
    min: payload.min,
    max: payload.max,
    stepValue: numberLineStepValue(payload.min, payload.max, payload.step),
    marks: payload.marks,
    caption:
      payload.jump !== null && payload.jump !== undefined
        ? `Lompatan sebesar ${formatInt(payload.jump)} dari marka pertama.`
        : undefined,
  });
}

function numberLineStepValue(min: number, max: number, step: number | null): number {
  const span = max - min;
  if (span <= 0) throw new Error("numberLineHint: max must be > min");
  if (step !== null && Number.isFinite(step) && step > 0) {
    const ticks = Math.round(span / step);
    if (ticks >= 2 && ticks <= 40) return step;
  }
  const raw = span / 10;
  const mag = 10 ** Math.floor(Math.log10(raw));
  let nice = mag;
  for (const m of [2, 5, 10]) {
    if (mag * m <= raw) nice = mag * m;
  }
  while (Math.round(span / nice) > 40) nice *= 2;
  while (Math.round(span / nice) < 2) nice /= 10;
  return nice;
}

/**
 * Base-ten blocks. The client schema supports "blocks" (a 4-digit place
 * decomposition) and "array" (exactly one unknown dimension); richer engine
 * variants map onto blocks of a KNOWN quantity (never the answer) or are
 * dropped (undefined) when not expressible.
 */
export function baseTenHint(payload: {
  variant: "array" | "equalGroups" | "hundredthsChart" | "placeValue" | "areaModel" | "factorPairs";
  rows?: number;
  cols?: number;
  groups?: number;
  perGroup?: number | null;
  total?: number | null;
  remainder?: number | null;
  unknown?: string;
  shaded?: number;
  shaded2?: number | null;
  op?: string;
  number?: number;
  digit?: number | null;
  place?: number | null;
  aParts?: number[];
  bParts?: number[];
  b?: number | null;
  n?: number;
  n2?: number | null;
}): ItemHint | undefined {
  let known: number | null = null;
  switch (payload.variant) {
    case "array":
      // Fully-known arrays cannot be expressed (client requires exactly one
      // unknown dimension) — no hint rather than a misleading one.
      return undefined;
    case "equalGroups":
      known = payload.total ?? payload.perGroup ?? null;
      break;
    case "hundredthsChart":
      // Compare answers may legitimately equal an operand — drop the hint
      // there; add/sub visualize the first operand.
      if (payload.op === "compare") return undefined;
      known = payload.shaded ?? null;
      break;
    case "placeValue":
      // digit+place both null is the compose shape — there `number` IS the
      // answer, so no honest blocks hint exists.
      if (payload.digit === null && payload.place === null) return undefined;
      known =
        payload.number !== undefined && Number.isInteger(payload.number)
          ? payload.number
          : null;
      break;
    case "areaModel":
      known = payload.aParts ? payload.aParts.reduce((acc, v) => acc + v, 0) : null;
      break;
    case "factorPairs":
      known = Math.max(payload.n ?? 0, payload.n2 ?? payload.n ?? 0) || null;
      break;
  }
  if (known === null || !Number.isFinite(known) || known < 0 || known > 9999) {
    return undefined;
  }
  return hint("base-ten", {
    kind: "base-ten",
    variant: "blocks",
    thousands: Math.floor(known / 1000),
    hundreds: Math.floor(known / 100) % 10,
    tens: Math.floor(known / 10) % 10,
    ones: known % 10,
  });
}

/** Guard used by property tests: every numeric leaf must be finite. */
export function hasFiniteNumbers(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(hasFiniteNumbers);
  if (value !== null && typeof value === "object") {
    return Object.values(value).every(hasFiniteNumbers);
  }
  return true;
}

export { formatInt };
