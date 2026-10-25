/** Exact, bounded arithmetic for the authoritative game server. */
export interface Rational {
  numerator: bigint;
  denominator: bigint;
}

export class MathInputError extends Error {
  constructor(message = "Tulis angka, desimal, atau pecahan seperti 1/2.") {
    super(message);
    this.name = "MathInputError";
  }
}

export interface Question {
  id: string;
  prompt: string;
  topic: string;
  difficulty: string;
  round: number;
  expected: string;
  steps: string[];
  templateId: string;
  /** Kept server-side; these make template validation independently reproducible. */
  parameters: Record<string, number>;
}

export const ANSWER_MAX_LENGTH = 64;
export const ANSWER_MAX_DIGITS = 12;

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function rational(numerator: bigint, denominator = 1n): Rational {
  if (denominator === 0n) throw new MathInputError("Penyebut pecahan tidak boleh nol.");
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const divisor = gcd(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

function printRational(value: Rational): string {
  return value.denominator === 1n
    ? value.numerator.toString()
    : `${value.numerator}/${value.denominator}`;
}

function checkDigits(value: string): void {
  if (value.replace(/\D/g, "").length > ANSWER_MAX_DIGITS) {
    throw new MathInputError(`Gunakan paling banyak ${ANSWER_MAX_DIGITS} digit.`);
  }
}

/**
 * Accepted grammar: integer, decimal with comma/dot, or integer/positive integer.
 * Trims the ends and spaces around /. No expressions, exponent, grouping, or units.
 * A finite decimal is exact; it is never a rounding tolerance for a repeating fraction.
 */
export function parseAnswer(raw: unknown): Rational {
  if (typeof raw !== "string" || raw.length > ANSWER_MAX_LENGTH) {
    throw new MathInputError("Jawaban terlalu panjang atau formatnya tidak valid.");
  }
  const value = raw.trim().replace(/\u2212/g, "-").replace(/\s*\/\s*/g, "/");
  if (!value) throw new MathInputError("Isi jawabanmu terlebih dahulu.");

  if (/^-?\d+$/.test(value)) {
    checkDigits(value);
    return rational(BigInt(value));
  }

  const fraction = /^(-?\d+)\/(\d+)$/.exec(value);
  if (fraction) {
    checkDigits(fraction[1]);
    checkDigits(fraction[2]);
    return rational(BigInt(fraction[1]), BigInt(fraction[2]));
  }

  const decimal = /^(-?)(\d*)[.,](\d+)$/.exec(value);
  if (decimal) {
    checkDigits(`${decimal[2]}${decimal[3]}`);
    const denominator = 10n ** BigInt(decimal[3].length);
    const unsigned = BigInt(`${decimal[2] || "0"}${decimal[3]}`);
    return rational(decimal[1] ? -unsigned : unsigned, denominator);
  }

  throw new MathInputError();
}

export function normalizeAnswer(raw: unknown): string {
  return printRational(parseAnswer(raw));
}

export function isCorrect(raw: string, expected: string): boolean {
  const actual = parseAnswer(raw);
  const correct = parseAnswer(expected);
  return actual.numerator === correct.numerator && actual.denominator === correct.denominator;
}

function hash(value: string): number {
  let state = 2166136261;
  for (let i = 0; i < value.length; i++) {
    state = Math.imul(state ^ value.charCodeAt(i), 16777619);
  }
  return state >>> 0;
}

function seededRandom(seed: string): () => number {
  let state = hash(seed);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function answer(numerator: number, denominator = 1): string {
  return printRational(rational(BigInt(numerator), BigInt(denominator)));
}

function signed(value: number): string {
  return value < 0 ? `(${value})` : String(value);
}

const DIFFICULTIES = ["Pemanasan", "Tantangan", "Pecahan", "Final"] as const;

/**
 * Deterministic v1 template bank. Round variants preserve an operation-count band.
 * Every returned question is JSON serializable and must stay on the server until
 * the caller projects an explicitly public question view.
 */
export function generateQuestion(round: number, seed: string | number): Question {
  if (!Number.isInteger(round) || round < 1 || round > 4) {
    throw new RangeError("Ronde soal harus antara 1 dan 4.");
  }
  if ((typeof seed !== "string" && typeof seed !== "number") ||
      (typeof seed === "number" && !Number.isFinite(seed))) {
    throw new TypeError("Seed soal tidak valid.");
  }
  const key = `math-bee:v1:${round}:${seed}`;
  const rand = seededRandom(key);
  const integer = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const variant = integer(0, 1);
  const base = {
    id: `q${round}-${hash(key).toString(36)}`,
    round,
    difficulty: DIFFICULTIES[round - 1],
  };

  if (round === 1) {
    const a = integer(-15, 25);
    const b = integer(2, 18);
    const result = variant === 0 ? a + b : a - b;
    const operator = variant === 0 ? "+" : "−";
    return {
      ...base,
      templateId: variant === 0 ? "integer-add.v1" : "integer-subtract.v1",
      topic: "Bilangan bulat",
      parameters: { a, b },
      prompt: `${a} ${operator} ${b} = ?`,
      expected: answer(result),
      steps: [`${a} ${operator} ${b} = ${result}`],
    };
  }

  if (round === 2) {
    const a = integer(-15, 15);
    const b = integer(2, 7);
    const c = integer(2, 6);
    const product = b * c;
    const result = variant === 0 ? a + product : a - product;
    const operator = variant === 0 ? "+" : "−";
    return {
      ...base,
      templateId: variant === 0 ? "order-add-product.v1" : "order-subtract-product.v1",
      topic: "Urutan operasi",
      parameters: { a, b, c },
      prompt: `${signed(a)} ${operator} ${b} × ${c} = ?`,
      expected: answer(result),
      steps: [`Kerjakan perkalian: ${b} × ${c} = ${product}.`, `${a} ${operator} ${product} = ${result}`],
    };
  }

  if (round === 3) {
    const denominator = integer(3, 10);
    const a = integer(1, denominator - 1);
    const b = integer(1, denominator - 1);
    const numerator = variant === 0 ? a + b : a - b;
    const operator = variant === 0 ? "+" : "−";
    const expected = answer(numerator, denominator);
    return {
      ...base,
      templateId: variant === 0 ? "fraction-add.v1" : "fraction-subtract.v1",
      topic: "Pecahan",
      parameters: { a, b, denominator },
      prompt: `${a}/${denominator} ${operator} ${b}/${denominator} = ?`,
      expected,
      steps: [`Penyebut sama: (${a} ${operator} ${b})/${denominator} = ${numerator}/${denominator}.`, `Hasil sederhananya ${expected}.`],
    };
  }

  const whole = integer(2, 5);
  const denominator = integer(3, 8);
  const a = integer(1, denominator - 1);
  const b = integer(1, denominator - 1);
  const used = a + b;
  const numerator = whole * denominator - used;
  const expected = answer(numerator, denominator);
  const prompt = variant === 0
    ? `Rani punya ${whole} m pita. Ia memakai ${a}/${denominator} m lalu ${b}/${denominator} m. Berapa meter pita yang tersisa?`
    : `Teko berisi ${whole} liter jus. Dituang ${a}/${denominator} liter lalu ${b}/${denominator} liter. Berapa liter jus yang tersisa?`;
  return {
    ...base,
    templateId: variant === 0 ? "story-ribbon.v1" : "story-juice.v1",
    topic: "Soal cerita pecahan",
    parameters: { whole, a, b, denominator },
    prompt,
    expected,
    steps: [`Terpakai (${a} + ${b})/${denominator} = ${used}/${denominator}.`, `Sisa ${whole} − ${used}/${denominator} = ${expected}.`],
  };
}
