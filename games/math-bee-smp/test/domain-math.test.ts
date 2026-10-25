import test from "node:test";
import assert from "node:assert/strict";
import {
  MathInputError,
  generateQuestion,
  isCorrect,
  normalizeAnswer,
  parseAnswer,
} from "../src/game/math.ts";

test("exactly equivalent fractions and finite decimals grade the same", () => {
  for (const value of ["1/2", "2/4", "0,5", "0.5", ".5", "0002/0004", " 1 / 2 "]) {
    assert.equal(normalizeAnswer(value), "1/2");
    assert.equal(isCorrect(value, "1/2"), true);
  }
  assert.equal(isCorrect("0,3333", "1/3"), false);
  assert.equal(isCorrect("0.1", "1/10"), true);
});

test("negative, zero, Unicode minus, and improper fractions normalize exactly", () => {
  for (const value of ["-1/2", "-2/4", "−0,5"]) assert.equal(normalizeAnswer(value), "-1/2");
  for (const value of ["0", "-0", "0/7", "0,000"]) assert.equal(normalizeAnswer(value), "0");
  assert.equal(normalizeAnswer("3/2"), "3/2");
  assert.equal(normalizeAnswer("1,5"), "3/2");
  assert.deepEqual(parseAnswer("-4/6"), { numerator: -2n, denominator: 3n });
});

test("malformed or executable input is rejected without coercion", () => {
  for (const value of [
    "", " ", "1/0", "NaN", "Infinity", "-Infinity", "1+1", "1e2", "1 1/2", "2 m",
    "50%", "1,000.5", "1/2abc", "1/-2", "--2", "1/2/3", "1.", "+2", "1 2",
    "alert(1)", "<script>1</script>", "1".repeat(65), "1234567890123", "0.1234567890123",
    1, null, {}, undefined,
  ]) {
    assert.throws(() => parseAnswer(value), MathInputError, String(value));
  }
});

test("bounded twelve-digit operands still use exact arithmetic", () => {
  assert.equal(normalizeAnswer("999999999999/333333333333"), "3");
  assert.equal(normalizeAnswer("0.00000000001"), "1/100000000000");
});

test("question generation is deterministic and JSON serializable", () => {
  for (let round = 1; round <= 4; round++) {
    const first = generateQuestion(round, "match-1-turn-2");
    assert.deepEqual(first, generateQuestion(round, "match-1-turn-2"));
    assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
    assert.notEqual(first.id, generateQuestion(round, "match-1-turn-3").id);
    assert.equal(first.round, round);
  }
});

/** Independent integer-fraction oracle: no calls to the production solver/parser. */
function expectedFraction(question: ReturnType<typeof generateQuestion>): [bigint, bigint] {
  const p = question.parameters;
  switch (question.templateId) {
    case "integer-add.v1": return [BigInt(p.a + p.b), 1n];
    case "integer-subtract.v1": return [BigInt(p.a - p.b), 1n];
    case "order-add-product.v1": return [BigInt(p.a + p.b * p.c), 1n];
    case "order-subtract-product.v1": return [BigInt(p.a - p.b * p.c), 1n];
    case "fraction-add.v1": return [BigInt(p.a + p.b), BigInt(p.denominator)];
    case "fraction-subtract.v1": return [BigInt(p.a - p.b), BigInt(p.denominator)];
    case "story-ribbon.v1":
    case "story-juice.v1": return [BigInt(p.whole) * BigInt(p.denominator) - BigInt(p.a) - BigInt(p.b), BigInt(p.denominator)];
    default: throw new Error(`No independent oracle for ${question.templateId}`);
  }
}

test("all template families and bounded variations agree with an independent rational oracle", () => {
  const families = new Set<string>();
  for (let round = 1; round <= 4; round++) {
    for (let seed = 0; seed < 200; seed++) {
      const question = generateQuestion(round, seed);
      families.add(question.templateId);
      const [expectedN, expectedD] = expectedFraction(question);
      const [actualN, actualD = "1"] = question.expected.split("/");
      assert.equal(BigInt(actualN) * expectedD, expectedN * BigInt(actualD), question.id);
      assert.ok(BigInt(actualD) > 0n);
      assert.ok(question.steps.length >= 1 && question.steps.length <= 2);
      assert.ok(question.steps.join(" ").includes(question.expected));
      assert.ok(question.prompt.length < 180);
      assert.ok(!question.prompt.includes("undefined"));
      if (round >= 3) assert.ok(question.parameters.denominator >= 3);
      if (round === 4) assert.ok(expectedN > 0n);
    }
  }
  assert.equal(families.size, 8);
});

test("invalid generation inputs fail explicitly", () => {
  for (const round of [0, -1, 5, 1.5, NaN]) assert.throws(() => generateQuestion(round, "seed"));
  assert.throws(() => generateQuestion(1, Infinity));
});
